// Random music playlist discovery via YouTube search
// Searches for a random music playlist and returns its metadata

import { YT_HEADERS, parseYtInitialData } from './utils/youtube.js';

const QUERIES = [
  // Decade mixes
  '80s music playlist', '90s music playlist', '70s music playlist',
  '2000s music playlist', '60s music playlist', '2010s music playlist',
  // Genre mixes
  'rock music playlist', 'pop music playlist', 'jazz playlist',
  'soul music playlist', 'funk playlist', 'disco playlist',
  'punk rock playlist', 'new wave playlist', 'synthwave playlist',
  'indie rock playlist', 'alternative rock playlist', 'grunge playlist',
  'hip hop playlist', 'r&b playlist', 'reggae playlist',
  'electronic music playlist', 'house music playlist', 'techno playlist',
  'classical music playlist', 'blues playlist', 'country music playlist',
  'metal playlist', 'folk music playlist', 'ambient music playlist',
  // Mood/vibe
  'chill music playlist', 'workout music playlist', 'driving music playlist',
  'study music playlist', 'summer music playlist', 'rainy day music playlist',
  'feel good music playlist', 'late night music playlist',
  // Specific
  'best music videos playlist', 'classic rock playlist',
  'one hit wonders playlist', 'MTV classics playlist',
  'motown playlist', 'brit pop playlist', 'post punk playlist',
  'shoegaze playlist', 'dream pop playlist', 'lo-fi playlist',
];

// Recursively find all playlistRenderer objects in the ytInitialData tree
function findPlaylists(obj, results = []) {
  if (!obj || typeof obj !== 'object') return results;
  if (obj.playlistRenderer) {
    results.push(obj.playlistRenderer);
  }
  if (Array.isArray(obj)) {
    for (const item of obj) findPlaylists(item, results);
  } else {
    for (const val of Object.values(obj)) findPlaylists(val, results);
  }
  return results;
}

async function tryQuery(query) {
  // sp=EgIQAw== is the YouTube filter for "Playlist" results
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAw%3D%3D`;
  const response = await fetch(url, {
    headers: YT_HEADERS,
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) return null;

  const html = await response.text();
  const data = parseYtInitialData(html);
  if (!data) return null;

  const allPl = findPlaylists(data);
  const playlists = [];

  for (const pl of allPl) {
    const videoCount = parseInt(pl.videoCount || '0');
    if (videoCount < 5) continue;

    playlists.push({
      playlistId: pl.playlistId,
      title: pl.title?.simpleText || '',
      author: pl.shortBylineText?.runs?.[0]?.text || '',
      videoCount,
    });
  }

  if (playlists.length === 0) return null;
  return playlists[Math.floor(Math.random() * playlists.length)];
}

export default async function handler(req, res) {
  // Try up to 3 different queries
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const query = QUERIES[Math.floor(Math.random() * QUERIES.length)];
      const result = await tryQuery(query);
      if (result) {
        res.setHeader('Cache-Control', 'no-cache');
        return res.status(200).json(result);
      }
    } catch (e) {
      console.error('Random playlist attempt failed:', e);
    }
  }

  return res.status(200).json({ error: 'No playlists found after retries' });
}
