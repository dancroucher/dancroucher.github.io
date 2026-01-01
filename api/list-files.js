import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  // 1. Get the folder name from the URL query (e.g., ?folder=anime)
  const folderParam = req.query.folder || 'video';

  // 2. Resolve the path. 
  // IMPORTANT: Ensure your folders are inside 'public' at the root of your project.
  const directoryPath = path.join(process.cwd(), 'public', folderParam);
  
  try {
    if (!fs.existsSync(directoryPath)) {
      return res.status(404).send(`Directory not found: ${folderParam}`);
    }

    const files = fs.readdirSync(directoryPath);
    
    let fileNames = files.filter(file => {
      const fullPath = path.join(directoryPath, file);
      // Filter out subdirectories and hidden files like .DS_Store
      return fs.statSync(fullPath).isFile() && !file.startsWith('.');
    });

    // Fisher-Yates Shuffle
    for (let i = fileNames.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fileNames[i], fileNames[j]] = [fileNames[j], fileNames[i]];
    }
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.status(200).send(fileNames.join('\n'));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}