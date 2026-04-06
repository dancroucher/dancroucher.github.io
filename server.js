import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { shuffle } from './api/utils/youtube.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

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
    const fileNames = shuffle(indexData[folderParam] || []);

    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(fileNames.join('\n'));
  } catch (error) {
    res.status(500).send("Server Error: " + error.message);
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const { default: handler } = await import('./api/search.js');
    await handler(req, res);
  } catch (error) {
    res.status(500).json({ error: 'Search failed: ' + error.message });
  }
});

app.get('/api/random', async (req, res) => {
  try {
    const { default: handler } = await import('./api/random.js');
    await handler(req, res);
  } catch (error) {
    res.status(500).json({ error: 'Random video failed: ' + error.message });
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

app.post('/api/mixtape/generate', async (req, res) => {
  try {
    const { default: handler } = await import('./api/mixtape/generate.js');
    await handler(req, res);
  } catch (error) {
    res.status(500).json({ error: 'Mixtape generate failed: ' + error.message });
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
