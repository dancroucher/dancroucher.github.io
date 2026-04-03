export default async function handler(req, res) {
  const playlistId = req.query.list;
  if (!playlistId || !playlistId.trim()) {
    return res.status(400).json({ error: 'Missing list parameter' });
  }

  try {
    const url = `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId.trim())}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return res.status(502).json({ error: 'YouTube request failed' });

    const html = await response.text();
    const match = html.match(/var ytInitialData\s*=\s*({.*?});\s*<\/script>/s);
    if (!match) return res.status(200).json([]);

    const data = JSON.parse(match[1]);

    // Navigate to the playlist video list
    const contents = data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]
      ?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]
      ?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents;

    if (!contents) return res.status(200).json([]);

    const tracks = [];
    for (const item of contents) {
      const video = item.playlistVideoRenderer;
      if (!video) continue;

      const durationText = video.lengthText?.simpleText || '';
      const parts = durationText.split(':').map(Number);
      let durationSeconds = 0;
      if (parts.length === 3) durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      else if (parts.length === 2) durationSeconds = parts[0] * 60 + parts[1];

      tracks.push({
        videoId: video.videoId || '',
        title: video.title?.runs?.[0]?.text || '',
        author: video.shortBylineText?.runs?.[0]?.text || '',
        duration: durationSeconds,
        durationText,
      });
    }

    res.setHeader('Cache-Control', 'public, max-age=600');
    return res.status(200).json(tracks);
  } catch (error) {
    console.error('Playlist tracks error:', error);
    return res.status(500).json({ error: 'Failed to fetch playlist tracks' });
  }
}
