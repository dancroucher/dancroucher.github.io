import type { Tape, InfiniteConfig, InfiniteTrack } from './types';

// Minimal payload that captures everything needed to spawn a tape on another
// machine. Excludes ephemeral/local state (id, position, angle, progress).
export interface SharePayload {
  videoId: string;
  title: string;
  author: string;
  isPlaylist?: boolean;
  playlistId?: string;
  isInfinite?: boolean;
  infiniteConfig?: InfiniteConfig;
  infiniteHistory?: InfiniteTrack[];
  infiniteIndex?: number;
  tapeStyle?: number;
  textureVariant?: string;
}

// Short keys on the wire to keep share URLs compact.
interface WirePayload {
  i?: string;  // videoId
  t: string;   // title
  a?: string;  // author
  p?: 1;       // isPlaylist
  pl?: string; // playlistId
  n?: 1;       // isInfinite
  c?: InfiniteConfig;     // infiniteConfig
  h?: InfiniteTrack[];    // infiniteHistory
  x?: number;  // infiniteIndex
  s?: number;  // tapeStyle
  v?: string;  // textureVariant
}

function toB64Url(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return decodeURIComponent(escape(atob(b64)));
}


export function decodeTapeShare(s: string): SharePayload | null {
  try { return wireToPayload(JSON.parse(fromB64Url(s)) as WirePayload); }
  catch { return null; }
}

function urlWithParam(key: string, value: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set(key, value);
  return url.toString();
}

// Tries the server shortener first; falls back to the inline encoded URL.
export async function buildShareUrl(t: Tape): Promise<string> {
  const wire = encodeTapeWire(t);
  try {
    const r = await fetch('/api/tape-share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: wire }),
    });
    if (r.ok) {
      const { id } = await r.json();
      if (id) return urlWithParam('t', id);
    }
  } catch {}
  return urlWithParam('tape', toB64Url(JSON.stringify(wire)));
}

export async function fetchShareById(id: string): Promise<SharePayload | null> {
  try {
    const r = await fetch(`/api/tape-share/${encodeURIComponent(id)}`);
    if (!r.ok) return null;
    const { payload } = await r.json();
    return wireToPayload(payload);
  } catch { return null; }
}

function encodeTapeWire(t: Tape): WirePayload {
  const w: WirePayload = { t: t.title };
  if (t.videoId) w.i = t.videoId;
  if (t.author) w.a = t.author;
  if (typeof t.tapeStyle === 'number') w.s = t.tapeStyle;
  if (t.textureVariant) w.v = t.textureVariant;
  if (t.isPlaylist) { w.p = 1; if (t.playlistId) w.pl = t.playlistId; }
  if (t.isInfinite) {
    w.n = 1;
    if (t.infiniteConfig) w.c = t.infiniteConfig;
    if (t.infiniteHistory && t.infiniteHistory.length) w.h = t.infiniteHistory;
    if (typeof t.infiniteIndex === 'number') w.x = t.infiniteIndex;
  }
  return w;
}

function wireToPayload(w: WirePayload | null | undefined): SharePayload | null {
  if (!w || typeof w.t !== 'string') return null;
  const p: SharePayload = {
    videoId: w.i ?? '',
    title: w.t,
    author: w.a ?? '',
  };
  if (w.s !== undefined) p.tapeStyle = w.s;
  if (w.v !== undefined) p.textureVariant = w.v;
  if (w.p) { p.isPlaylist = true; if (w.pl) p.playlistId = w.pl; }
  if (w.n) {
    p.isInfinite = true;
    if (w.c) p.infiniteConfig = w.c;
    if (w.h) p.infiniteHistory = w.h;
    if (typeof w.x === 'number') p.infiniteIndex = w.x;
  }
  return p;
}
