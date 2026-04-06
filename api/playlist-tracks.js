import { YT_HEADERS, parseDuration, parseYtInitialData } from './utils/youtube.js';

export default async function handler(req, res) {
  const playlistId = req.query.list;
  if (!playlistId || !playlistId.trim()) {
    return res.status(400).json({ error: 'Missing list parameter' });
  }

  try {
    const url = `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId.trim())}`;
    const response = await fetch(url, {
      headers: YT_HEADERS,
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return res.status(502).json({ error: 'YouTube request failed' });

    const html = await response.text();
    const data = parseYtInitialData(html);
    if (!data) return res.status(200).json([]);

    const contents = data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]
      ?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]
      ?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents;

    if (!contents) return res.status(200).json([]);

    const tracks = [];
    for (const item of contents) {
      const video = item.playlistVideoRenderer;
      if (!video) continue;

      const durationText = video.lengthText?.simpleText || '';
      tracks.push({
        videoId: video.videoId || '',
        title: video.title?.runs?.[0]?.text || '',
        author: video.shortBylineText?.runs?.[0]?.text || '',
        duration: parseDuration(durationText),
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
