import { getShare } from '../utils/share-store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method not allowed' });
  }
  const id = req.query?.id ?? req.params?.id;
  if (!/^[A-Za-z0-9]{4,16}$/.test(id || '')) {
    return res.status(400).json({ error: 'bad id' });
  }
  try {
    const payload = await getShare(id);
    if (!payload) return res.status(404).json({ error: 'not found' });
    return res.status(200).json({ payload });
  } catch (e) {
    return res.status(500).json({ error: 'get failed: ' + e.message });
  }
}
