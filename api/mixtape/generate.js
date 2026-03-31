// POST /api/mixtape/generate
// Generates a 16-track mixtape from a YouTube URL or keywords.
// Uses IMVDB + YouTube search with BFS + eclectic sampling.
// Filters: music content only, max 20 minutes per track.

const MAX_DURATION = 20 * 60; // 20 minutes in seconds
const MIN_DURATION = 30;      // skip very short clips

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

// Parse "3:45" or "1:02:30" to seconds
function parseDuration(text) {
  if (!text) return 0;
  const parts = text.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

// Check if duration is within acceptable range for a music track
function isValidDuration(dur) {
  return dur >= MIN_DURATION && dur <= MAX_DURATION;
}

// Reject non-music content by title keywords
const REJECT_PATTERNS = [
  /\bfull\s+album\b/i,
  /\blive\s+stream\b/i,
  /\blivestream\b/i,
  /\bpodcast\b/i,
  /\binterview\b/i,
  /\breaction\b/i,
  /\btutorial\b/i,
  /\bhow\s+to\b/i,
  /\breview\b/i,
  /\bcompilation\b/i,
  /\bmix\s+20[0-9]{2}\b/i,
  /\b(1|2|3|4|5|6|8|10)\s*hour/i,
  /\bfull\s+concert\b/i,
  /\basmr\b/i,
  /\blyric\s+breakdown\b/i,
  /\bexplained\b/i,
];

function looksLikeMusic(title) {
  for (const p of REJECT_PATTERNS) {
    if (p.test(title)) return false;
  }
  return true;
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
// sp=EgIQAQ%3D%3D = filter to Videos only
// sp=EgWKAQIIAQ%3D%3D = filter to Music + Videos
async function youtubeSearch(query, limit = 8) {
  try {
    // Add "music video" hint and use Music category filter
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' music video')}&sp=EgIQAQ%3D%3D`;
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
      const title = v.title?.runs?.[0]?.text || '';
      const durText = v.lengthText?.simpleText || '';
      const dur = parseDuration(durText);

      // Skip non-music and wrong-length tracks
      if (!looksLikeMusic(title)) continue;
      if (dur > 0 && !isValidDuration(dur)) continue;
      // Skip if no duration info (likely a livestream)
      if (!durText) continue;

      results.push({
        videoId: v.videoId,
        title,
        author: v.ownerText?.runs?.[0]?.text || '',
        duration: dur,
        durationText: durText,
      });
      if (results.length >= limit) break;
    }
    return results;
  } catch { return []; }
}

// ── IMVDB search (music video database — inherently music) ──
async function imvdbSearch(query, limit = 8) {
  try {
    const res = await fetch(
      `https://imvdb.com/api/v1/search/videos?q=${encodeURIComponent(query)}&per_page=${limit}`,
      { headers: IMVDB_HEADERS, signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const videos = (data.results || []).slice(0, limit);
    return videos.map(v => ({
      videoId: null, // will be resolved via YouTube search
      title: v.song_title || query,
      author: v.artists?.[0]?.name || '',
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

// ── Resolve a track: get videoId + duration from YouTube ──
async function resolveTrack(query, videoId) {
  // If we already have a videoId, get metadata but also need duration
  if (videoId) {
    const meta = await getYouTubeMeta(videoId);
    if (meta) {
      // oEmbed doesn't give duration, so search YouTube to find the duration
      const search = await youtubeSearch(meta.title + ' ' + meta.author_name, 3);
      const match = search.find(s => s.videoId === videoId);
      return {
        videoId,
        title: meta.title,
        author: meta.author_name,
        duration: match?.duration || 0,
        durationText: match?.durationText || '',
      };
    }
  }
  // Fall back to YouTube search — results already have duration
  const artistHint = query.includes(' - ') ? '' : ' official';
  const results = await youtubeSearch(query + artistHint, 3);
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
  const seen = new Set();           // videoId dedup
  const seenTitles = new Set();     // normalized title dedup
  const artistCount = new Map();    // author → count (max 4 per artist)
  const MAX_PER_ARTIST = 4;

  function normalizeTitle(t) {
    return (t || '').toLowerCase().replace(/\s*\(.*?\)/g, '').replace(/\s*\[.*?\]/g, '').replace(/[^a-z0-9]/g, '');
  }

  function canAddTrack(title, author) {
    const norm = normalizeTitle(title);
    if (seenTitles.has(norm)) return false;
    const normAuthor = (author || '').toLowerCase().trim();
    if (normAuthor && (artistCount.get(normAuthor) || 0) >= MAX_PER_ARTIST) return false;
    return true;
  }

  function markTrackAdded(title, author) {
    seenTitles.add(normalizeTitle(title));
    const normAuthor = (author || '').toLowerCase().trim();
    if (normAuthor) artistCount.set(normAuthor, (artistCount.get(normAuthor) || 0) + 1);
  }

  // Seed track — resolve with duration
  if (seedVideoId) {
    const resolved = await resolveTrack(seedTitle, seedVideoId);
    if (resolved && (!resolved.duration || isValidDuration(resolved.duration))) {
      const t = {
        videoId: resolved.videoId,
        title: resolved.title || seedTitle,
        author: resolved.author || '',
        duration: resolved.duration || 0,
        durationText: resolved.durationText || '',
      };
      tracks.push(t);
      seen.add(t.videoId);
      markTrackAdded(t.title, t.author);
    }
  }

  // Build query list from seed
  const queries = [];
  if (seedTitle) queries.push(seedTitle);
  if (keywords) queries.push(keywords);
  if (queries.length === 0) queries.push('80s music video');

  const unique = [...new Set(queries)].slice(0, 4);

  // Gather candidates in parallel
  const allRaw = [];
  await Promise.allSettled(unique.map(async (q) => {
    const results = [];

    // IMVDB — music-specific database
    try {
      const imvdb = await imvdbSearch(q, 8);
      results.push(...imvdb);
    } catch { /* continue */ }

    // YouTube search with music hint
    try {
      const yt = await youtubeSearch(q, 8);
      results.push(...yt);
    } catch { /* continue */ }

    allRaw.push(...results);
  }));

  // Resolve video IDs + duration via YouTube (parallel, up to 32 candidates)
  const toResolve = allRaw.slice(0, 32);
  const resolved = await Promise.allSettled(
    toResolve.map(r => resolveTrack(
      r.author ? `${r.author} ${r.title}` : r.title,
      r.videoId
    ))
  );

  // Score and filter — enforce duration, music content, no dup titles, max per artist
  const candidates = [];
  for (const r of resolved) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    const t = r.value;
    if (!t.videoId || seen.has(t.videoId)) continue;
    if (!looksLikeMusic(t.title)) continue;
    if (t.duration > 0 && !isValidDuration(t.duration)) continue;
    if (!canAddTrack(t.title, t.author)) continue;
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
    if (!canAddTrack(next.title, next.author)) continue;
    tracks.push({
      videoId: next.videoId,
      title: next.title || 'Unknown',
      author: next.author || '',
      duration: next.duration || 0,
      durationText: next.durationText || '',
    });
    markTrackAdded(next.title, next.author);
  }

  // If still not enough, do more YouTube searches with fallback queries
  if (tracks.length < 16) {
    const fallbackQueries = [
      seedTitle + ' best songs',
      seedTitle + ' similar artists',
      keywords ? keywords + ' songs' : '80s hits',
    ];
    for (const q of fallbackQueries) {
      if (tracks.length >= 16) break;
      const extra = await youtubeSearch(q, 10);
      for (const t of extra) {
        if (seen.has(t.videoId)) continue;
        if (!looksLikeMusic(t.title)) continue;
        if (t.duration > 0 && !isValidDuration(t.duration)) continue;
        if (!canAddTrack(t.title, t.author)) continue;
        tracks.push({
          videoId: t.videoId,
          title: t.title || 'Unknown',
          author: t.author || '',
          duration: t.duration || 0,
          durationText: t.durationText || '',
        });
        seen.add(t.videoId);
        markTrackAdded(t.title, t.author);
        if (tracks.length >= 16) break;
      }
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
