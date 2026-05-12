import { putShare } from './utils/share-store.js';

const VALID_PAYLOAD_KEYS = new Set(['i', 't', 'a', 'p', 'pl', 'n', 'c', 'h', 'x', 's', 'v']);
const MAX_HISTORY_LEN = 2000;

function validateWirePayload(body: unknown): { ok: true; payload: Record<string, unknown> } | { ok: false; reason: string } {
  if (!body || typeof body !== 'object') return { ok: false, reason: 'not an object' };
  const o = body as Record<string, unknown>;
  if (typeof o.t !== 'string') return { ok: false, reason: 'missing t (title)' };
  if (o.t.length > 500) return { ok: false, reason: 'title too long' };
  for (const k of Object.keys(o)) {
    if (!VALID_PAYLOAD_KEYS.has(k)) return { ok: false, reason: `unknown key: ${k}` };
  }
  if (Array.isArray(o.h) && o.h.length > MAX_HISTORY_LEN) {
    return { ok: false, reason: `infiniteHistory exceeds ${MAX_HISTORY_LEN}` };
  }
  return { ok: true, payload: o };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method not allowed' });
  }
  const validated = validateWirePayload(req.body);
  if (!validated.ok) {
    return res.status(400).json({ error: 'invalid payload: ' + validated.reason });
  }
  try {
    const id = await putShare(validated.payload);
    return res.status(200).json({ id });
  } catch (e) {
    return res.status(500).json({ error: 'put failed: ' + e.message });
  }
}
