import { shuffle } from './utils/youtube.js';
import indexData from '../file-index.json' with { type: 'json' };

export default function handler(req, res) {
  try {
    const folderParam = req.query.folder || 'video';
    const fileNames = shuffle(indexData[folderParam] || []);
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(fileNames.join('\n'));
  } catch (error) {
    res.status(500).send('Server Error: ' + error.message);
  }
}
