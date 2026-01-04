import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

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

app.listen(PORT, () => {
  console.log(`🚀 Local server running at http://localhost:${PORT}`);
});