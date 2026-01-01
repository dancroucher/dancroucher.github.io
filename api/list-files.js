const fs = require('fs');
const path = require('path');

export default function handler(req, res) {
  // Path to your folder (relative to project root)
  const directoryPath = path.join(process.cwd(), 'video', 'video');
  
  try {
    // Read directory
    const files = fs.readdirSync(directoryPath);
    
    // Filter to only include files (not subdirectories)
    const fileNames = files.filter(file => {
      return fs.statSync(path.join(directoryPath, file)).isFile();
    });
    
    // Join with newlines
    const fileList = fileNames.join('\n');
    
    // Return as plain text
    res.status(200).send(fileList);
  } catch (error) {
    res.status(500).json({ error: 'Error reading directory' });
  }
}