import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, '..', '..', 'data', 'tape-shares.json');
const TTL_SECONDS = 60 * 60 * 24 * 180; // 180 days

let redis = null;
async function getRedis() {
  if (redis !== null) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    redis = false;
    return false;
  }
  const { Redis } = await import('@upstash/redis');
  redis = new Redis({ url, token });
  return redis;
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function makeId(len = 8) {
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

function readFileStore() {
  try {
    if (!fs.existsSync(DATA_PATH)) return {};
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8') || '{}');
  } catch { return {}; }
}

function writeFileStore(obj) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(obj));
}

export async function putShare(payload) {
  const r = await getRedis();
  if (r) {
    let id;
    while (true) {
      id = makeId();
      // SET NX returns null when key exists; succeeds (returns "OK") otherwise.
      const ok = await r.set(`share:${id}`, payload, { nx: true, ex: TTL_SECONDS });
      if (ok) return id;
    }
  }
  const store = readFileStore();
  let id;
  do { id = makeId(); } while (store[id]);
  store[id] = { payload, ts: Date.now() };
  writeFileStore(store);
  return id;
}

export async function getShare(id) {
  const r = await getRedis();
  if (r) return await r.get(`share:${id}`);
  const store = readFileStore();
  return store[id] ? store[id].payload : null;
}
