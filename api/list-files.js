const fs = require('fs');
const path = require('path');

export default function handler(req, res) {
  // Use process.cwd() to start from the project root
  const directoryPath = path.join(process.cwd(), 'video')
  
  try {
    const files = fs.readdirSync(directoryPath);
    
    const fileNames = files.filter(file => {
      // Use !file.startsWith('.') to ignore hidden system files like .DS_Store
      return fs.statSync(path.join(directoryPath, file)).isFile() && !file.startsWith('.');
    });
    
    // Set headers so the browser treats the response as a fresh list every time
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    const fileList = fileNames.join('\n');
    res.status(200).send(fileList);
  } catch (error) {
    // Return the actual error message to help debug in Vercel logs
    res.status(500).json({ error: error.message });
  }
}