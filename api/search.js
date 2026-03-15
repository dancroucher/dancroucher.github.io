export default async function handler(req, res) {
  const query = req.query.q;

  if (!query || !query.trim()) {
    return res.status(400).json({ error: "Missing query parameter" });
  }

  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim())}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return res.status(502).json({ error: "YouTube request failed" });
    }

    const html = await response.text();

    // Extract ytInitialData JSON from the page
    const match = html.match(/var ytInitialData\s*=\s*({.*?});\s*<\/script>/s);
    if (!match) {
      return res.status(200).json([]);
    }

    const data = JSON.parse(match[1]);

    // Navigate to the video results
    const contents =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
        ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;

    if (!contents) {
      return res.status(200).json([]);
    }

    const results = [];
    for (const item of contents) {
      const video = item.videoRenderer;
      if (!video) continue;

      // Parse duration string like "3:45" or "1:02:30"
      const durationText = video.lengthText?.simpleText || "";
      const parts = durationText.split(":").map(Number);
      let durationSeconds = 0;
      if (parts.length === 3) durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      else if (parts.length === 2) durationSeconds = parts[0] * 60 + parts[1];
      else if (parts.length === 1) durationSeconds = parts[0];

      results.push({
        videoId: video.videoId,
        title: video.title?.runs?.[0]?.text || "",
        author: video.ownerText?.runs?.[0]?.text || "",
        duration: durationSeconds,
        durationText: durationText,
      });

      if (results.length >= 8) break;
    }

    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).json(results);
  } catch (error) {
    console.error("Search error:", error);
    return res.status(500).json({ error: "Search failed" });
  }
}
