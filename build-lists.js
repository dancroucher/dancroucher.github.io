import fs from 'fs';
import path from 'path';

const folders = ['video', 'anime', 'vintage'];
const output = {};

folders.forEach(folder => {
  // Scans the public folder during the Vercel build process
  const dirPath = path.join(process.cwd(), 'public', folder);
  
  if (fs.existsSync(dirPath)) {
    const files = fs.readdirSync(dirPath).filter(file => {
      const fullPath = path.join(dirPath, file);
      // Only include actual files, ignore folders and hidden files
      return fs.statSync(fullPath).isFile() && !file.startsWith('.');
    });
    output[folder] = files;
    console.log(`✅ Indexed ${files.length} files in /public/${folder}`);
  } else {
    console.log(`⚠️ Folder /public/${folder} not found, skipping...`);
  }
});

fs.writeFileSync('./file-index.json', JSON.stringify(output));
console.log('🚀 file-index.json created successfully.');