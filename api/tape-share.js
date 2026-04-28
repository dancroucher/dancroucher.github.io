import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '..', 'data', 'tape-shares.json');

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function makeId(len = 8) {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

function readStore() {
  try {
    if (!fs.existsSync(DATA_PATH)) return {};
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8') || '{}');
  } catch { return {}; }
}

function writeStore(obj) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(obj));
}

export function createShare(req, res) {
  const payload = req.body && req.body.payload;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'missing payload' });
  }
  const store = readStore();
  let id;
  do { id = makeId(); } while (store[id]);
  store[id] = { payload, ts: Date.now() };
  writeStore(store);
  res.json({ id });
}

export function getShare(req, res) {
  const id = req.params.id;
  if (!/^[A-Za-z0-9]{4,16}$/.test(id || '')) return res.status(400).json({ error: 'bad id' });
  const store = readStore();
  const entry = store[id];
  if (!entry) return res.status(404).json({ error: 'not found' });
  res.json({ payload: entry.payload });
}
