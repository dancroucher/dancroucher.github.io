import path from 'path';
import fs from 'fs';

export default function handler(req, res) {
  // 1. Force headers to kill all possible caching
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'text/plain');

  const directoryPath = path.join(process.cwd(), 'public', 'video');
  
  try {
    const files = fs.readdirSync(directoryPath);
    
    // 2. Filter the files
    let fileNames = files.filter(file => {
      const fullPath = path.join(directoryPath, file);
      return fs.statSync(fullPath).isFile() && file !== '.DS_Store';
    });

    // 3. Robust Shuffle (Fisher-Yates)
    for (let i = fileNames.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fileNames[i], fileNames[j]] = [fileNames[j], fileNames[i]];
    }

    // 4. Debugging: Log to your server terminal 
    // If you don't see this log change every refresh, the function isn't running.
    console.log(`Generating random list at ${new Date().toISOString()}`);

    const fileList = fileNames.join('\n');
    
    res.status(200).send(fileList);
  } catch (error) {
    console.error("Error reading directory:", error);
    res.status(500).json({ error: error.message });
  }
}