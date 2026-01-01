const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());

// --- VERBOSE LOGGING ---
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// --- THE FIX FOR THE MAIN PAGE ---
// If your index.html is in the SAME folder as server.js, use this:
app.use(express.static(__dirname)); 
// If your index.html is inside 'public', use: app.use(express.static('public'));

// Explicit route for the homepage to be safe
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --- YOUR RANDOMIZING API ---
app.get('/api/list-files', (req, res) => {
  const directoryPath = path.join(__dirname, 'public', 'video');
  
  try {
    const files = fs.readdirSync(directoryPath);
    let fileNames = files.filter(file => {
      const fullPath = path.join(directoryPath, file);
      return fs.statSync(fullPath).isFile() && file !== '.DS_Store';
    });

    // Fisher-Yates Shuffle
    for (let i = fileNames.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fileNames[i], fileNames[j]] = [fileNames[j], fileNames[i]];
    }

    console.log(`> Randomized ${fileNames.length} files.`);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.send(fileNames.join('\n'));
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).send("Error reading files");
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});