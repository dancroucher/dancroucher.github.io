import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Tape, TAPE_STYLES, getStorageKey, InfiniteConfig, InfiniteTrack } from './types';
import { CassetteTape } from './CassetteTape';
import { DeckTape3D } from './DeckTape3D';
import { MixtapeCreator, MIXTAPE_PANEL_STYLES, MIXTAPE_TRACK_LIST, MIXTAPE_TRACK_ROW, MIXTAPE_TRACK_NUM, MIXTAPE_TRACK_TITLE, MIXTAPE_TRACK_AUTHOR, MIXTAPE_TRACK_DURATION } from '../mixtape/Creator';
const TapesTable3D = lazy(() => import('./TapesTable3D').then(m => ({ default: m.TapesTable3D })));

// ── Mixtape data type (passed in from mixtape creator) ──
export interface MixtapeTrack {
  videoId: string;
  title: string;
  author: string;
  duration: number;
  durationText: string;
}
export interface MixtapeData {
  name: string;
  description: string;
  tracks: MixtapeTrack[];
}

// ── Texture variant cycling ──
const TEXTURE_VARIANTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'];
let nextVariantIndex = 0;
function nextTextureVariant(): string {
  const v = TEXTURE_VARIANTS[nextVariantIndex % TEXTURE_VARIANTS.length];
  nextVariantIndex++;
  return v;
}

// ── Tape sounds (real samples) ──

function playSfx(src: string, volume = 1, trimEnd = 0) {
  const a = new Audio(src);
  a.volume = volume;
  a.play().catch(() => {});
  if (trimEnd > 0) {
    a.addEventListener('loadedmetadata', () => {
      const stopAt = Math.max(0, a.duration - trimEnd);
      setTimeout(() => { if (!a.paused) a.pause(); }, stopAt * 1000);
    });
  }
}

function playTapeInsert() { playSfx('/sfx/tape-insert.mp3', 0.6, 0.4); }
function playTapeEject() { playSfx('/sfx/tape-eject.mp3', 0.6); }
function playTapeWhirr() { playSfx('/sfx/tape-play.mp3', 0.5); }

// ── Persistence (localStorage + KV sync) ──

// Module-level username for sync URLs
let currentUsername: string | null = localStorage.getItem('jeem_username') || null;

function userParam(prefix = '?') {
  if (!currentUsername) return '';
  return `${prefix}user=${encodeURIComponent(currentUsername)}`;
}

function loadTapesLocal(): Tape[] {
  try {
    return JSON.parse(localStorage.getItem(getStorageKey()) || '[]');
  } catch { return []; }
}

// Dirty tracking for merge conflict resolution
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveInFlight = false;
let pendingSave = false;
const locallyDirtyIds = new Set<string>();
const locallyDeletedIds = new Set<string>();
let lastKnownVersion = '';
let lastUploadedVersion = '';

// Merge: dirty local wins, clean local takes remote
function mergeState(
  localItems: Map<string, any>,
  remoteItems: any[],
  dirtySnapshot: Set<string>,
  deletedSnapshot: Set<string>,
) {
  const remoteIds = new Set<string>();
  for (const ri of remoteItems) {
    remoteIds.add(ri.id);
    if (deletedSnapshot.has(ri.id)) continue;
    if (localItems.has(ri.id)) {
      if (!dirtySnapshot.has(ri.id)) localItems.set(ri.id, ri);
    } else {
      localItems.set(ri.id, ri);
    }
  }
  for (const [id] of localItems) {
    if (!remoteIds.has(id) && !dirtySnapshot.has(id)) localItems.delete(id);
  }
  return Array.from(localItems.values());
}

function scheduleRemoteSave() {
  if (!currentUsername) return; // No persistence without a username
  pendingSave = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => flushRemote(), 500);
}

async function flushRemote(retries = 2) {
  if (saveInFlight || !pendingSave) return;
  saveInFlight = true;
  pendingSave = false;
  const dirtySnapshot = new Set(locallyDirtyIds);
  try {
    let localTapes: Tape[] = JSON.parse(localStorage.getItem(getStorageKey()) || '[]');

    // Skip remote sync if no username set
    if (!currentUsername) { saveInFlight = false; return; }

    // Pre-flight merge with remote
    try {
      const rr = await fetch(`/api/tapes?t=${Date.now()}${userParam('&')}`, { cache: 'no-store' });
      if (rr.ok) {
        const remote = await rr.json();
        const v = remote._v || '';
        if (v && v > lastKnownVersion) {
          const remoteTapes: Tape[] = remote.tapes || [];
          localTapes = mergeState(new Map(localTapes.map((t: Tape) => [t.id, t])), remoteTapes, dirtySnapshot, locallyDeletedIds);
          try { localStorage.setItem(getStorageKey(), JSON.stringify(localTapes)); } catch {}
        }
      }
    } catch {}

    const r = await fetch(`/api/tapes${userParam()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tapes: localTapes }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    for (const id of dirtySnapshot) locallyDirtyIds.delete(id);
    locallyDeletedIds.clear();

    try {
      const res = await r.json();
      if (res._v) { lastKnownVersion = res._v; lastUploadedVersion = res._v; }
    } catch {}
  } catch (e) {
    console.error('saveRemote failed:', e);
    if (retries > 0) {
      pendingSave = true;
      setTimeout(() => { saveInFlight = false; flushRemote(retries - 1); }, 2000);
      return;
    }
  }
  saveInFlight = false;
  if (pendingSave) setTimeout(() => flushRemote(), 100);
}

function saveTapesToStorage(tapes: Tape[], dirtyIds?: string[]) {
  if (!currentUsername) return; // No persistence without a username
  try { localStorage.setItem(getStorageKey(), JSON.stringify(tapes)); } catch {}
  if (dirtyIds) dirtyIds.forEach(id => locallyDirtyIds.add(id));
  else tapes.forEach(t => locallyDirtyIds.add(t.id));
  scheduleRemoteSave();
}

function markDeleted(id: string) {
  locallyDeletedIds.add(id);
}

// ── Bridge to vanilla JS player ──

declare global {
  interface Window {
    myApp?: any;
    AppState?: any;
    switchBgType?: (index: number) => void;
    TapesBridge?: {
      onTapePlay: (tape: Tape) => void;
      updateProgress: (videoId: string, progress: number) => void;
      updatePlaylistIndex: (videoId: string, index: number) => void;
      addTapeFromSearch: (videoId: string, title: string, author: string, isPlaylist: boolean, playlistId?: string) => void;
      addInfiniteTape: (config: InfiniteConfig, title: string) => void;
      notifyPlayState: (playing: boolean) => void;
      onTrackEnded: () => void;
      loadNextInfiniteTrack: () => void;
      loadPrevInfiniteTrack: () => void;
    };
  }
}

const CANVAS_W = 4000;
const CANVAS_H = 2400;
const HEADER_BLOCK_H = 160;

// Persistent browser identity for "mine only" filter
function getOwnerId(): string {
  let id = localStorage.getItem('jeem_owner_id');
  if (!id) {
    id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem('jeem_owner_id', id);
  }
  return id;
}

function tidyTapes(tapes: Tape[]): Tape[] {
  const cols = 4;
  return tapes.map((t, i) => ({
    ...t,
    x: 30 + (i % cols) * 260,
    y: HEADER_BLOCK_H + Math.floor(i / cols) * 170,
    angle: Math.round((Math.random() * 10 - 5) * 10) / 10,
  }));
}

// Fetch tracks for infinite tape from IMVDb or YouTube search
// Query suffixes to vary YouTube searches on subsequent pages
const QUERY_SUFFIXES = [
  '', 'official video', 'live', 'official music video',
  'remix', 'full album', 'HD', 'remastered',
  'concert', 'acoustic', 'best of', 'greatest hits',
  'classics', 'mix', 'compilation', 'top hits',
];

async function fetchInfiniteTracks(config: InfiniteConfig, page = 1): Promise<InfiniteTrack[]> {
  try {
    // YouTube search — vary query with suffixes on subsequent pages
    let baseQuery = config.value;
    if (config.type === 'decade') baseQuery = config.value + 's music videos';
    if (config.type === 'genre') baseQuery = config.value + ' music videos';
    if (config.type === 'year') baseQuery = config.value + ' music videos';
    if (config.type === 'artist') baseQuery = config.value + ' music video';

    // Page 1 = no suffix, page 2+ = cycle through suffixes
    const suffixIdx = (page - 1) % QUERY_SUFFIXES.length;
    const suffix = QUERY_SUFFIXES[suffixIdx];
    const query = suffix ? `${baseQuery} ${suffix}` : baseQuery;

    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    return (data || []).map((r: any) => ({
      videoId: r.videoId,
      title: r.title,
      author: r.author,
    }));
  } catch (err) {
    console.error('Failed to fetch infinite tracks:', err);
    return [];
  }
}

// ── Direct DOM mount for mixtape track overlay (no React portal, avoids circular init) ──
// Uses same position/size/font as Creator panel for consistency.
function mountMixtapeOverlay(el: HTMLElement, mixtape: MixtapeData, currentIndex: number, onSelect: (i: number, t: MixtapeTrack) => void) {
  // Apply shared panel styles — same position/size as view 2 info panel
  Object.assign(el.style, {
    position: 'fixed',
    top: '50%',
    left: 'calc(50% - 20px)',
    transform: 'translateY(-50%)',
    width: '50vw',
    maxHeight: '70vh',
    fontFamily: "'04b03', monospace",
    fontSize: '1em',
    color: '#ddd',
    background: 'transparent',
    pointerEvents: 'auto',
    zIndex: '200',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    border: 'none',
    borderRadius: '12px',
    transition: 'opacity 1s ease',
    padding: '24px 24px 20px',
  });
  el.innerHTML = `
    <div style="font-family:'04b03',monospace;font-size:1.3em;color:rgba(255,255,255,0.6);letter-spacing:1.5px;text-transform:uppercase;white-space:nowrap;margin-bottom:12px;flex-shrink:0;">
      ${mixtape.name}
    </div>
    <div style="flex:1;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.2) transparent;padding:10px 14px;">
      ${mixtape.tracks.map((track, i) => `
        <div data-idx="${i}" data-videoid="${track.videoId}" data-title="${track.title}" data-author="${track.author}"
          style="display:flex;align-items:center;gap:8px;font-family:'04b03',monospace;font-size:1em;color:${i === currentIndex ? '#fff' : 'rgba(255,255,255,0.4)'};cursor:pointer;padding:6px 4px;border-bottom:1px solid rgba(255,255,255,0.04);border-radius:3px;background:${i === currentIndex ? 'rgba(255,255,255,0.08)' : 'transparent'};transition:color 0.15s;"
          title="${track.title} — ${track.author}">
          <span style="color:rgba(255,255,255,0.4);width:30px;flex-shrink:0;text-align:right;font-size:1em;">${String(i + 1).padStart(2, '0')}.</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:1em;">${track.title}</span>
          <span style="color:rgba(255,255,255,0.4);flex-shrink:0;width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:1em;">${track.author}</span>
          <span style="color:rgba(255,255,255,0.35);flex-shrink:0;width:50px;text-align:right;font-size:1em;">${track.durationText || ''}</span>
        </div>
      `).join('')}
    </div>
  `;
  el.querySelectorAll('[data-idx]').forEach(child => {
    child.addEventListener('click', () => {
      const idx = parseInt(child.getAttribute('data-idx') || '0');
      const track: MixtapeTrack = {
        videoId: child.getAttribute('data-videoid') || '',
        title: child.getAttribute('data-title') || '',
        author: child.getAttribute('data-author') || '',
        duration: 0,
        durationText: '',
      };
      onSelect(idx, track);
    });
  });
}

export function TapesTable({ mixtape }: { mixtape?: MixtapeData }) {
  const [tapes, setTapes] = useState<Tape[]>([]);
  const [mounted, setMounted] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dragScreenPos, setDragScreenPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [zOrder, setZOrder] = useState<string[]>([]);
  const [rewindingId, setRewindingId] = useState<string | null>(null);
  const [landingId, setLandingId] = useState<string | null>(null);
  const [show3D, setShow3D] = useState(true);
  // Shared mutable object to initiate a 3D drag from outside (e.g. deck eject)
  const externalDrag = useRef<{ tapeId: string | null; targetX: number; targetZ: number }>({ tapeId: null, targetX: 0, targetZ: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [loadedTape, setLoadedTape] = useState<Tape | null>(null);
  const [deckEjecting, setDeckEjecting] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [infiniteLoading, setInfiniteLoading] = useState(false);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem('jeem_username') || null);
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameLoading, setUsernameLoading] = useState(false);
  const ownerId = useRef(getOwnerId()).current;
  const tableRef = useRef<HTMLDivElement>(null);
  const playerZoneRef = useRef<HTMLDivElement>(null);
  const deckPortal = typeof document !== 'undefined' ? document.getElementById('tape-deck') : null;
  // Mixtape: virtual tape ID and current track index
  const MIXTAPE_ID = '__jeem_mixtape__';
  const [mixtapeTapeId] = useState<string>(MIXTAPE_ID);
  const mixtapeLoadedRef = useRef(false);
  const [showMixtapeCreator, setShowMixtapeCreator] = useState(false);
  const [mixtapeData, setMixtapeData] = useState<MixtapeData | null>(mixtape ?? null);
  // View system: 'table' = many tapes overview, 'player' = single tape focused
  const [view, setView] = useState<'table' | 'player'>('table');
  const [playerTapeId, setPlayerTapeId] = useState<string | null>(null);
  const tapesRef = useRef(tapes);
  tapesRef.current = tapes;
  const loadedRef = useRef(loadedTape);
  loadedRef.current = loadedTape;
  const autoEjectRef = useRef<() => void>(() => {});
  const infinitePageRef = useRef(1);
  const infiniteFetchingRef = useRef(false);

  // ── Wipe transition ──
  const [wipePhase, setWipePhase] = useState<'none' | 'cover' | 'uncover'>('none');
  const WIPE_DURATION = 300; // ms for each half of the wipe

  // Run a callback behind a wipe: cover → swap → uncover
  const wipeTransition = useCallback((onCovered: () => void, onUncovered?: () => void) => {
    setWipePhase('cover');
    setTimeout(() => {
      onCovered();
      // Small delay so React renders the swap before uncovering
      requestAnimationFrame(() => {
        setWipePhase('uncover');
        setTimeout(() => {
          setWipePhase('none');
          if (onUncovered) onUncovered();
        }, WIPE_DURATION);
      });
    }, WIPE_DURATION);
  }, []);

  // ── View transitions ──
  const enterPlayerView = useCallback((tapeId: string) => {
    setMenuId(null);
    wipeTransition(
      // Behind the wipe: despawn all, set up player view
      () => {
        setPlayerTapeId('__despawn__');
        setView('player');
        const startForm = document.getElementById('start-form');
        if (startForm) startForm.style.display = 'none';
        const deckEl = document.getElementById('tape-deck');
        if (deckEl) deckEl.style.display = '';
        // Centre camera between tape (x=-12) and UI panel — offset to x=-4
        requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('jeem-centre-camera', { detail: { x: -4 } })));
      },
      // After uncover: spawn the tape dropping from height
      () => {
        setPlayerTapeId(tapeId);
        setNewTapeIds(s => new Set(s).add(tapeId));
        setTimeout(() => setNewTapeIds(s => { const n = new Set(s); n.delete(tapeId); return n; }), 2000);
      },
    );
  }, [wipeTransition]);

  // Tape excluded from table render — used to force remount for drop animation
  const [excludeTapeId, setExcludeTapeId] = useState<string | null>(null);

  const exitPlayerView = useCallback((droppingTapeId?: string) => {
    wipeTransition(
      // Behind the wipe: swap to table view, exclude dropping tape so it unmounts
      () => {
        if (droppingTapeId) setExcludeTapeId(droppingTapeId);
        setView('table');
        setPlayerTapeId(null);
        setLoadedTape(null);
        setIsPlaying(false);
        if (window.myApp) {
          try { window.myApp.player.pause(); } catch {}
          const songEl = document.getElementById('song-container');
          const titleEl = document.getElementById('title-container');
          const padEl = document.getElementById('padinfo');
          if (songEl) songEl.style.display = 'none';
          if (titleEl) titleEl.style.display = 'none';
          if (padEl) padEl.style.display = 'none';
          if (window.AppState) {
            window.AppState.playing = false;
            window.AppState.starting = true;
            window.AppState.infiniteTape = false;
          }
        }
        const deckEl = document.getElementById('tape-deck');
        if (deckEl) deckEl.style.display = 'none';
        const startForm = document.getElementById('start-form');
        if (startForm) startForm.style.display = '';
        const startEl = document.getElementById('start-container');
        if (startEl) startEl.style.display = 'flex';
        if (window.switchBgType) window.switchBgType(5);
      },
      // After uncover: re-add the tape as new so it remounts and drops from height
      droppingTapeId ? () => {
        setNewTapeIds(s => new Set(s).add(droppingTapeId));
        setExcludeTapeId(null);
        setTimeout(() => setNewTapeIds(s => { const n = new Set(s); n.delete(droppingTapeId); return n; }), 2000);
      } : undefined,
    );
  }, [wipeTransition]);

  // Listen for logo click to return to table view
  useEffect(() => {
    function handleLogoClick(e: Event) {
      if (view !== 'player') return;
      e.preventDefault();
      exitPlayerView();
    }
    // Both logo links: title bar and start header
    const logos = document.querySelectorAll('.start-title a, .title a');
    logos.forEach(el => el.addEventListener('click', handleLogoClick));
    return () => logos.forEach(el => el.removeEventListener('click', handleLogoClick));
  }, [view, exitPlayerView]);

  // Hide deck in table view on mount
  useEffect(() => {
    const deckEl = document.getElementById('tape-deck');
    if (deckEl) deckEl.style.display = view === 'table' ? 'none' : '';
  }, [view]);

  // Double-tap detection
  const lastTapRef = useRef<{ time: number; id: string }>({ time: 0, id: '' });
  const isDoubleTap = useCallback((id: string) => {
    const now = Date.now();
    const last = lastTapRef.current;
    const isDbl = last.id === id && now - last.time < 400;
    lastTapRef.current = { time: now, id };
    return isDbl;
  }, []);

  // Load tapes: localStorage first, then KV merge, then 2s polling
  useEffect(() => {
    // 1. Immediate load from localStorage (only if logged in)
    let loaded: Tape[] = [];
    if (currentUsername) {
      loaded = loadTapesLocal();
    } else {
      // Clear any stale tapes when not logged in
      try { localStorage.removeItem(getStorageKey()); } catch {}
    }

    // Migrate from old history format if empty (only when logged in)
    if (currentUsername && (!loaded || loaded.length === 0)) {
      try {
        const oldHistory = JSON.parse(localStorage.getItem('userVideoHistory') || '[]');
        if (Array.isArray(oldHistory) && oldHistory.length > 0) {
          loaded = oldHistory.map((v: any, i: number) => {
            const isPlaylist = v.type !== 'single';
            const col = i % 4;
            const row = Math.floor(i / 4);
            return {
              id: crypto.randomUUID?.() ?? `${Date.now()}-${i}`,
              videoId: isPlaylist ? '' : v.id,
              playlistId: isPlaylist ? v.id : undefined,
              isPlaylist,
              title: v.name || 'Untitled',
              author: v.author || '',
              tapeStyle: Math.floor(Math.random() * TAPE_STYLES.length),
              textureVariant: nextTextureVariant(),
              progress: v.progress || 0,
              playlistIndex: v.track || 0,
              timestamp: v.timestamp || Date.now(),
              x: 30 + col * 260 + Math.round((Math.random() - 0.5) * 40),
              y: HEADER_BLOCK_H + row * 170 + Math.round((Math.random() - 0.5) * 30),
              angle: Math.round((Math.random() * 40 - 20) * 10) / 10,
            } as Tape;
          });
          saveTapesToStorage(loaded);
        }
      } catch {}
    }

    if (!loaded) loaded = [];

    // Apply "keep tidy" on load if enabled
    if (localStorage.getItem('jeem_keep_tidy') === '1') {
      loaded = tidyTapes(loaded);
    }

    setTapes(loaded);
    setZOrder(loaded.map(t => t.id));
    setMounted(true);

    // 2. Initial KV fetch + merge, then start polling
    async function pollSync() {
      if (!currentUsername) return; // No sync without a username
      if (mixtapeLoadedRef.current) return; // Don't sync over the mixtape tape
      try {
        const r = await fetch(`/api/tapes?t=${Date.now()}${userParam('&')}`, { cache: 'no-store' });
        if (!r.ok) return;
        const remote = await r.json();
        const v = remote._v || '';
        // Skip if this is our own save or version hasn't changed
        if (!v || v === lastKnownVersion || v === lastUploadedVersion) return;
        lastKnownVersion = v;
        const remoteTapes: Tape[] = remote.tapes || [];
        const localTapes = loadTapesLocal();
        const merged = mergeState(
          new Map(localTapes.map((t: Tape) => [t.id, t])),
          remoteTapes,
          new Set(locallyDirtyIds),
          new Set(locallyDeletedIds),
        );
        try { localStorage.setItem(getStorageKey(), JSON.stringify(merged)); } catch {}
        setTapes(merged);
        setZOrder(prev => {
          const ids = new Set(merged.map((t: Tape) => t.id));
          const kept = prev.filter(id => ids.has(id));
          const newIds = merged.filter((t: Tape) => !prev.includes(t.id)).map((t: Tape) => t.id);
          return [...newIds, ...kept];
        });
      } catch {}
    }

    pollSync(); // initial fetch
    const interval = setInterval(pollSync, 2000);
    return () => clearInterval(interval);
  }, []);

  // Persist to localStorage on every state change (instant, no remote sync)
  useEffect(() => {
    if (mounted && currentUsername) {
      try { localStorage.setItem(getStorageKey(), JSON.stringify(tapes)); } catch {}
    }
  }, [tapes, mounted]);

  // Bridge for vanilla JS
  useEffect(() => {
    window.TapesBridge = {
      onTapePlay: () => {},
      updateProgress: (videoId: string, progress: number) => {
        setTapes(prev => {
          const updated = prev.map(t => {
            if (t.videoId === videoId || t.playlistId === videoId) {
              locallyDirtyIds.add(t.id);
              return { ...t, progress };
            }
            return t;
          });
          scheduleRemoteSave();
          return updated;
        });
        // Also update loaded tape if it matches
        setLoadedTape(prev => {
          if (!prev) return prev;
          if (prev.videoId === videoId || prev.playlistId === videoId) {
            return { ...prev, progress };
          }
          return prev;
        });
      },
      updatePlaylistIndex: (videoId: string, index: number) => {
        setTapes(prev => {
          const updated = prev.map(t => {
            if (t.playlistId === videoId) {
              locallyDirtyIds.add(t.id);
              return { ...t, playlistIndex: index, progress: 0 };
            }
            return t;
          });
          scheduleRemoteSave();
          return updated;
        });
        setLoadedTape(prev => {
          if (!prev) return prev;
          if (prev.playlistId === videoId) {
            return { ...prev, playlistIndex: index, progress: 0 };
          }
          return prev;
        });
      },
      notifyPlayState: (playing: boolean) => {
        setIsPlaying(playing);
      },
      onTrackEnded: () => {
        const tape = loadedRef.current;
        if (tape?.isInfinite) {
          // Auto-load next track instead of ejecting
          loadNextRef.current();
        } else {
          autoEjectRef.current();
        }
      },
      loadNextInfiniteTrack: () => {
        loadNextRef.current();
      },
      loadPrevInfiniteTrack: () => {
        loadPrevRef.current();
      },
      addInfiniteTape: (config: InfiniteConfig, title: string) => {
        setTapes(prev => {
          const col = prev.length % 3;
          const row2 = Math.floor(prev.length / 3);

          const tape: Tape = {
            id: crypto.randomUUID?.() ?? `${Date.now()}`,
            videoId: '',
            isPlaylist: false,
            isInfinite: true,
            infiniteConfig: config,
            infiniteHistory: [],
            infiniteIndex: 0,
            title,
            author: '',
            tapeStyle: Math.floor(Math.random() * TAPE_STYLES.length),
            textureVariant: nextTextureVariant(),
            progress: 0,
            timestamp: Date.now(),
            x: CANVAS_W / 2 + Math.round((Math.random() - 0.5) * 80),
            y: CANVAS_H / 2 + Math.round((Math.random() - 0.5) * 60),
            angle: Math.round((Math.random() * 40 - 20) * 10) / 10,
            ownerId: getOwnerId(),
          };
          const next = [tape, ...prev];
          if (next.length > 50) next.pop();
          setZOrder(o => [tape.id, ...o]);
          locallyDirtyIds.add(tape.id);
          setNewTapeIds(s => new Set(s).add(tape.id));
          setTimeout(() => setNewTapeIds(s => { const n = new Set(s); n.delete(tape.id); return n; }), 2000);
          scheduleRemoteSave();
          return next;
        });
      },
      addTapeFromSearch: (videoId: string, title: string, author: string, isPlaylist: boolean, playlistId?: string) => {
        setTapes(prev => {
          const dedupKey = isPlaylist ? playlistId! : videoId;
          if (prev.some(t => isPlaylist ? t.playlistId === dedupKey : t.videoId === dedupKey)) {
            const updated = prev.map(t => {
              if ((isPlaylist ? t.playlistId === dedupKey : t.videoId === dedupKey)) {
                locallyDirtyIds.add(t.id);
                return { ...t, timestamp: Date.now() };
              }
              return t;
            });
            scheduleRemoteSave();
            return updated;
          }

          const col = prev.length % 3;
          const row2 = Math.floor(prev.length / 3);

          const tape: Tape = {
            id: crypto.randomUUID?.() ?? `${Date.now()}`,
            videoId,
            playlistId: playlistId || undefined,
            isPlaylist,
            title,
            author,
            tapeStyle: Math.floor(Math.random() * TAPE_STYLES.length),
            textureVariant: nextTextureVariant(),
            progress: 0,
            timestamp: Date.now(),
            x: CANVAS_W / 2 + Math.round((Math.random() - 0.5) * 80),
            y: CANVAS_H / 2 + Math.round((Math.random() - 0.5) * 60),
            angle: Math.round((Math.random() * 40 - 20) * 10) / 10,
            ownerId: getOwnerId(),
          };
          const next = [tape, ...prev];
          if (next.length > 50) next.pop();
          setZOrder(o => [tape.id, ...o]);
          locallyDirtyIds.add(tape.id);
          setNewTapeIds(s => new Set(s).add(tape.id));
          setTimeout(() => setNewTapeIds(s => { const n = new Set(s); n.delete(tape.id); return n; }), 2000);
          scheduleRemoteSave();
          return next;
        });
      },
    };
    return () => { delete window.TapesBridge; };
  }, []);

  // ── Load mixtape on mount ──
  // Reads mixtape from sessionStorage (set by mixtape creator before navigation)
  useEffect(() => {
    if (!mixtape || mixtapeLoadedRef.current) return;
    mixtapeLoadedRef.current = true;

    const tracks: InfiniteTrack[] = mixtape.tracks.map(t => ({
      videoId: t.videoId,
      title: t.title,
      author: t.author,
    }));

    // Place mixtape in a visible spot on the table (left side, below header)
    const mixtapeTape: Tape = {
      id: MIXTAPE_ID,
      videoId: tracks[0]?.videoId || '',
      isPlaylist: false,
      isInfinite: true,
      infiniteConfig: { source: 'youtube', type: 'artist', value: mixtape.name } as InfiniteConfig,
      infiniteHistory: tracks,
      infiniteIndex: 0,
      title: mixtape.name,
      author: 'mixtape',
      tapeStyle: 0,
      textureVariant: 'a',
      progress: 0,
      timestamp: Date.now(),
      x: 30,
      y: HEADER_BLOCK_H + 20,
      angle: 0,
    };

    setTapes([mixtapeTape]);
    setZOrder([MIXTAPE_ID]);
    setMounted(true);

    // Clear sessionStorage so a refresh exits mixtape mode
    try { sessionStorage.removeItem('jeem_mixtape'); } catch {}

    // Hide the vanilla padinfo when mixtape is active
    const padinfo = document.getElementById('padinfo');
    if (padinfo) padinfo.style.display = 'none';
    // NOTE: do NOT auto-play — user drags the tape to the deck when ready
  }, [mixtape]);

  // Show padinfo when mixtape is ejected
  useEffect(() => {
    if (!mixtape) return;
    // After mixtape ejects (loadedTape becomes null or non-mixtape), restore padinfo
    if (loadedTape?.id !== MIXTAPE_ID) {
      const padinfo = document.getElementById('padinfo');
      if (padinfo) padinfo.style.display = '';
    }
  }, [loadedTape, mixtape]);

  // ── Listen for "create mixtape" event from vanilla JS ──
  useEffect(() => {
    function handleCreateMixtape() {
      // Hide search bar / header while creating
      const startForm = document.getElementById('start-form');
      if (startForm) startForm.style.display = 'none';

      // Spawn a blank mixtape tape at centre of the table
      const blankTape: Tape = {
        id: MIXTAPE_ID,
        videoId: '',
        isPlaylist: false,
        isInfinite: true,
        infiniteConfig: { source: 'youtube', type: 'artist', value: 'Mixtape' } as InfiniteConfig,
        infiniteHistory: [],
        infiniteIndex: 0,
        title: '',
        author: '',
        tapeStyle: 0,
        textureVariant: 'a',
        progress: 0,
        timestamp: Date.now(),
        x: CANVAS_W / 2,
        y: CANVAS_H / 2,
        angle: 0,
      };
      setTapes(prev => [...prev.filter(t => t.id !== MIXTAPE_ID), blankTape]);
      setZOrder(prev => [...prev.filter(id => id !== MIXTAPE_ID), MIXTAPE_ID]);
      setShowMixtapeCreator(true);
      // Enter player view (single tape, centred) but keep deck hidden during creation
      setPlayerTapeId(MIXTAPE_ID);
      setView('player');
      const deckEl = document.getElementById('tape-deck');
      if (deckEl) deckEl.style.display = 'none';
      // Centre camera on tape and max zoom
      requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('jeem-centre-camera')));
    }
    window.addEventListener('jeem-create-mixtape', handleCreateMixtape);
    return () => window.removeEventListener('jeem-create-mixtape', handleCreateMixtape);
  }, []);

  // ── Play a single video by ID (used for infinite tape tracks) ──
  const playVideoById = useCallback((videoId: string, title: string, author: string, seekProgress = 0) => {
    if (!window.myApp || !window.AppState) return;
    const AppState = window.AppState;
    AppState.starting = true;
    AppState.singleVideo = true;
    AppState.infiniteTape = true;
    AppState.myVideoName = videoId;
    AppState.songTitle = title;
    AppState.songAuthor = author;

    const titleEl = document.getElementById('title-container');
    if (titleEl) titleEl.style.display = 'block';

    // Show prev/next buttons for infinite tapes
    const prevEl = document.getElementById('playlist-prev');
    const nextEl = document.getElementById('playlist-next');
    const trackEl = document.getElementById('track-number');
    if (prevEl) prevEl.style.display = '';
    if (nextEl) nextEl.style.display = '';
    if (trackEl) trackEl.style.display = 'none';

    window.myApp.submitVideoNameFromSaved(videoId, 0, seekProgress);
    setCurrentVideoId(videoId);

    // Switch to tapes background mode so the table stays visible while playing
    window.switchBgType(5);

    // Hide vanilla padinfo if mixtape is active
    if (loadedRef.current?.id === MIXTAPE_ID) {
      const padinfo = document.getElementById('padinfo');
      if (padinfo) padinfo.style.display = 'none';
    }
  }, []);

  // ── Load next track for infinite tape ──
  const loadNextInfiniteTrack = useCallback(async () => {
    const tape = loadedRef.current;
    if (!tape?.isInfinite || !tape.infiniteConfig || infiniteFetchingRef.current) return;

    const history = tape.infiniteHistory || [];
    const idx = tape.infiniteIndex ?? -1;

    // If we have a next track in history, play it
    if (idx + 1 < history.length) {
      const nextIdx = idx + 1;
      const track = history[nextIdx];
      setLoadedTape(prev => prev ? { ...prev, infiniteIndex: nextIdx, videoId: track.videoId, progress: 0 } : prev);
      setTapes(prev => prev.map(t => t.id === tape.id ? { ...t, infiniteIndex: nextIdx, videoId: track.videoId, progress: 0 } : t));
      locallyDirtyIds.add(tape.id);
      scheduleRemoteSave();
      playVideoById(track.videoId, track.title, track.author);
      return;
    }

    // Otherwise fetch more tracks — try multiple query variations
    infiniteFetchingRef.current = true;
    setInfiniteLoading(true);
    const existingIds = new Set(history.map(t => t.videoId));
    let uniqueNew: InfiniteTrack[] = [];

    // Try up to 3 successive pages/suffixes to find fresh tracks
    for (let attempt = 0; attempt < 3 && uniqueNew.length === 0; attempt++) {
      infinitePageRef.current += 1;
      const newTracks = await fetchInfiniteTracks(tape.infiniteConfig, infinitePageRef.current);
      if (newTracks.length === 0) continue;
      const fresh = newTracks.filter(t => !existingIds.has(t.videoId));
      uniqueNew.push(...fresh);
    }

    infiniteFetchingRef.current = false;
    if (uniqueNew.length === 0) { setInfiniteLoading(false); return; }

    const updatedHistory = [...history, ...uniqueNew];
    const nextIdx = idx + 1;
    const track = updatedHistory[nextIdx];

    setInfiniteLoading(false);
    setLoadedTape(prev => prev ? { ...prev, infiniteHistory: updatedHistory, infiniteIndex: nextIdx, videoId: track.videoId, progress: 0 } : prev);
    setTapes(prev => prev.map(t => t.id === tape.id ? { ...t, infiniteHistory: updatedHistory, infiniteIndex: nextIdx, videoId: track.videoId, progress: 0 } : t));
    locallyDirtyIds.add(tape.id);
    scheduleRemoteSave();
    playVideoById(track.videoId, track.title, track.author);
  }, [playVideoById]);

  // ── Load previous track for infinite tape ──
  const loadPrevInfiniteTrack = useCallback(() => {
    const tape = loadedRef.current;
    if (!tape?.isInfinite) return;

    const history = tape.infiniteHistory || [];
    const idx = tape.infiniteIndex ?? 0;
    if (idx <= 0 || history.length === 0) return;

    const prevIdx = idx - 1;
    const track = history[prevIdx];

    setLoadedTape(prev => prev ? { ...prev, infiniteIndex: prevIdx, videoId: track.videoId, progress: 0 } : prev);
    setTapes(prev => prev.map(t => t.id === tape.id ? { ...t, infiniteIndex: prevIdx, videoId: track.videoId, progress: 0 } : t));
    locallyDirtyIds.add(tape.id);
    scheduleRemoteSave();
    playVideoById(track.videoId, track.title, track.author);
  }, [playVideoById]);

  const loadNextRef = useRef(loadNextInfiniteTrack);
  loadNextRef.current = loadNextInfiniteTrack;
  const loadPrevRef = useRef(loadPrevInfiniteTrack);
  loadPrevRef.current = loadPrevInfiniteTrack;

  // ── Play tape via vanilla JS bridge ──
  // Ref to avoid TDZ: setTimeout closure captures this instead of the const directly
  const loadIntoPlayerRef = useRef<((tape: Tape) => void) | null>(null);
  const loadIntoPlayer = useCallback((tape: Tape) => {
    setLoadedTape(tape);
    playTapeInsert();
    setTimeout(playTapeWhirr, 200);
    if (!window.myApp) return;
    const AppState = window.AppState;
    if (!AppState) return;

    AppState.starting = true;

    // Show jeem-fm title when playing
    const titleEl = document.getElementById('title-container');
    if (titleEl) titleEl.style.display = 'block';

    if (tape.isInfinite && tape.infiniteConfig) {
      // Infinite tape: load from history or fetch first batch
      AppState.infiniteTape = true;
      infinitePageRef.current = 1;

      if (tape.infiniteHistory && tape.infiniteHistory.length > 0 && tape.infiniteIndex !== undefined) {
        // Resume from saved position
        const track = tape.infiniteHistory[tape.infiniteIndex];
        if (track) {
          playVideoById(track.videoId, track.title, track.author, tape.progress ?? 0);
          return;
        }
      }

      // Fetch first batch
      setInfiniteLoading(true);
      fetchInfiniteTracks(tape.infiniteConfig).then(tracks => {
        setInfiniteLoading(false);
        if (tracks.length === 0) return;
        const updatedTape = { ...tape, infiniteHistory: tracks, infiniteIndex: 0, videoId: tracks[0].videoId };
        setLoadedTape(updatedTape);
        setTapes(prev => prev.map(t => t.id === tape.id ? updatedTape : t));
        locallyDirtyIds.add(tape.id);
        scheduleRemoteSave();
        playVideoById(tracks[0].videoId, tracks[0].title, tracks[0].author);
      });
      return;
    }

    AppState.infiniteTape = false;

    if (tape.isPlaylist && tape.playlistId) {
      AppState.singleVideo = false;
      AppState.myVideoPlaylistName = tape.playlistId;
      AppState.songTitle = tape.title;
      AppState.songAuthor = tape.author;
      window.myApp.submitVideoNameFromSaved(tape.playlistId, tape.playlistIndex ?? 0, tape.progress ?? 0);
    } else {
      AppState.singleVideo = true;
      AppState.myVideoName = tape.videoId;
      AppState.songTitle = tape.title;
      AppState.songAuthor = tape.author;
      window.myApp.submitVideoNameFromSaved(tape.videoId, 0, tape.progress ?? 0);
    }
  }, [playVideoById]);
  // Keep ref in sync so setTimeout callbacks (which run after paint) can call the latest version
  loadIntoPlayerRef.current = loadIntoPlayer;

  const deleteTape = useCallback((id: string) => {
    markDeleted(id);
    setTapes(prev => prev.filter(t => t.id !== id));
    scheduleRemoteSave();
    setZOrder(prev => prev.filter(i => i !== id));
    setLoadedTape(cur => { if (cur?.id === id) return null; return cur; });
    setMenuId(null);
  }, []);

  const rewindTape = useCallback((id: string) => {
    locallyDirtyIds.add(id);
    setTapes(prev => prev.map(t => t.id === id ? { ...t, progress: 0 } : t));
    scheduleRemoteSave();
    setRewindingId(id);
    setTimeout(() => setRewindingId(null), 400);
    setMenuId(null);
  }, []);

  // Auto-eject: rewind tape to 0, clear player, return tape to table
  const autoEject = useCallback(() => {
    const tape = loadedRef.current;
    if (!tape) return;

    // Rewind progress to 0
    locallyDirtyIds.add(tape.id);
    setTapes(prev => prev.map(t => t.id === tape.id ? { ...t, progress: 0 } : t));
    scheduleRemoteSave();
    setRewindingId(tape.id);
    setTimeout(() => setRewindingId(null), 400);

    setLoadedTape(null);
    setIsPlaying(false);

    // Clear player UI
    if (window.myApp) {
      try { window.myApp.player.pause(); } catch {}
      const songEl = document.getElementById('song-container');
      const titleEl = document.getElementById('title-container');
      const padEl = document.getElementById('padinfo');
      if (songEl) songEl.style.display = 'none';
      if (titleEl) titleEl.style.display = 'none';
      if (padEl) padEl.style.display = 'none';
      const startEl = document.getElementById('start-container');
      if (startEl) startEl.style.display = 'flex';
      if (window.AppState) {
        window.AppState.playing = false;
        window.AppState.starting = true;
        window.AppState.infiniteTape = false;
      }
    }

    if (window.switchBgType) window.switchBgType(5);
  }, []);
  autoEjectRef.current = autoEject;

  // ── Username login/logout ──
  const handleLogin = useCallback(async (name: string) => {
    const normalized = name.toLowerCase().trim();
    if (!/^[a-z0-9-]{3,20}$/.test(normalized)) {
      setUsernameError('3-20 chars, a-z 0-9 -');
      return;
    }
    setUsernameLoading(true);
    setUsernameError('');
    try {
      // Check if username exists
      const checkRes = await fetch(`/api/user?username=${encodeURIComponent(normalized)}`);
      const checkData = await checkRes.json();

      if (!checkData.exists) {
        // Claim it
        const claimRes = await fetch('/api/user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: normalized }),
        });
        const claimData = await claimRes.json();
        if (claimData.error === 'taken') {
          setUsernameError('name taken');
          setUsernameLoading(false);
          return;
        }
        if (!claimRes.ok) {
          setUsernameError(claimData.error || 'failed');
          setUsernameLoading(false);
          return;
        }
      }

      // Set username
      currentUsername = normalized;
      localStorage.setItem('jeem_username', normalized);
      setUsername(normalized);

      // Reset sync state
      locallyDirtyIds.clear();
      locallyDeletedIds.clear();
      lastKnownVersion = '';
      lastUploadedVersion = '';

      // Try to fetch existing tapes for this user
      const r = await fetch(`/api/tapes?t=${Date.now()}${userParam('&')}`, { cache: 'no-store' });
      if (r.ok) {
        const remote = await r.json();
        const remoteTapes: Tape[] = remote.tapes || [];
        if (remoteTapes.length > 0) {
          // Remote has tapes — use them (logging in on new device)
          setTapes(remoteTapes);
          setZOrder(remoteTapes.map(t => t.id));
          try { localStorage.setItem(getStorageKey(), JSON.stringify(remoteTapes)); } catch {}
          if (remote._v) { lastKnownVersion = remote._v; lastUploadedVersion = remote._v; }
        } else {
          // No remote tapes — push current local tapes up
          const local = loadTapesLocal();
          if (local.length > 0) {
            local.forEach(t => locallyDirtyIds.add(t.id));
            scheduleRemoteSave();
          }
        }
      }
    } catch (e) {
      setUsernameError('network error');
    }
    setUsernameLoading(false);
  }, []);

  const handleLogout = useCallback(() => {
    // Remove user tapes before clearing username (getStorageKey reads it)
    localStorage.removeItem(getStorageKey());
    // Also clear the base key in case it has stale data
    localStorage.removeItem('jeem_tapes');
    currentUsername = null;
    localStorage.removeItem('jeem_username');
    window.location.reload();
  }, []);

  const cancelMenu = useCallback(() => { setMenuId(null); }, []);

  const [dragging3D, setDragging3D] = useState(false);

  // --- 3D table callbacks ---
  const handle3DDragStart = useCallback(() => {
    cancelMenu();
    setDragging3D(true);
  }, [cancelMenu]);

  const handle3DDragEnd = useCallback((tapeId: string, x2d: number, y2d: number, droppedOnDeck: boolean) => {
    setDragging3D(false);
    // Block interaction with mixtape tape while creator is open
    if (tapeId === MIXTAPE_ID && showMixtapeCreator) return;
    if (droppedOnDeck && view === 'player') {
      // Only allow deck loading in player view
      const t = tapesRef.current.find(t => t.id === tapeId);
      if (t) loadIntoPlayer(t);
    } else if (!droppedOnDeck && view === 'table') {
      // Only save position changes in table view
      locallyDirtyIds.add(tapeId);
      setTapes(prev => prev.map(t => t.id === tapeId ? { ...t, x: x2d, y: y2d } : t));
      scheduleRemoteSave();
    }
  }, [loadIntoPlayer, showMixtapeCreator, view]);

  const handle3DDoubleTap = useCallback((tapeId: string) => {
    if (tapeId === MIXTAPE_ID && showMixtapeCreator) return;
    if (view === 'table') {
      enterPlayerView(tapeId);
    } else if (view === 'player') {
      exitPlayerView(tapeId);
    }
  }, [showMixtapeCreator, view, enterPlayerView, exitPlayerView]);

  const handle3DMenuAction = useCallback((_tapeId: string, _action: 'link' | 'rewind' | 'remove') => {
    // Context menu disabled — functionality will be rebuilt later
  }, []);

  const [newTapeIds, setNewTapeIds] = useState(() => new Set<string>());

  // --- Drag from table ---
  const startDrag = useCallback((e: React.PointerEvent, tape: Tape) => {
    e.preventDefault();
    e.stopPropagation();
    cancelMenu();

    const tbl = tableRef.current!;
    const rect = tbl.getBoundingClientRect();
    const tapeScreenX = tape.x! - tbl.scrollLeft + rect.left;
    const tapeScreenY = tape.y! - tbl.scrollTop + rect.top;
    const gx = e.clientX - tapeScreenX;
    const gy = e.clientY - tapeScreenY;
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;

    function beginDrag() {
      dragging = true;
      setDragId(tape.id);
      setDragPos({ x: tape.x!, y: tape.y! });
      setDragScreenPos({ x: startX - gx, y: startY - gy });
      setZOrder(prev => [...prev.filter(id => id !== tape.id), tape.id]);
    }

    function posFromEvent(ev: PointerEvent) {
      const sx = ev.clientX - gx;
      const sy = ev.clientY - gy;
      const r = tbl.getBoundingClientRect();
      return { sx, sy, cx: sx - r.left + tbl.scrollLeft, cy: sy - r.top + tbl.scrollTop };
    }

    function onMove(ev: PointerEvent) {
      if (!dragging) {
        if (Math.abs(ev.clientX - startX) > 5 || Math.abs(ev.clientY - startY) > 5) beginDrag();
        else return;
      }
      const { sx, sy, cx, cy } = posFromEvent(ev);
      setDragPos({ x: cx, y: cy });
      setDragScreenPos({ x: sx, y: sy });
      // Check drag over deck
      const pr = playerZoneRef.current?.getBoundingClientRect();
      setDragOver(!!pr && ev.clientX >= pr.left && ev.clientX <= pr.right && ev.clientY >= pr.top && ev.clientY <= pr.bottom);
    }

    function onUp(ev: PointerEvent) {
      cancelMenu();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!dragging) return;
      // Check if dropped on deck
      const pr = playerZoneRef.current?.getBoundingClientRect();
      const overPlayer = !!pr && ev.clientX >= pr.left && ev.clientX <= pr.right && ev.clientY >= pr.top && ev.clientY <= pr.bottom;
      if (overPlayer) {
        const t = tapesRef.current.find(t => t.id === tape.id);
        if (t) loadIntoPlayer(t);
      } else {
        const { cx, cy } = posFromEvent(ev);
        locallyDirtyIds.add(tape.id);
        setTapes(prev => prev.map(t => t.id === tape.id ? { ...t, x: cx, y: Math.max(cy, HEADER_BLOCK_H) } : t));
        scheduleRemoteSave();
      }
      setDragId(null); setDragPos(null); setDragScreenPos(null); setDragOver(false);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [loadIntoPlayer, cancelMenu]);

  // --- Drag out of deck ---
  const startDeckDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const tape = loadedRef.current!;
    const startX = e.clientX;
    const startY = e.clientY;
    let holdReady = false;
    let ejected = false;

    const holdTimer = setTimeout(() => { holdReady = true; }, 100);

    const deckEl = (e.target as HTMLElement).closest('.deck-slot') as HTMLElement | null;
    const deckRect = deckEl?.getBoundingClientRect();
    const gx = deckRect ? e.clientX - deckRect.left : 117;
    const gy = deckRect ? e.clientY - deckRect.top : 72;

    function eject(fromEv: PointerEvent) {
      ejected = true;
      playTapeEject();

      // Save progress before stopping
      if (window.myApp) {
        try { window.myApp._saveProgress(); } catch {}
        const progress = (() => { try { return window.myApp._getProgress(); } catch { return 0; } })();
        if (progress > 0) {
          locallyDirtyIds.add(tape.id);
          setTapes(prev => prev.map(t => t.id === tape.id ? { ...t, progress } : t));
          scheduleRemoteSave();
        }
      }

      setLoadedTape(null);
      setDeckEjecting(true);

      // Fully stop and clear the player
      if (window.myApp) {
        try { window.myApp.player.pause(); } catch {}
        // Hide song/title UI
        const songEl = document.getElementById('song-container');
        const titleEl = document.getElementById('title-container');
        const padEl = document.getElementById('padinfo');
        if (songEl) songEl.style.display = 'none';
        if (titleEl) titleEl.style.display = 'none';
        if (padEl) padEl.style.display = 'none';
        // Show start screen header
        const startEl = document.getElementById('start-container');
        if (startEl) startEl.style.display = 'flex';
        if (window.AppState) {
          window.AppState.playing = false;
          window.AppState.starting = true;
          window.AppState.infiniteTape = false;
        }
        // Suppress pause overlay (state_change fires async after pause)
        setTimeout(() => {
          const pauseEl = document.getElementById('pause-overlay');
          if (pauseEl) pauseEl.classList.remove('visible');
        }, 50);
      }

      // Switch to tapes bg so user can see where the tape lands
      if (window.switchBgType) window.switchBgType(5);

      // Hand off to 3D drag system — tape will appear on table and be picked up
      // Store screen coords so the 3D scene can raycast the initial position
      (externalDrag.current as any).screenX = fromEv.clientX;
      (externalDrag.current as any).screenY = fromEv.clientY;
      externalDrag.current.targetX = 0;
      externalDrag.current.targetZ = 0;
      externalDrag.current.tapeId = tape.id;
    }

    function onMove(ev: PointerEvent) {
      if (!ejected && holdReady && (Math.abs(ev.clientX - startX) > 5 || Math.abs(ev.clientY - startY) > 5)) {
        eject(ev);
      }
    }

    function onUp(ev: PointerEvent) {
      clearTimeout(holdTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!ejected) {
        // Quick click on loaded tape — toggle play/pause via jeem-fm
        if (window.myApp) window.myApp.togglePlayback();
        return;
      }
      setDeckEjecting(false);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [loadIntoPlayer]);

  // --- Pan on background ---
  const startPan = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-tape]')) return;
    if ((e.target as HTMLElement).closest('[data-deck]')) return;
    const tbl = tableRef.current!;
    const startX = e.clientX;
    const startY = e.clientY;
    const startSL = tbl.scrollLeft;
    const startST = tbl.scrollTop;

    function onMove(ev: PointerEvent) {
      tbl.scrollLeft = startSL - (ev.clientX - startX);
      tbl.scrollTop = startST - (ev.clientY - startY);
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setIsPanning(false);
    }
    setIsPanning(true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  if (!mounted) return null;

  // Active area in 2D coords
  const cx = CANVAS_W / 2;   // 2000
  const cy = CANVAS_H / 2;   // 1200
  const halfAX = 22.9 * 50;  // ACTIVE_W/2 * MAP_SCALE ≈ 1145
  const halfAZ = 15 * 50;    // ACTIVE_H/2 * MAP_SCALE = 750
  const minX = cx - halfAX + 150;
  const maxX = cx + halfAX - 150;
  const minY = cy - halfAZ + 100;
  const maxY = cy + halfAZ - 100;

  const positionedTapes = tapes.map((tape, i) => {
    if (tape.x !== undefined && tape.y !== undefined) {
      // If already inside the active area, keep as-is
      const inside = tape.x >= minX && tape.x <= maxX && tape.y >= minY && tape.y <= maxY;
      if (inside) return tape;
      // Otherwise re-center with jitter (old tapes may have coords from a different layout)
      return {
        ...tape,
        x: cx + Math.round((Math.random() - 0.5) * 80),
        y: cy + Math.round((Math.random() - 0.5) * 60),
      };
    }
    const col = i % 3;
    const row = Math.floor(i / 3);
    return {
      ...tape,
      x: cx + Math.round((Math.random() - 0.5) * 80),
      y: cy + Math.round((Math.random() - 0.5) * 60),
      angle: Math.round((Math.random() * 40 - 20) * 10) / 10,
    };
  });

  console.log('[TapesTable] tapes:', tapes.length, 'positioned:', positionedTapes.length,
    positionedTapes.slice(0, 2).map(t => ({ id: t.id.slice(0, 8), x: t.x, y: t.y })));

  // Tapes on table = all except what's loaded in the deck
  const tableTapes = positionedTapes.filter(t => t.id !== loadedTape?.id);

  return (
    <>
      <style>{`
        @keyframes tape-spin-slow { to { transform: rotate(-360deg) } }
        @keyframes tape-spin-fast { to { transform: rotate(-360deg) } }
        @keyframes tape-rewind { 0%,100% { transform: rotate(0deg) } 20% { transform: rotate(-4deg) } 40% { transform: rotate(4deg) } 60% { transform: rotate(-3deg) } 80% { transform: rotate(2deg) } }
        @keyframes tape-loading-spin { to { transform: rotate(360deg) } }
        .tapes-scroll::-webkit-scrollbar { display: none; }
        .tapes-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        @keyframes wipe-in { from { clip-path: polygon(100% 0, 100% 0, 100% 0); } to { clip-path: polygon(100% 0, 0 0, 0 100%, 100% 100%); } }
        @keyframes wipe-out { from { clip-path: polygon(100% 0, 0 0, 0 100%, 100% 100%); } to { clip-path: polygon(0 100%, 0 100%, 0 100%); } }
      `}</style>

      {/* 3D table with FBX tapes, physics, drag, camera pan */}
      <Suspense fallback={<div style={{ flex: 1, background: '#0a0805' }} />}>
        <TapesTable3D
          tapes={view === 'player' && playerTapeId
            ? positionedTapes.filter(t => t.id === playerTapeId).map(t => ({ ...t, x: CANVAS_W * 0.35, y: CANVAS_H / 2 }))
            : positionedTapes.filter(t => t.id !== excludeTapeId)}
          loadedTapeId={loadedTape?.id ?? null}
          onDragStart={handle3DDragStart}
          onDragEnd={handle3DDragEnd}
          onDoubleTap={handle3DDoubleTap}
          onMenuAction={handle3DMenuAction}
          menuId={menuId}
          onClearMenu={cancelMenu}
          newTapeIds={newTapeIds}
          externalDrag={externalDrag.current}
          lockedTapeId={showMixtapeCreator ? MIXTAPE_ID : null}
          lockCamera={view === 'player' || showMixtapeCreator}
        />
      </Suspense>

      {/* Black wipe overlay for view transitions */}
      {wipePhase !== 'none' && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: '#000', zIndex: 9999, pointerEvents: 'none',
          animation: `${wipePhase === 'cover' ? 'wipe-in' : 'wipe-out'} ${WIPE_DURATION}ms ease-in-out forwards`,
        }} />
      )}

      {/* Tape info overlay in player view — centred below tape, visible when not dragging */}
      {view === 'player' && playerTapeId && !dragging3D && !showMixtapeCreator && !loadedTape && (() => {
        const tape = tapes.find(t => t.id === playerTapeId);
        if (!tape) return null;
        const hasTracklist = tape.isInfinite && tape.infiniteHistory && tape.infiniteHistory.length > 0;
        return (
          <div className="tape-info-panel" style={{
            position: 'fixed', top: '50%', left: 'calc(50% - 20px)', transform: 'translateY(-50%)',
            width: '50vw', maxHeight: '70vh',
            fontFamily: "'04b03', monospace", fontSize: '1em', color: '#ddd',
            background: 'transparent', pointerEvents: 'auto', zIndex: 200,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            border: 'none', borderRadius: '12px',
            padding: '24px 24px 20px',
          }}>
            <div style={{
              fontFamily: "'04b03', monospace", fontSize: '1.3em',
              color: 'rgba(255,255,255,0.6)', letterSpacing: '1.5px',
              textTransform: 'uppercase', whiteSpace: 'nowrap', marginBottom: hasTracklist ? '12px' : '0',
              flexShrink: 0,
            }}>
              {tape.title || 'Untitled'}
            </div>
            {!hasTracklist && tape.author && (
              <div style={{ color: 'rgba(255,255,255,0.4)', marginTop: '6px', fontSize: '1em' }}>
                {tape.author}
              </div>
            )}
            {hasTracklist && (
              <div style={{
                flex: 1, overflowY: 'auto',
                scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.2) transparent',
                padding: '10px 14px',
              }}>
                {tape.infiniteHistory!.map((track, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    fontFamily: "'04b03', monospace", fontSize: '1em',
                    color: 'rgba(255,255,255,0.4)',
                    padding: '6px 4px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    borderRadius: '3px',
                  }}>
                    <span style={{ color: 'rgba(255,255,255,0.4)', width: '30px', flexShrink: 0, textAlign: 'right', fontSize: '1em' }}>
                      {String(i + 1).padStart(2, '0')}.
                    </span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, fontSize: '1em' }}>
                      {track.title}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0, width: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '1em' }}>
                      {track.author}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {/* Rewind + Remove buttons */}
            <div style={{
              display: 'flex', justifyContent: 'center', gap: '16px',
              marginTop: '16px', paddingTop: '12px',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              flexShrink: 0,
            }}>
              <button
                onClick={() => { rewindTape(tape.id); }}
                style={{
                  fontFamily: "'04b03', monospace", fontSize: '1em',
                  color: 'rgba(255,255,255,0.5)', background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px',
                  padding: '6px 18px', cursor: 'pointer',
                }}
              >rewind</button>
              <button
                onClick={() => { deleteTape(tape.id); exitPlayerView(); }}
                style={{
                  fontFamily: "'04b03', monospace", fontSize: '1em',
                  color: 'rgba(200,80,80,0.7)', background: 'transparent',
                  border: '1px solid rgba(200,80,80,0.3)', borderRadius: '6px',
                  padding: '6px 18px', cursor: 'pointer',
                }}
              >remove</button>
            </div>
          </div>
        );
      })()}

      {/* Deck — portaled outside tapes-root so it's visible in all bg modes */}
      {/* Username bar — portaled into start-header */}
      {typeof document !== 'undefined' && document.getElementById('username-area') && createPortal(
        <div className="username-bar">
          {username ? (
            <>
              <span className="username-display">@ {username}</span>
              <button onClick={handleLogout}>x</button>
            </>
          ) : (
            <>
              <form onSubmit={e => { e.preventDefault(); handleLogin(usernameInput); }} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="text"
                  value={usernameInput}
                  onChange={e => { setUsernameInput(e.target.value); setUsernameError(''); }}
                  placeholder="set username..."
                  maxLength={20}
                  disabled={usernameLoading}
                />
                <button type="submit" disabled={usernameLoading}>{usernameLoading ? '...' : 'set'}</button>
              </form>
              {usernameError && <span className="username-error">{usernameError}</span>}
            </>
          )}
        </div>,
        document.getElementById('username-area')!
      )}

      {deckPortal && createPortal(
        <div
          data-deck="true"
          ref={playerZoneRef}
          style={{ position: 'relative' }}
        >
          <div
            className="deck-slot"
            onPointerDown={loadedTape ? startDeckDrag : undefined}
            style={{
              width: 234, height: 143, position: 'relative',
              background: loadedTape ? 'transparent' : '#141414',
              borderRadius: 5,
              border: dragging3D ? '1px solid rgba(249,115,22,0.5)' : !loadedTape && dragId ? '1px solid rgba(249,115,22,0.4)' : loadedTape ? 'none' : '1px solid #333',
              display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
              cursor: loadedTape ? 'grab' : 'default',
              opacity: dragging3D ? 0 : 1,
              boxShadow: !loadedTape && dragId
                ? 'inset 0 2px 8px rgba(0,0,0,0.3), 0 0 12px rgba(249,115,22,0.15), 0 0 4px rgba(249,115,22,0.1)'
                : loadedTape ? 'none' : 'inset 0 2px 8px rgba(0,0,0,0.3), 0 4px 20px rgba(0,0,0,0.5)',
              transition: 'opacity 0.2s, box-shadow 0.2s, border-color 0.2s',
            }}
          >
            {/* Trapezoid indent */}
            <div style={{ position: 'absolute', bottom: 2, left: 117 - 75, width: 150, height: 28, background: '#111', border: '1px solid #1a1a1a', clipPath: 'polygon(6px 0, 144px 0, 100% 100%, 0 100%)', boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.6)', zIndex: 0 }} />

            {/* Machinery holes/indents */}
            <div style={{ position: 'absolute', left: 20, top: 20, width: 8, height: 8, borderRadius: '50%', background: '#111', border: '1px solid #1a1a1a', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.8)', zIndex: 0 }} />
            <div style={{ position: 'absolute', right: 20, top: 20, width: 8, height: 8, borderRadius: '50%', background: '#111', border: '1px solid #1a1a1a', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.8)', zIndex: 0 }} />
            <div style={{ position: 'absolute', left: 12, top: 68, width: 6, height: 14, borderRadius: 2, background: '#111', border: '1px solid #1a1a1a', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.8)', zIndex: 0 }} />
            <div style={{ position: 'absolute', right: 12, top: 68, width: 6, height: 14, borderRadius: 2, background: '#111', border: '1px solid #1a1a1a', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.8)', zIndex: 0 }} />
            <div style={{ position: 'absolute', left: 117 - 4, top: 108, width: 8, height: 5, borderRadius: 1, background: '#111', border: '1px solid #1a1a1a', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6)', zIndex: 0 }} />

            {/* Faded gold/silver sticker between spool heads */}
            <div style={{ position: 'absolute', left: 65 + 22, top: 55, width: 169 - 65 - 44, height: 26, borderRadius: 2, background: 'linear-gradient(135deg, #6b4420 0%, #8a5a28 30%, #7a4a20 50%, #5a3a18 70%, #6b4420 100%)', opacity: 0.5, zIndex: 0 }} />

            {/* Spindle hubs — 3D raised look */}
            {[70, 164].map((cx, i) => (
              <div key={i} style={{ position: 'absolute', left: cx - 13, top: 65 - 13, width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(160deg, #2a2a2a 0%, #111 60%, #000 100%)', border: '1px solid #333', boxShadow: '0 2px 4px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.08)', zIndex: 0 }}>
                <div style={{ position: 'absolute', inset: 3, borderRadius: '50%', background: 'linear-gradient(160deg, #222 0%, #141414 50%, #0a0a0a 100%)', boxShadow: 'inset 0 -1px 2px rgba(255,255,255,0.06), inset 0 1px 2px rgba(0,0,0,0.6)', border: '0.5px solid #2a2a2a' }}>
                  <div style={{ position: 'absolute', left: '50%', top: 2, bottom: 2, width: 2, transform: 'translateX(-50%)', background: 'linear-gradient(180deg, #333 0%, #1a1a1a 100%)', borderRadius: 1, boxShadow: '0 0 1px rgba(0,0,0,0.5)' }} />
                  <div style={{ position: 'absolute', top: '50%', left: 2, right: 2, height: 2, transform: 'translateY(-50%)', background: 'linear-gradient(90deg, #333 0%, #1a1a1a 100%)', borderRadius: 1, boxShadow: '0 0 1px rgba(0,0,0,0.5)' }} />
                  <div style={{ position: 'absolute', left: '50%', top: '50%', width: 7, height: 7, transform: 'translate(-50%, -50%)', borderRadius: '50%', background: 'linear-gradient(145deg, #2a2a2a 0%, #080808 100%)', border: '0.5px solid #333', boxShadow: '0 1px 2px rgba(0,0,0,0.7), inset 0 0.5px 0.5px rgba(255,255,255,0.1)' }} />
                </div>
              </div>
            ))}

            {loadedTape ? (
              <div style={{ position: 'relative', zIndex: 1 }}>
                <DeckTape3D tape={loadedTape} playing={isPlaying} loading={infiniteLoading} />
              </div>
            ) : null}
          </div>
          {/* Glow overlay — visible when dragging a 3D tape, sits above the hidden deck-slot */}
          {dragging3D && (
            <div style={{
              position: 'absolute', inset: 0,
              borderRadius: 5,
              border: '1px solid rgba(249,115,22,0.5)',
              boxShadow: '0 0 20px rgba(249,115,22,0.4), 0 0 40px rgba(249,115,22,0.2)',
              pointerEvents: 'none',
            }} />
          )}
        </div>,
        deckPortal
      )}

      {/* Mixtape track list — direct DOM mount, no React portal */}
      {mixtapeData && loadedTape?.id === MIXTAPE_ID && (
        <MixtapeOverlayEffect
          mixtape={mixtapeData}
          currentIndex={loadedTape.infiniteIndex ?? 0}
          onSelectTrack={(i, track) => {
            setLoadedTape(prev => prev ? { ...prev, infiniteIndex: i, videoId: track.videoId, progress: 0 } : prev);
            setTapes(prev => prev.map(t => t.id === MIXTAPE_ID ? { ...t, infiniteIndex: i, videoId: track.videoId, progress: 0 } : t));
            playVideoById(track.videoId, track.title, track.author);
          }}
        />
      )}

      {/* Mixtape creator overlay — shown inline when user clicks "+ mixtape" */}
      {showMixtapeCreator && (
        <MixtapeCreator
          onBack={() => {
            // Remove the blank mixtape tape and close creator
            setTapes(prev => prev.filter(t => t.id !== MIXTAPE_ID));
            setZOrder(prev => prev.filter(id => id !== MIXTAPE_ID));
            setShowMixtapeCreator(false);
            // Exit player view back to table
            exitPlayerView();
          }}
          onPlay={(tape) => {
            // Populate the spawned mixtape tape with generated tracks
            const tracks: InfiniteTrack[] = tape.tracks.map(t => ({
              videoId: t.videoId,
              title: t.title,
              author: t.author,
            }));
            const mixtapeTape: Tape = {
              id: MIXTAPE_ID,
              videoId: tracks[0]?.videoId || '',
              isPlaylist: false,
              isInfinite: true,
              infiniteConfig: { source: 'youtube', type: 'artist', value: tape.name } as InfiniteConfig,
              infiniteHistory: tracks,
              infiniteIndex: 0,
              title: tape.name || 'Mixtape',
              author: 'mixtape',
              tapeStyle: 0,
              textureVariant: 'a',
              progress: 0,
              timestamp: Date.now(),
              x: CANVAS_W / 2,
              y: CANVAS_H / 2,
              angle: 0,
            };
            setTapes(prev => prev.map(t => t.id === MIXTAPE_ID ? mixtapeTape : t));
            setMixtapeData({ name: tape.name || 'Mixtape', description: tape.description || '', tracks: tape.tracks });
            mixtapeLoadedRef.current = true;
            setShowMixtapeCreator(false);
            // Stay in player view — show deck so user can drag tape to play
            const deckEl = document.getElementById('tape-deck');
            if (deckEl) deckEl.style.display = '';
          }}
        />
      )}

    </>
  );
}

// Small React component that uses useEffect to manage the DOM overlay
function MixtapeOverlayEffect({
  mixtape,
  currentIndex,
  onSelectTrack,
}: {
  mixtape: MixtapeData;
  currentIndex: number;
  onSelectTrack: (index: number, track: MixtapeTrack) => void;
}) {
  useEffect(() => {
    let el = document.getElementById('mixtape-tracklist');
    if (!el) { el = document.createElement('div'); el.id = 'mixtape-tracklist'; document.body.appendChild(el); }
    mountMixtapeOverlay(el, mixtape, currentIndex, onSelectTrack);
    return () => { el?.remove(); };
  }, [mixtape, currentIndex, onSelectTrack]);
  return null;
}
