import { putShare } from './utils/share-store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }
  const payload = req.body && req.body.payload;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'missing payload' });
  }
  try {
    const id = await putShare(payload);
    return res.status(200).json({ id });
  } catch (e) {
    return res.status(500).json({ error: 'put failed: ' + e.message });
  }
}
