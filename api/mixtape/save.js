// POST /api/mixtape/save
// Saves a mixtape to Vercel KV and returns the UUID.
import { kv } from '@vercel/kv';

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, description, tracks } = req.body || {};

  if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
    return res.status(400).json({ error: 'Missing or invalid tracks' });
  }
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Missing name' });
  }

  const id = generateUUID();
  const record = {
    name: name.trim(),
    description: (description || '').trim(),
    tracks: tracks.slice(0, 16),
    createdAt: new Date().toISOString(),
  };

  try {
    // 30-day TTL
    await kv.set(`mixtape:${id}`, record, { ex: 60 * 60 * 24 * 30 });
    return res.status(200).json({ id });
  } catch (e) {
    console.error('Mixtape save error:', e.message || e);
    return res.status(500).json({ error: 'Failed to save mixtape' });
  }
}
