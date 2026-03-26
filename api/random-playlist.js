// Random music playlist discovery via YouTube search
// Searches for a random music playlist and returns its metadata

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

export default async function handler(req, res) {
  try {
    const query = QUERIES[Math.floor(Math.random() * QUERIES.length)];

    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAw%253D%253D`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'YouTube request failed' });
    }

    const html = await response.text();
    const match = html.match(/var ytInitialData\s*=\s*({.*?});\s*<\/script>/s);
    if (!match) {
      return res.status(200).json({ error: 'No data found' });
    }

    const data = JSON.parse(match[1]);
    const contents =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;

    if (!contents) {
      return res.status(200).json({ error: 'No results' });
    }

    // Extract playlists from results
    const playlists = [];
    for (const item of contents) {
      const pl = item.playlistRenderer;
      if (!pl) continue;

      const videoCount = parseInt(pl.videoCount || '0');
      if (videoCount < 5) continue; // skip tiny playlists

      playlists.push({
        playlistId: pl.playlistId,
        title: pl.title?.simpleText || '',
        author: pl.shortBylineText?.runs?.[0]?.text || '',
        videoCount,
      });
    }

    if (playlists.length === 0) {
      return res.status(200).json({ error: 'No playlists found', query });
    }

    // Pick a random one from the results
    const picked = playlists[Math.floor(Math.random() * playlists.length)];

    res.setHeader('Cache-Control', 'no-cache');
    return res.status(200).json(picked);
  } catch (error) {
    console.error('Random playlist error:', error);
    return res.status(500).json({ error: 'Failed to find random playlist' });
  }
}
