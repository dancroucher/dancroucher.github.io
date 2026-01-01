const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

// Serve static files
app.use(express.static('.'));

// API endpoint
app.get('/api/list-files', (req, res) => {
  const directoryPath = path.join(__dirname, 'public', 'video');
  const files = fs.readdirSync(directoryPath);
  const fileNames = files.filter(file => {
    return fs.statSync(path.join(directoryPath, file)).isFile() 
           && file !== '.DS_Store';  
  });
  res.setHeader('Content-Type', 'text/plain');
  res.send(fileNames.join('\n'));
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));