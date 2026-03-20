import { kv } from '@vercel/kv';

const BASE = process.env.VERCEL_ENV === 'production' ? 'tapes' : 'tapes:test';
const EMPTY = { tapes: [], _v: '' };

function getKey(req) {
  const user = (req.query.user || '').toLowerCase().trim();
  if (user && /^[a-z0-9-]{3,20}$/.test(user)) {
    return `${BASE}:user:${user}`;
  }
  return `${BASE}:state`;
}

export default async function handler(req, res) {
  const key = getKey(req);

  if (req.method === 'GET') {
    try {
      const data = await kv.get(key);
      if (!data) return res.status(200).json(EMPTY);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(data);
    } catch (e) {
      console.error('GET /api/tapes error:', e.message || e);
      return res.status(502).json(EMPTY);
    }
  }

  if (req.method === 'POST') {
    try {
      const body = req.body;
      const stamped = { ...body, _v: new Date().toISOString() };
      await kv.set(key, stamped);
      return res.status(200).json({ ok: true, _v: stamped._v });
    } catch (e) {
      console.error('POST /api/tapes error:', e.message || e);
      return res.status(500).json({ error: e.message || String(e) });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
