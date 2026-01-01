import path from 'path';
import fs from 'fs';

export default function handler(req, res) {
  // 1. Immediate Header Injection
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // 2. THIS IS THE TEST: If you don't see this in your terminal, 
  // the request is being intercepted before it hits this file.
  console.log(">>> REQUEST RECEIVED AT:", new Date().toUTCString());

  const directoryPath = path.join(process.cwd(), 'public', 'video');
  
  try {
    if (!fs.existsSync(directoryPath)) {
      console.log("Error: Directory does not exist:", directoryPath);
      return res.status(404).send("Directory not found");
    }

    const files = fs.readdirSync(directoryPath);
    
    // 3. Filter
    let fileNames = files.filter(file => {
      const fullPath = path.join(directoryPath, file);
      return fs.statSync(fullPath).isFile() && file !== '.DS_Store';
    });

    // 4. Shuffle (Fisher-Yates)
    for (let i = fileNames.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fileNames[i], fileNames[j]] = [fileNames[j], fileNames[i]];
    }

    console.log("Shuffle successful. First file is now:", fileNames[0]);

    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(fileNames.join('\n'));

  } catch (error) {
    console.error("Critical Server Error:", error);
    res.status(500).send(error.message);
  }
}