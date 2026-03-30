// GET /api/mixtape/[id]
// Loads a saved mixtape from Vercel KV.
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query || {};
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing mixtape id' });
  }

  // Validate UUID format (basic check)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const data = await kv.get(`mixtape:${id}`);
    if (!data) {
      return res.status(404).json({ error: 'Mixtape not found or expired' });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ id, ...data });
  } catch (e) {
    console.error('Mixtape load error:', e.message || e);
    return res.status(502).json({ error: 'Failed to load mixtape' });
  }
}
