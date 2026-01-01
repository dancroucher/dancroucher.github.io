import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  // Get folder from URL (e.g., ?folder=anime), defaulting to 'video'
  const folderParam = req.query.folder || 'video';

  // Vercel pathing: process.cwd() points to the project root
  const directoryPath = path.join(process.cwd(), 'public', folderParam);
  
  try {
    const files = fs.readdirSync(directoryPath);
    
    // Filter for files and ignore hidden system files like .DS_Store
    let fileNames = files.filter(file => {
      const fullPath = path.join(directoryPath, file);
      return fs.statSync(fullPath).isFile() && !file.startsWith('.');
    });

    // Fisher-Yates Shuffle
    for (let i = fileNames.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fileNames[i], fileNames[j]] = [fileNames[j], fileNames[i]];
    }
    
    const fileList = fileNames.join('\n');
    
    // Set headers to ensure plain text and no caching
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    
    res.status(200).send(fileList);
  } catch (error) {
    // If folder doesn't exist or other error occurs
    res.status(500).json({ error: error.message });
  }
}