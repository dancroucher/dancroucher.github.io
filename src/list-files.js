import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  const directoryPath = path.join(process.cwd(), 'public', 'video');
  
  try {
    const files = fs.readdirSync(directoryPath);
    
    const fileNames = files.filter(file => {
      return fs.statSync(path.join(directoryPath, file)).isFile();
    });
    
    const fileList = fileNames.join('\n');
    
    // Important: set content type
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(fileList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}