const fs = require('fs');
const path = require('path');

const folders = ['video', 'anime', 'skating', 'games'];
const output = {};

folders.forEach(folder => {
  const dirPath = path.join(process.cwd(), 'public', folder);
  if (fs.existsSync(dirPath)) {
    const files = fs.readdirSync(dirPath).filter(file => {
      return fs.statSync(path.join(dirPath, file)).isFile() && !file.startsWith('.');
    });
    output[folder] = files;
    console.log(`Indexed ${files.length} files in ${folder}`);
  }
});

// Save the map to a file the API can access easily
fs.writeFileSync('./file-index.json', JSON.stringify(output));