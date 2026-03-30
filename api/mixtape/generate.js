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

// ── YouTube metadata via oEmbed ──
async function getYouTubeMeta(videoId) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── YouTube search (scrapes ytInitialData) ──
async function youtubeSearch(query, limit = 6) {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%3D%3D`;
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(6000),
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
      });
      if (results.length >= limit) break;
    }
    return results;
  } catch { return []; }
}

// ── IMVDB search (one batch request, no per-video detail fetches) ──
async function imvdbSearch(query, limit = 8) {
  try {
    const res = await fetch(
      `https://imvdb.com/api/v1/search/videos?q=${encodeURIComponent(query)}&per_page=${limit}`,
      { headers: IMVDB_HEADERS, signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const videos = (data.results || []).slice(0, limit);
    // Return what we have — caller can use oEmbed for title/author if needed
    return videos.map(v => ({
      videoId: null, // will be filled by oEmbed
      title: v.song_title || query,
      author: '',
      year: v.year || null,
    }));
  } catch { return []; }
}

// ── Score: relevance × eclectic boost ──
function scoreTrack(obvious) {
  const random = Math.random();
  if (obvious) return (0.7 + random * 0.3) * (1 + random * 0.3);
  return (0.4 + random * 0.3) * (1 + random * 1.2);
}

// ── Fetch track metadata from YouTube (fills in videoId + title/author) ──
async function resolveTrack(query, videoId) {
  if (videoId) {
    const meta = await getYouTubeMeta(videoId);
    if (meta) return { videoId, title: meta.title, author: meta.author_name };
  }
  // Fall back to YouTube search for the query
  const results = await youtubeSearch(query, 3);
  if (results.length > 0) return results[0];
  return null;
}

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
      if (meta) seedTitle = meta.title || seedTitle;
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
      duration: 0, durationText: '',
    });
    seen.add(seedVideoId);
  }

  // Build query list from seed
  const queries = [];
  if (seedTitle) queries.push(seedTitle);
  if (keywords) queries.push(keywords);
  if (queries.length === 0) queries.push('80s music video');

  const unique = [...new Set(queries)].slice(0, 4);

  // Gather candidates in parallel
  // YouTube scraping may 401/403 from Vercel IPs — wrap each in try/catch so failures don't cascade
  const allRaw = [];
  await Promise.allSettled(unique.map(async (q) => {
    const results = [];

    // Try IMVDB first (music-specific, doesn't block Vercel)
    try {
      const imvdb = await imvdbSearch(q, 8);
      results.push(...imvdb);
    } catch { /* continue */ }

    // Try YouTube search (may 401 on Vercel IPs)
    try {
      const yt = await youtubeSearch(q, 8);
      results.push(...yt);
    } catch { /* continue */ }

    allRaw.push(...results);
  }));

  // Resolve video IDs via oEmbed (parallel, up to 32 candidates for a bigger pool)
  const toResolve = allRaw.slice(0, 32);
  const resolved = await Promise.allSettled(
    toResolve.map(r => resolveTrack(r.title, r.videoId))
  );

  // Score and filter
  const candidates = [];
  for (const r of resolved) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    const t = r.value;
    if (!t.videoId || seen.has(t.videoId)) continue;
    candidates.push({ ...t, _score: scoreTrack(true) });
    seen.add(t.videoId);
  }

  // Sort: top scored first, shuffle in some lower-ranked for eclecticism
  candidates.sort((a, b) => b._score - a._score);
  const obvious = candidates.slice(0, 8);
  const eclectic = shuffle(candidates.slice(8));
  const initial = shuffle([...obvious, ...eclectic]);

  // Fill to 16 tracks
  while (tracks.length < 16 && initial.length > 0) {
    const next = initial.shift();
    tracks.push({
      videoId: next.videoId,
      title: next.title || 'Unknown',
      author: next.author || '',
      duration: next.duration || 0,
      durationText: next.durationText || '',
    });
  }

  // If still not enough, do more YouTube searches with fallback queries
  if (tracks.length < 16) {
    const fallbackQueries = [
      seedTitle + ' best songs',
      seedTitle + ' music video',
      keywords + ' playlist',
    ];
    for (const q of fallbackQueries) {
      const extra = await youtubeSearch(q, 8);
      for (const t of extra) {
        if (seen.has(t.videoId)) continue;
        tracks.push({
          videoId: t.videoId,
          title: t.title || 'Unknown',
          author: t.author || '',
          duration: t.duration || 0,
          durationText: t.durationText || '',
        });
        seen.add(t.videoId);
        if (tracks.length >= 16) break;
      }
      if (tracks.length >= 16) break;
    }
  }

  const result = tracks.slice(0, 16).map(t => ({
    videoId: t.videoId,
    title: t.title,
    author: t.author,
    duration: t.duration || 0,
    durationText: t.durationText || '',
  }));

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ tracks: result, seedTitle });
}
