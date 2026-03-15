import { kv } from '@vercel/kv';

const KV_KEY = process.env.VERCEL_ENV === 'production' ? 'tapes:state' : 'tapes:state:preview';
const EMPTY = { tapes: [], _v: '' };

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const data = await kv.get(KV_KEY);
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
      await kv.set(KV_KEY, stamped);
      return res.status(200).json({ ok: true, _v: stamped._v });
    } catch (e) {
      console.error('POST /api/tapes error:', e.message || e);
      return res.status(500).json({ error: e.message || String(e) });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
