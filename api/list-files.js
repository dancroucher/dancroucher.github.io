import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  const folderParam = req.query.folder || 'video';
  
  try {
    // Read the index generated during build
    const indexPath = path.join(process.cwd(), 'file-index.json');
    const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

    let fileNames = indexData[folderParam] || [];

    // Fisher-Yates Shuffle
    for (let i = fileNames.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fileNames[i], fileNames[j]] = [fileNames[j], fileNames[i]];
    }

    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(fileNames.join('\n'));
  } catch (error) {
    res.status(500).send("Error: " + error.message);
  }
}