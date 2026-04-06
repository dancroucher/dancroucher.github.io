import { YT_HEADERS, parseDuration, parseYtInitialData } from './utils/youtube.js';

export default async function handler(req, res) {
  const query = req.query.q;

  if (!query || !query.trim()) {
    return res.status(400).json({ error: "Missing query parameter" });
  }

  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim())}`;
    const response = await fetch(url, {
      headers: YT_HEADERS,
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return res.status(502).json({ error: "YouTube request failed" });
    }

    const html = await response.text();
    const data = parseYtInitialData(html);
    if (!data) return res.status(200).json([]);

    const contents =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;

    if (!contents) return res.status(200).json([]);

    const results = [];
    for (const item of contents) {
      const video = item.videoRenderer;
      if (!video) continue;

      const durationText = video.lengthText?.simpleText || "";
      const viewText = video.viewCountText?.simpleText || "";
      const viewNum = parseInt(viewText.replace(/[^0-9]/g, "")) || 0;

      results.push({
        videoId: video.videoId,
        title: video.title?.runs?.[0]?.text || "",
        author: video.ownerText?.runs?.[0]?.text || "",
        duration: parseDuration(durationText),
        durationText,
        views: viewNum,
      });

      if (results.length >= 16) break;
    }

    results.sort((a, b) => b.views - a.views);

    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).json(results);
  } catch (error) {
    console.error("Search error:", error);
    return res.status(500).json({ error: "Search failed" });
  }
}
