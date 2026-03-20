import { kv } from '@vercel/kv';

const PREFIX = process.env.VERCEL_ENV === 'production' ? 'users:' : 'users:test:';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const username = (req.query.username || '').toLowerCase().trim();
    if (!username) return res.status(400).json({ error: 'Missing username' });
    const data = await kv.get(PREFIX + username);
    return res.status(200).json({ exists: !!data });
  }

  if (req.method === 'POST') {
    const username = (req.body.username || '').toLowerCase().trim();
    if (!/^[a-z0-9-]{3,20}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-20 characters (a-z, 0-9, -)' });
    }
    const key = PREFIX + username;
    const existing = await kv.get(key);
    if (existing) return res.status(409).json({ error: 'taken' });
    await kv.set(key, { created: new Date().toISOString() });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
