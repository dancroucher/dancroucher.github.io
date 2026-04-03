import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Serve your static files (index.html, player.js, and the video folders)
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/list-files', (req, res) => {
  const folderParam = req.query.folder || 'video';
  
  try {
    const indexPath = path.join(__dirname, 'file-index.json');
    
    if (!fs.existsSync(indexPath)) {
      return res.status(500).send("Error: file-index.json missing. Run 'npm run build' first.");
    }

    const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    let fileNames = indexData[folderParam] || [];

    // Shuffle logic (Fisher-Yates)
    for (let i = fileNames.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fileNames[i], fileNames[j]] = [fileNames[j], fileNames[i]];
    }

    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(fileNames.join('\n'));
  } catch (error) {
    res.status(500).send("Server Error: " + error.message);
  }
});

app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query || !query.trim()) {
    return res.status(400).json({ error: "Missing query parameter" });
  }

  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim())}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return res.status(502).json({ error: "YouTube request failed" });

    const html = await response.text();
    const match = html.match(/var ytInitialData\s*=\s*({.*?});\s*<\/script>/s);
    if (!match) return res.status(200).json([]);

    const data = JSON.parse(match[1]);
    const contents = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents
      ?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents;
    if (!contents) return res.status(200).json([]);

    const results = [];
    for (const item of contents) {
      const video = item.videoRenderer;
      if (!video) continue;
      const durationText = video.lengthText?.simpleText || "";
      const parts = durationText.split(":").map(Number);
      let durationSeconds = 0;
      if (parts.length === 3) durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      else if (parts.length === 2) durationSeconds = parts[0] * 60 + parts[1];
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
});

app.get('/api/random-playlist', async (req, res) => {
  try {
    const { default: handler } = await import('./api/random-playlist.js');
    await handler(req, res);
  } catch (error) {
    res.status(500).json({ error: 'Random playlist failed: ' + error.message });
  }
});

app.get('/api/playlist-tracks', async (req, res) => {
  try {
    const { default: handler } = await import('./api/playlist-tracks.js');
    await handler(req, res);
  } catch (error) {
    res.status(500).json({ error: 'Playlist tracks failed: ' + error.message });
  }
});

// Note: /api/tapes and /api/user require @vercel/kv and only work on Vercel.
// Local dev uses localStorage only (no remote sync without a username).

app.listen(PORT, () => {
  console.log(`🚀 Local server running at http://localhost:${PORT}`);
});