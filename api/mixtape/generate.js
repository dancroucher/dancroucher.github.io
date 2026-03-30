// POST /api/mixtape/generate
// Generates a 16-track mixtape from a YouTube URL or keywords.
// Uses IMVDB + YouTube search with BFS + eclectic sampling.

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

const IMVDB_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; jeem-fm/1.0)',
  'Accept': 'application/json',
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── YouTube metadata via oEmbed ──
async function getYouTubeMeta(videoId) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    return await res.json(); // { title, author_name }
  } catch {
    return null;
  }
}

// ── YouTube search (scrapes ytInitialData) ──
async function youtubeSearch(query) {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%3D%3D`;
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const match = html.match(/var ytInitialData\s*=\s*({.*?});\s*<\/script>/s);
    if (!match) return [];
    const data = JSON.parse(match[1]);
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
      ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;
    if (!contents) return [];

    const results = [];
    for (const item of contents) {
      const v = item.videoRenderer;
      if (!v?.videoId) continue;
      const durText = v.lengthText?.simpleText || '';
      const parts = durText.split(':').map(Number);
      let dur = 0;
      if (parts.length === 3) dur = parts[0] * 3600 + parts[1] * 60 + parts[2];
      else if (parts.length === 2) dur = parts[0] * 60 + parts[1];
      results.push({
        videoId: v.videoId,
        title: v.title?.runs?.[0]?.text || '',
        author: v.ownerText?.runs?.[0]?.text || '',
        duration: dur,
        durationText: durText,
        source: 'youtube',
      });
      if (results.length >= 8) break;
    }
    return results;
  } catch {
    return [];
  }
}

// ── IMVDB search ──
async function imvdbSearch(query, limit = 12) {
  try {
    const res = await fetch(
      `https://imvdb.com/api/v1/search/videos?q=${encodeURIComponent(query)}&per_page=${limit}`,
      { headers: IMVDB_HEADERS, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const videos = data.results || [];

    // Fetch YouTube source for each
    const batch = videos.slice(0, 12);
    const details = await Promise.allSettled(
      batch.map(v =>
        fetch(`https://imvdb.com/api/v1/video/${v.id}?include=sources,popularity`, {
          headers: IMVDB_HEADERS,
          signal: AbortSignal.timeout(5000),
        }).then(r => r.ok ? r.json() : null)
      )
    );

    const results = [];
    for (let i = 0; i < batch.length; i++) {
      const d = details[i].status === 'fulfilled' ? details[i].value : null;
      if (!d) continue;
      const yt = (d.sources || []).find(s => s.source === 'youtube');
      if (!yt?.source_data) continue;
      const artist = (d.artists || [])[0]?.name || '';
      results.push({
        videoId: yt.source_data,
        title: d.song_title || batch[i].song_title || '',
        author: artist,
        year: d.year || null,
        views: d.popularity?.views_all_time || 0,
        source: 'imvdb',
      });
    }
    return results;
  } catch {
    return [];
  }
}

// ── Score function: relevance × eclectic boost ──
function scoreTrack(track, isObvious) {
  const random = Math.random();
  const eclecticFactor = isObvious ? 0.2 : 1.2;
  const base = isObvious ? 0.7 : 0.4;
  return (base + random * 0.3) * (1 + random * eclecticFactor);
}

// ── BFS graph expand ──
async function expandGraph(currentTracks, depth = 0, maxDepth = 2) {
  if (currentTracks.length >= 16 || depth >= maxDepth) return currentTracks;

  const seen = new Set(currentTracks.map(t => t.videoId));
  const queries = [];

  // Generate expansion queries from current tracks
  for (const t of currentTracks.slice(-4)) {
    if (t.author) queries.push(`${t.author} music video`);
    if (t.title) {
      const parts = t.title.split(/[(-]/);
      if (parts[0]) queries.push(parts[0].trim());
    }
    if (t.year) queries.push(`${t.year} music video`);
  }

  // Dedupe
  const unique = [...new Set(queries)].slice(0, 6);

  const allCandidates = [];
  for (const q of unique) {
    const [imvdbResults, ytResults] = await Promise.all([
      imvdbSearch(q, 6),
      youtubeSearch(q),
    ]);
    allCandidates.push(...imvdbResults, ...ytResults);
    await sleep(100);
  }

  // Filter seen
  const candidates = allCandidates.filter(c => !seen.has(c.videoId));
  if (candidates.length === 0) return currentTracks;

  // Take top-scored candidates (BFS frontier)
  const scored = candidates.map(c => ({
    ...c,
    _score: scoreTrack(c, depth === 0),
  }));
  scored.sort((a, b) => b._score - a._score);

  const toAdd = scored.slice(0, Math.min(4, 16 - currentTracks.length));
  return expandGraph([...currentTracks, ...toAdd], depth + 1, maxDepth);
}

// ── Main generator ──
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url, keywords } = req.body || {};

  // Parse seed
  let seedVideoId = null;
  let seedTitle = keywords || 'Eclectic Mix';

  if (url && typeof url === 'string') {
    const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (match) {
      seedVideoId = match[1];
      const meta = await getYouTubeMeta(seedVideoId);
      if (meta) {
        seedTitle = meta.title || seedTitle;
      }
    }
  }

  const tracks = [];
  const seen = new Set();

  // Seed track
  if (seedVideoId) {
    const meta = await getYouTubeMeta(seedVideoId);
    tracks.push({
      videoId: seedVideoId,
      title: meta?.title || seedTitle,
      author: meta?.author_name || '',
      duration: 0,
      durationText: '',
      source: 'seed',
    });
    seen.add(seedVideoId);
  }

  // Phase 1: gather initial candidates from seed + keywords
  const initialQueries = [];
  if (seedVideoId && seedTitle) initialQueries.push(seedTitle);
  if (keywords) initialQueries.push(keywords);
  if (!initialQueries.length) initialQueries.push('80s music video');

  const initialUnique = [...new Set(initialQueries)].slice(0, 4);

  const initialCandidates = [];
  for (const q of initialUnique) {
    const [imvdbResults, ytResults] = await Promise.all([
      imvdbSearch(q, 8),
      youtubeSearch(q),
    ]);
    initialCandidates.push(...imvdbResults, ...ytResults);
    await sleep(150);
  }

  // Filter seen and score
  const unseenInitial = initialCandidates
    .filter(c => !seen.has(c.videoId))
    .map(c => ({ ...c, _score: scoreTrack(c, true) }))
    .sort((a, b) => b._score - a._score);

  // Take top 8 obvious + shuffle in some lower-ranked
  const obvious = unseenInitial.slice(0, 6);
  const eclectic = shuffle(unseenInitial.slice(6, 12));
  const initial = [...obvious, ...eclectic].slice(0, 8);

  tracks.push(...initial.map(t => ({ ...t, videoId: t.videoId })));
  initial.forEach(t => seen.add(t.videoId));

  // Phase 2: BFS expand to fill remaining slots
  const finalTracks = await expandGraph(tracks, 0, 2);

  // Ensure exactly 16 (or fewer if we couldn't find enough)
  const result = finalTracks.slice(0, 16).map((t, i) => ({
    videoId: t.videoId,
    title: t.title,
    author: t.author,
    duration: t.duration || 0,
    durationText: t.durationText || '',
  }));

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ tracks: result, seedTitle });
}
