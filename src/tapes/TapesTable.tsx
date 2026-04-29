import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Tape, TAPE_STYLES, InfiniteConfig, InfiniteTrack } from './types';
import { to3D } from './coords';
import { loadTapes, saveTapes } from './db';
import { buildShareUrl, decodeTapeShare, fetchShareById, type SharePayload } from './share';
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

// ── Texture variant selection (always random) ──
const TEXTURE_VARIANTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n'];
function randomTextureVariant(): string {
  return TEXTURE_VARIANTS[Math.floor(Math.random() * TEXTURE_VARIANTS.length)];
}
const nextTextureVariant = randomTextureVariant;

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

function ShareButton({ tape }: { tape: Tape }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    const url = await buildShareUrl(tape);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for non-secure contexts: select-and-copy via temp textarea
      const ta = document.createElement('textarea');
      ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={onClick}
      className="tape-ui-btn"
      style={{
        background: 'rgba(0,0,0,0.5)', color: 'rgba(250,249,246,0.95)',
        fontFamily: '"04b03", monospace', fontSize: 12, letterSpacing: '1px',
        padding: '6px 10px', cursor: 'pointer', flexShrink: 0,
        border: '1px solid rgba(250,249,246,0.2)',
        pointerEvents: 'auto',
      }}
    >{copied ? 'copied' : 'share'}</button>
  );
}

function playTapeInsert() { playSfx('/sfx/tape-insert.mp3', 0.6, 0.4); }
function playTapeEject() { playSfx('/sfx/tape-eject.mp3', 0.6); }
function playTapeWhirr() { playSfx('/sfx/tape-play.mp3', 0.5); }

// ── Persistence (IndexedDB via db.ts) ──
// jeem_username remains in localStorage as a small config value.

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
      addMixtapeTape: (name: string, tracks: { videoId: string; title: string; author: string }[]) => void;
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
    left: 'calc(50% - 70px)',
    transform: 'translateY(-50%)',
    width: '50vw',
    maxHeight: '70vh',
    fontFamily: "'04b03', monospace",
    fontSize: '1em',
    color: 'rgba(250,249,246,0.9)',
    background: 'transparent',
    pointerEvents: 'auto',
    zIndex: '200',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    border: 'none',
    borderRadius: '0',
    transition: 'opacity 1s ease',
    padding: '24px 24px 20px',
  });
  el.innerHTML = `
    <div style="font-family:'04b03',monospace;font-size:1.3em;color:rgba(250,249,246,0.7);letter-spacing:1.5px;white-space:nowrap;margin-bottom:4px;flex-shrink:0;">
      ${mixtape.name}
    </div>
    <div style="flex:1;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(250,249,246,0.2) transparent;padding:10px 14px;">
      ${mixtape.tracks.map((track, i) => `
        <div data-idx="${i}" data-videoid="${track.videoId}" data-title="${track.title}" data-author="${track.author}"
          style="display:flex;align-items:center;gap:8px;font-family:'04b03',monospace;font-size:1em;color:${i === currentIndex ? 'rgba(250,249,246,0.95)' : 'rgba(250,249,246,0.7)'};cursor:pointer;padding:6px 4px;border-bottom:1px solid rgba(250,249,246,0.04);background:${i === currentIndex ? 'rgba(250,249,246,0.08)' : 'transparent'};transition:color 0.15s;"
          title="${track.title} — ${track.author}">
          <span style="color:rgba(250,249,246,0.6);width:30px;flex-shrink:0;text-align:right;">${String(i + 1).padStart(2, '0')}.</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;">${track.title}</span>
          <span style="color:rgba(250,249,246,0.6);flex-shrink:0;width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${track.author}</span>
          <span style="color:rgba(250,249,246,0.5);flex-shrink:0;width:50px;text-align:right;">${track.durationText || ''}</span>
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
  const [sceneReady, setSceneReady] = useState(false);
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
  // True when the current loadedTape is playing via the 3D recorder rather than
  // the 2D deck — suppresses the deck-side filter so the 3D tape stays visible.
  const [recorderSourced, setRecorderSourced] = useState(false);
  const [deckEjecting, setDeckEjecting] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [infiniteLoading, setInfiniteLoading] = useState(false);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const playerZoneRef = useRef<HTMLDivElement>(null);
  const deckPortal = typeof document !== 'undefined' ? document.getElementById('tape-deck') : null;
  // Mixtape: virtual tape ID and current track index
  const MIXTAPE_ID = '__jeem_mixtape__';
  const [mixtapeTapeId] = useState<string>(MIXTAPE_ID);
  const mixtapeLoadedRef = useRef(false);
  const [showMixtapeCreator, setShowMixtapeCreator] = useState(false);
  const [mixtapeData, setMixtapeData] = useState<MixtapeData | null>(mixtape ?? null);
  const [playlistTracks, setPlaylistTracks] = useState<MixtapeData | null>(null);
  // View system: 'table' = many tapes overview, 'player' = single tape focused
  const [view, setView] = useState<'table' | 'player'>('table');
  const [playerTapeId, setPlayerTapeId] = useState<string | null>(null);
  // Inspect view: closer-zoom single-tape pose (no recorder, no controls).
  // Toggled by double-tap from table view.
  const [inspectTapeId, setInspectTapeId] = useState<string | null>(null);

  // Fetch playlist tracks when inspecting a playlist tape (so tracklist UI shows).
  useEffect(() => {
    if (!inspectTapeId) return;
    const tape = tapesRef.current.find(t => t.id === inspectTapeId);
    if (!tape?.isPlaylist || !tape.playlistId) return;
    if (playlistTracks && playlistTracks.name === (tape.title || 'Playlist')) return;
    setPlaylistTracks(null);
    fetch(`/api/playlist-tracks?list=${encodeURIComponent(tape.playlistId)}`)
      .then(r => r.ok ? r.json() : [])
      .then((tracks: MixtapeTrack[]) => {
        if (tracks.length > 0) {
          setPlaylistTracks({ name: tape.title || 'Playlist', description: '', tracks });
        }
      })
      .catch(() => {});
  }, [inspectTapeId]);

  // Hide vanilla search/mixtape/lucky UI while inspecting a tape.
  useEffect(() => {
    const form = document.getElementById('start-form');
    if (!form) return;
    const prev = form.style.display;
    if (inspectTapeId) form.style.display = 'none';
    return () => { form.style.display = prev; };
  }, [inspectTapeId]);
  const tapesRef = useRef(tapes);
  tapesRef.current = tapes;
  const loadedRef = useRef(loadedTape);
  loadedRef.current = loadedTape;
  const viewRef = useRef(view);
  viewRef.current = view;
  const autoEjectRef = useRef<() => void>(() => {});
  const infinitePageRef = useRef(1);
  const infiniteFetchingRef = useRef(false);
  // Tape just dropped into the recorder — YouTube is still fetching/buffering.
  // Locked from pickup until notifyPlayState(true) fires (or timeout). Prevents
  // the race where a yanked tape leaves the pending play to start with no tape.
  const [recorderLoadingId, setRecorderLoadingId] = useState<string | null>(null);
  const recorderLoadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Wipe transition ──
  // Run a callback inside a glitch flare transition: swap happens at peak blowout.
  // Same signature as the old wipe so all callers can stay put.
  const wipeTransition = useCallback((onCovered: () => void, onUncovered?: () => void) => {
    document.body.classList.add('view-flaring');
    // Peak blowout (~270ms into 600ms) — swap views here so the change is masked by the flare
    setTimeout(() => {
      onCovered();
    }, 270);
    // End of animation
    setTimeout(() => {
      document.body.classList.remove('view-flaring');
      if (onUncovered) onUncovered();
    }, 600);
  }, []);

  // ── View transitions ──
  const enterPlayerView = useCallback((tapeId: string) => {
    setMenuId(null);
    // Pre-fetch playlist tracks if this is a playlist tape
    const tape = tapesRef.current.find(t => t.id === tapeId);
    if (tape?.isPlaylist && tape.playlistId) {
      setPlaylistTracks(null);
      fetch(`/api/playlist-tracks?list=${encodeURIComponent(tape.playlistId)}`)
        .then(r => r.ok ? r.json() : [])
        .then((tracks: MixtapeTrack[]) => {
          if (tracks.length > 0) {
            setPlaylistTracks({ name: tape.title || 'Playlist', description: '', tracks });
          }
        })
        .catch(() => {});
    } else {
      setPlaylistTracks(null);
    }
    setPlayerTapeId(tapeId);
    setView('player');
  }, []);

  // Tape excluded from table render — used to force remount for drop animation
  const [excludeTapeId, setExcludeTapeId] = useState<string | null>(null);

  const exitPlayerView = useCallback((opts?: { skipCameraReset?: boolean }) => {
    setPlayerTapeId(null);
    setView('table');
    setPlaylistTracks(null);
    if (!opts?.skipCameraReset) {
      window.dispatchEvent(new CustomEvent('jeem-centre-camera', { detail: { tx: 0, tz: 0, animate: true } }));
    }
  }, []);

  // Listen for logo click to return to table view
  useEffect(() => {
    function handleLogoClick(e: Event) {
      if (!playerTapeId) return;
      e.preventDefault();
      // Clean up any in-progress mixtape creation
      if (showMixtapeCreator) {
        setTapes(prev => prev.filter(t => t.id !== MIXTAPE_ID));
        setZOrder(prev => prev.filter(id => id !== MIXTAPE_ID));
        setShowMixtapeCreator(false);
        setMixtapeKeywords('');
        setMixtapeGenerating(false);
      }
      exitPlayerView();
    }
    // Both logo links: title bar and start header
    const logos = document.querySelectorAll('.start-title a, .title a');
    logos.forEach(el => el.addEventListener('click', handleLogoClick));
    return () => logos.forEach(el => el.removeEventListener('click', handleLogoClick));
  }, [playerTapeId, exitPlayerView, showMixtapeCreator]);

  // 2D deck UI is hidden entirely — 3D recorder replaces it in player view.
  useLayoutEffect(() => {
    const deckEl = document.getElementById('tape-deck');
    if (deckEl) deckEl.style.display = 'none';
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

  // Load tapes from IndexedDB on mount, migrating from localStorage if first run
  useEffect(() => {
    async function init() {
      let loaded = await loadTapes();

      // One-time migration: import tapes from old localStorage keys
      if (loaded.length === 0) {
        try {
          const username = localStorage.getItem('jeem_username');
          const keys = username
            ? [`jeem_tapes:${username}`, 'jeem_tapes']
            : ['jeem_tapes'];
          for (const key of keys) {
            const stored = localStorage.getItem(key);
            if (stored) {
              const parsed = JSON.parse(stored);
              if (Array.isArray(parsed) && parsed.length > 0) {
                loaded = parsed;
                break;
              }
            }
          }
        } catch {}

        // Also try the even older userVideoHistory format
        if (loaded.length === 0) {
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
            }
          } catch {}
        }

        if (loaded.length > 0) {
          await saveTapes(loaded);
        }
      }

      if (localStorage.getItem('jeem_keep_tidy') === '1') {
        loaded = tidyTapes(loaded);
      }

      // Delay before spawning saved tapes so they pop into view from
      // pickup height (DRAG_HEIGHT) rather than appearing flat on the
      // table. Marking them as `newTapeIds` makes TapeBody use the
      // pickup-height spawnY path.
      // Prepend any tape that arrived via ?t= or ?tape= share URL.
      const shared = await sharedTapePromiseRef.current;
      if (shared) {
        loaded = [shared, ...loaded];
        if (loaded.length > 50) loaded.pop();
      }

      const ids = loaded.map(t => t.id);
      setTimeout(() => {
        setNewTapeIds(s => { const n = new Set(s); ids.forEach(id => n.add(id)); return n; });
        setTapes(loaded);
        setZOrder(ids);
        setMounted(true);
        setTimeout(() => {
          setNewTapeIds(s => { const n = new Set(s); ids.forEach(id => n.delete(id)); return n; });
        }, 2000);
      }, 500);
    }

    init().catch(console.error);
  }, []);

  // Persist to IndexedDB on every tapes state change
  useEffect(() => {
    if (mounted) {
      saveTapes(tapes).catch(console.error);
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
              return { ...t, progress };
            }
            return t;
          });
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
              return { ...t, playlistIndex: index, progress: 0 };
            }
            return t;
          });
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
        if (playing) {
          if (recorderLoadingTimerRef.current) {
            clearTimeout(recorderLoadingTimerRef.current);
            recorderLoadingTimerRef.current = null;
          }
          setRecorderLoadingId(null);
        }
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
            x: CANVAS_W / 2 + Math.round((Math.random() - 0.5) * 280),
            y: CANVAS_H / 2 + Math.round((Math.random() - 0.5) * 200),
            angle: Math.round((Math.random() * 40 - 20) * 10) / 10,
          };
          const next = [tape, ...prev];
          if (next.length > 50) next.pop();
          setZOrder(o => [tape.id, ...o]);
          setNewTapeIds(s => new Set(s).add(tape.id));
          setTimeout(() => setNewTapeIds(s => { const n = new Set(s); n.delete(tape.id); return n; }), 2000);
          return next;
        });
      },
      addMixtapeTape: (name: string, tracks: { videoId: string; title: string; author: string }[]) => {
        setTapes(prev => {
          const tape: Tape = {
            id: crypto.randomUUID?.() ?? `${Date.now()}`,
            videoId: tracks[0]?.videoId || '',
            isPlaylist: false,
            isInfinite: true,
            infiniteConfig: { source: 'youtube', type: 'artist', value: name } as InfiniteConfig,
            infiniteHistory: tracks,
            infiniteIndex: 0,
            title: name,
            author: 'mixtape',
            tapeStyle: Math.floor(Math.random() * TAPE_STYLES.length),
            textureVariant: randomTextureVariant(),
            progress: 0,
            timestamp: Date.now(),
            x: CANVAS_W / 2 + Math.round((Math.random() - 0.5) * 280),
            y: CANVAS_H / 2 + Math.round((Math.random() - 0.5) * 200),
            angle: Math.round((Math.random() * 40 - 20) * 10) / 10,
          };
          const next = [tape, ...prev];
          if (next.length > 50) next.pop();
          setZOrder(o => [tape.id, ...o]);
          setNewTapeIds(s => new Set(s).add(tape.id));
          setTimeout(() => setNewTapeIds(s => { const n = new Set(s); n.delete(tape.id); return n; }), 2000);
          return next;
        });
      },
      addTapeFromSearch: (videoId: string, title: string, author: string, isPlaylist: boolean, playlistId?: string) => {
        setTapes(prev => {
          const dedupKey = isPlaylist ? playlistId! : videoId;
          if (prev.some(t => isPlaylist ? t.playlistId === dedupKey : t.videoId === dedupKey)) {
            const updated = prev.map(t => {
              if ((isPlaylist ? t.playlistId === dedupKey : t.videoId === dedupKey)) {
                return { ...t, timestamp: Date.now() };
              }
              return t;
            });
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
            x: CANVAS_W / 2 + Math.round((Math.random() - 0.5) * 280),
            y: CANVAS_H / 2 + Math.round((Math.random() - 0.5) * 200),
            angle: Math.round((Math.random() * 40 - 20) * 10) / 10,
          };
          const next = [tape, ...prev];
          if (next.length > 50) next.pop();
          setZOrder(o => [tape.id, ...o]);
          setNewTapeIds(s => new Set(s).add(tape.id));
          setTimeout(() => setNewTapeIds(s => { const n = new Set(s); n.delete(tape.id); return n; }), 2000);
          return next;
        });
      },
    };
    return () => { delete window.TapesBridge; };
  }, []);

  // ── Parse ?t=<id> or ?tape=<encoded> on mount; init() awaits the promise. ──
  const sharedTapePromiseRef = useRef<Promise<Tape | null>>(Promise.resolve(null));
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('t');
    const enc = params.get('tape');
    if (!id && !enc) return;
    params.delete('t'); params.delete('tape');
    const newSearch = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (newSearch ? '?' + newSearch : '') + window.location.hash);
    const root = document.getElementById('tapes-root') as HTMLElement | null;
    if (root && root.style.display === 'none' && typeof (window as any).toggleTableView === 'function') {
      (window as any).toggleTableView();
    }
    sharedTapePromiseRef.current = (async () => {
      let p: SharePayload | null = null;
      if (id) p = await fetchShareById(id);
      if (!p && enc) p = decodeTapeShare(enc);
      if (!p) return null;
      return {
        id: crypto.randomUUID?.() ?? `${Date.now()}`,
        videoId: p.videoId,
        playlistId: p.playlistId,
        isPlaylist: !!p.isPlaylist,
        isInfinite: p.isInfinite,
        infiniteConfig: p.infiniteConfig,
        infiniteHistory: p.infiniteHistory,
        infiniteIndex: p.infiniteIndex,
        title: p.title,
        author: p.author,
        tapeStyle: typeof p.tapeStyle === 'number' ? p.tapeStyle : Math.floor(Math.random() * TAPE_STYLES.length),
        textureVariant: p.textureVariant ?? randomTextureVariant(),
        progress: 0,
        timestamp: Date.now(),
        x: CANVAS_W / 2 + Math.round((Math.random() - 0.5) * 280),
        y: CANVAS_H / 2 + Math.round((Math.random() - 0.5) * 200),
        angle: Math.round((Math.random() * 40 - 20) * 10) / 10,
      } as Tape;
    })();
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
    const mixtapeRealId = crypto.randomUUID?.() ?? `${Date.now()}`;
    const mixtapeTape: Tape = {
      id: mixtapeRealId,
      videoId: tracks[0]?.videoId || '',
      isPlaylist: false,
      isInfinite: true,
      infiniteConfig: { source: 'youtube', type: 'artist', value: mixtape.name } as InfiniteConfig,
      infiniteHistory: tracks,
      infiniteIndex: 0,
      title: mixtape.name,
      author: 'mixtape',
      tapeStyle: Math.floor(Math.random() * TAPE_STYLES.length),
      textureVariant: randomTextureVariant(),
      progress: 0,
      timestamp: Date.now(),
      x: 30,
      y: HEADER_BLOCK_H + 20,
      angle: 0,
    };

    setTapes([mixtapeTape]);
    setZOrder([mixtapeRealId]);
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
    if (!(loadedTape?.isInfinite && loadedTape?.author === 'mixtape')) {
      const padinfo = document.getElementById('padinfo');
      if (padinfo) padinfo.style.display = '';
    }
  }, [loadedTape, mixtape]);


  // ── Listen for "create mixtape" event from vanilla JS ──
  const [mixtapeKeywords, setMixtapeKeywords] = useState('');

  const [mixtapeGenerating, setMixtapeGenerating] = useState(false);

  useEffect(() => {
    function handleCreateMixtape(e: Event) {
      const keywords = (e as CustomEvent).detail?.keywords || '';
      if (!keywords) return;

      setMixtapeKeywords(keywords);
      setShowMixtapeCreator(true);
      setMixtapeGenerating(true);

      setMenuId(null);
      setView('player');
      window.dispatchEvent(new CustomEvent('jeem-centre-camera', { detail: { tx: 0, tz: 0, animate: true } }));
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

    // Hide vanilla padinfo if mixtape is active
    if (loadedRef.current?.isInfinite && loadedRef.current?.author === 'mixtape') {
      const padinfo = document.getElementById('padinfo');
      if (padinfo) padinfo.style.display = 'none';
    }

    // Re-show UI on track change (fade back in if hidden by inactivity)
    if ((window as any).Inactivity) (window as any).Inactivity.reset();
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

    // Set mixtapeData early (before early returns) so the tracklist overlay
    // renders even if window.myApp isn't ready yet.
    if (tape.author === 'mixtape' && tape.infiniteHistory) {
      const history = tape.infiniteHistory;
      setMixtapeData(prev => {
        const matches =
          prev &&
          prev.tracks.length === history.length &&
          prev.tracks[0]?.videoId === history[0]?.videoId;
        if (matches) return prev; // preserve durationText from creator
        return {
          name: tape.title,
          description: '',
          tracks: history.map(t => ({
            videoId: t.videoId,
            title: t.title,
            author: t.author,
            duration: 0,
            durationText: '',
          })),
        };
      });
    }

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
      // Fetch playlist tracks for tracklist overlay
      setPlaylistTracks(null);
      fetch(`/api/playlist-tracks?list=${encodeURIComponent(tape.playlistId)}`)
        .then(r => r.ok ? r.json() : [])
        .then((tracks: MixtapeTrack[]) => {
          if (tracks.length > 0) {
            setPlaylistTracks({
              name: tape.title || 'Playlist',
              description: '',
              tracks,
            });
          }
        })
        .catch(() => {});
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
    setTapes(prev => prev.filter(t => t.id !== id));
    setZOrder(prev => prev.filter(i => i !== id));
    setLoadedTape(cur => { if (cur?.id === id) return null; return cur; });
    setMenuId(null);
  }, []);

  const rewindTape = useCallback((id: string) => {
    setTapes(prev => prev.map(t => t.id === id ? { ...t, progress: 0 } : t));
    setRewindingId(id);
    setTimeout(() => setRewindingId(null), 400);
    setMenuId(null);
  }, []);

  // Auto-eject: rewind tape to 0, clear player, return tape to table
  const autoEject = useCallback(() => {
    const tape = loadedRef.current;
    if (!tape) return;

    // Rewind progress to 0
    setTapes(prev => prev.map(t => t.id === tape.id ? { ...t, progress: 0 } : t));
    setRewindingId(tape.id);
    setTimeout(() => setRewindingId(null), 400);

    setLoadedTape(null);
    setIsPlaying(false);
    setPlaylistTracks(null);

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

  }, []);
  autoEjectRef.current = autoEject;


  const cancelMenu = useCallback(() => { setMenuId(null); }, []);

  const [dragging3D, setDragging3D] = useState(false);

  // --- 3D table callbacks ---
  // Track whether the current drag ended in a recorder load — we skip
  // exitPlayerView so the loaded UI stays up after release.
  const recorderLoadedDuringDragRef = useRef(false);
  const handle3DDragStart = useCallback((tapeId: string) => {
    cancelMenu();
    setDragging3D(true);
    recorderLoadedDuringDragRef.current = false;
    if (tapeId === MIXTAPE_ID && showMixtapeCreator) return;
    // Don't swap the player-view UI to a newly picked tape while another
    // tape is loaded/playing — the playing tape's tracklist stays put.
    if (loadedRef.current && loadedRef.current.id !== tapeId) return;
    enterPlayerView(tapeId);
  }, [cancelMenu, enterPlayerView, showMixtapeCreator]);

  const handle3DDragEnd = useCallback((tapeId: string, x2d: number, y2d: number, droppedOnDeck: boolean) => {
    setDragging3D(false);
    // Block interaction with mixtape tape while creator is open
    if (tapeId === MIXTAPE_ID && showMixtapeCreator) return;
    if (droppedOnDeck) {
      const t = tapesRef.current.find(t => t.id === tapeId);
      if (t) loadIntoPlayer(t);
      return;
    }
    setTapes(prev => prev.map(t => t.id === tapeId ? { ...t, x: x2d, y: y2d } : t));
    if (!recorderLoadedDuringDragRef.current && (!loadedRef.current || loadedRef.current.id === tapeId)) {
      // Drag-end camera handling lives in TapesTable3D (zoom-only restore).
      // Skip the centre-camera reset here so xz stays where it is.
      exitPlayerView({ skipCameraReset: true });
    }
  }, [loadIntoPlayer, showMixtapeCreator, exitPlayerView]);

  // Recorder snap/eject → playback. Tape stays visible in 3D scene (recorderSourced=true
  // tells the 3D component not to filter the loaded tape out for the deck).
  const handleRecorderLoad = useCallback((tapeId: string) => {
    const t = tapesRef.current.find(t => t.id === tapeId);
    if (!t) return;
    recorderLoadedDuringDragRef.current = true;

    // Respawn any previously-loaded tape: drop it back onto the centre of the
    // table from SPAWN_HEIGHT (with a bit of variance) instead of having it
    // fall in place from the recorder pose.
    const prev = loadedRef.current;
    if (prev && prev.id !== tapeId) {
      const px = CANVAS_W / 2 + Math.round((Math.random() - 0.5) * 280);
      const py = CANVAS_H / 2 + Math.round((Math.random() - 0.5) * 200);
      const pa = Math.round((Math.random() * 40 - 20) * 10) / 10;
      setTapes(prevList => prevList.map(tt =>
        tt.id === prev.id ? { ...tt, x: px, y: py, angle: pa } : tt,
      ));
      setNewTapeIds(s => { const n = new Set(s); n.add(prev.id); return n; });
      setTimeout(() => setNewTapeIds(s => { const n = new Set(s); n.delete(prev.id); return n; }), 2000);
      setRespawnVersions(m => {
        const n = new Map(m);
        n.set(prev.id, (n.get(prev.id) ?? 0) + 1);
        return n;
      });
    }

    setRecorderSourced(true);
    // Lock this tape from being yanked back out until YouTube actually starts
    // playing. Safety timeout clears the lock if PLAYING never fires (e.g. a
    // broken video) so the user isn't permanently stuck.
    setRecorderLoadingId(tapeId);
    if (recorderLoadingTimerRef.current) clearTimeout(recorderLoadingTimerRef.current);
    recorderLoadingTimerRef.current = setTimeout(() => setRecorderLoadingId(null), 8000);
    loadIntoPlayer(t);
  }, [loadIntoPlayer]);

  const handleRecorderEject = useCallback(() => {
    setRecorderSourced(false);
    if (recorderLoadingTimerRef.current) {
      clearTimeout(recorderLoadingTimerRef.current);
      recorderLoadingTimerRef.current = null;
    }
    setRecorderLoadingId(null);
    autoEjectRef.current();
  }, []);

  const handle3DDoubleTap = useCallback((tapeId: string) => {
    // Double-tap on table view → enter inspect view (closer zoom, single tape).
    // Double-tap while inspecting → exit back to table view.
    if (viewRef.current === 'player' || showMixtapeCreator) return;
    setInspectTapeId(prev => {
      if (prev) {
        window.dispatchEvent(new CustomEvent('jeem-centre-camera', { detail: { tx: 0, tz: 0, animate: true, camY: 40 } }));
        return null;
      }
      const tape = tapesRef.current.find(t => t.id === tapeId);
      if (!tape || tape.x == null || tape.y == null) return null;
      const [tx, tz] = to3D(tape.x, tape.y);
      // tx/tz form lands target at (tx+8, 0, tz); pass tx-4 so tape sits 4
      // units left of centre, leaving some room on the right for the tracklist.
      window.dispatchEvent(new CustomEvent('jeem-centre-camera', { detail: { tx: tx - 4, tz, animate: true, camY: 20 } }));
      return tapeId;
    });
  }, [showMixtapeCreator]);

  const handle3DMenuAction = useCallback((_tapeId: string, _action: 'link' | 'rewind' | 'remove') => {
    // Context menu disabled — functionality will be rebuilt later
  }, []);

  const [newTapeIds, setNewTapeIds] = useState(() => new Set<string>());
  // Bump per-tape to force a TapeBody remount — used to respawn a tape from
  // SPAWN_HEIGHT (e.g. when it's ejected from the recorder by a replacement).
  const [respawnVersions, setRespawnVersions] = useState(() => new Map<string, number>());

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
      if (overPlayer && viewRef.current === 'player') {
        const t = tapesRef.current.find(t => t.id === tape.id);
        if (t) loadIntoPlayer(t);
      } else {
        const { cx, cy } = posFromEvent(ev);
        setTapes(prev => prev.map(t => t.id === tape.id ? { ...t, x: cx, y: Math.max(cy, HEADER_BLOCK_H) } : t));
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
          setTapes(prev => prev.map(t => t.id === tape.id ? { ...t, progress } : t));
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
      }

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
        x: cx + Math.round((Math.random() - 0.5) * 280),
        y: cy + Math.round((Math.random() - 0.5) * 200),
      };
    }
    const col = i % 3;
    const row = Math.floor(i / 3);
    return {
      ...tape,
      x: cx + Math.round((Math.random() - 0.5) * 280),
      y: cy + Math.round((Math.random() - 0.5) * 200),
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
        .tape-ui-btn { border: 1px solid rgba(250,249,246,0.7) !important; transition: background 0.15s; }
        .tape-ui-btn:hover { background: rgba(250,249,246,0.12) !important; }
        @keyframes view-flare {
          0%   { filter: brightness(1) contrast(1) saturate(1); transform: translate(0) scale(1); }
          15%  { filter: brightness(2) contrast(1.6) saturate(2); transform: translate(-3px, 1px) scale(1.01); }
          30%  { filter: brightness(4) contrast(0.4) saturate(0) hue-rotate(20deg); transform: translate(4px, -2px) scale(1.02); }
          45%  { filter: brightness(5) contrast(0.2); transform: translate(-2px, 2px) scale(1.01); }
          55%  { filter: brightness(5) contrast(0.2); transform: translate(2px, -1px) scale(1.02); }
          70%  { filter: brightness(3) contrast(1.5) saturate(1.5) hue-rotate(-10deg); transform: translate(-1px, 1px) scale(1.01); }
          85%  { filter: brightness(1.5) contrast(1.3); transform: translate(1px, 0) scale(1); }
          100% { filter: brightness(1) contrast(1) saturate(1); transform: translate(0) scale(1); }
        }
        body.view-flaring { animation: view-flare 0.6s ease-in-out; overflow: hidden; }
      `}</style>

      {/* 3D table with FBX tapes, physics, drag, camera pan */}
      <Suspense fallback={<div style={{ flex: 1, background: '#0a0805' }} />}>
        <TapesTable3D
          tapes={positionedTapes.filter(t => t.id !== excludeTapeId)}
          loadedTapeId={recorderSourced ? null : (loadedTape?.id ?? null)}
          onDragStart={handle3DDragStart}
          onDragEnd={handle3DDragEnd}
          onDoubleTap={handle3DDoubleTap}
          onMenuAction={handle3DMenuAction}
          menuId={menuId}
          onClearMenu={cancelMenu}
          newTapeIds={newTapeIds}
          respawnVersions={respawnVersions}
          externalDrag={externalDrag.current}
          lockedTapeId={showMixtapeCreator ? MIXTAPE_ID : null}
          pickupBlockedTapeId={recorderLoadingId}
          lockCamera={showMixtapeCreator}
          lockPan={view === 'player'}
          freePan={view === 'player' || dragging3D}
          onRecorderLoad={handleRecorderLoad}
          onRecorderEject={handleRecorderEject}
          showRecorder={!inspectTapeId}
          onSceneReady={() => setSceneReady(true)}
          inspectTapeId={inspectTapeId}
        />
      </Suspense>

      {!sceneReady && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99997,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0a0805', pointerEvents: 'auto',
        }}>
          <div style={{
            width: 48, height: 48,
            border: '3px solid rgba(250,249,246,0.15)',
            borderTopColor: 'rgba(250,249,246,0.85)',
            borderRadius: '50%',
            animation: 'tape-loading-spin 0.9s linear infinite',
          }} />
        </div>
      )}

      {inspectTapeId && (() => {
        const tape = tapes.find(t => t.id === inspectTapeId);
        if (!tape) return null;
        const colStyle: React.CSSProperties = {
          position: 'fixed', left: '32%', transform: 'translateX(-50%)',
          zIndex: 99996, pointerEvents: 'auto',
          display: 'flex', justifyContent: 'center',
        };
        return (
          <>
            <div style={{ ...colStyle, top: '18vh' }}>
              <textarea
                rows={1}
                value={tape.title}
                onChange={(e) => {
                  const newTitle = e.target.value;
                  setTapes(prev => prev.map(t => t.id === inspectTapeId ? { ...t, title: newTitle } : t));
                  const ta = e.target as HTMLTextAreaElement;
                  ta.style.height = 'auto';
                  ta.style.height = ta.scrollHeight + 'px';
                }}
                ref={(el) => {
                  if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
                }}
                style={{
                  background: 'transparent', border: 'none', outline: 'none',
                  borderBottom: '1px dashed rgba(250,249,246,0.3)',
                  color: 'rgba(250,249,246,0.95)', fontFamily: '"04b03", monospace',
                  fontSize: 26, lineHeight: 1.25, textAlign: 'center',
                  minWidth: 560, maxWidth: '80vw',
                  textShadow: '0 1px 2px rgba(0,0,0,0.8)', padding: '4px 8px',
                  resize: 'none', overflow: 'hidden',
                }}
              />
            </div>
            <div style={{ ...colStyle, bottom: '18vh', gap: 12 }}>
              <button
                className="tape-ui-btn"
                onClick={() => rewindTape(inspectTapeId)}
                style={{
                  background: 'rgba(0,0,0,0.5)', color: 'rgba(250,249,246,0.95)',
                  fontFamily: '"04b03", monospace', fontSize: 14,
                  padding: '8px 16px', cursor: 'pointer',
                }}
              >rewind</button>
              <ShareButton tape={tape} />

              <button
                className="tape-ui-btn"
                onClick={() => {
                  deleteTape(inspectTapeId);
                  setInspectTapeId(null);
                  window.dispatchEvent(new CustomEvent('jeem-centre-camera', { detail: { tx: 0, tz: 0, animate: true, camY: 40 } }));
                }}
                style={{
                  background: 'rgba(0,0,0,0.5)', color: 'rgba(250,249,246,0.95)',
                  fontFamily: '"04b03", monospace', fontSize: 14,
                  padding: '8px 16px', cursor: 'pointer',
                }}
              >remove</button>
            </div>
          </>
        );
      })()}

{/* Unified tape info + tracklist panel — single layout for idle and playback */}
      {(playerTapeId || inspectTapeId) && !showMixtapeCreator && (() => {
        const focusId = playerTapeId || inspectTapeId;
        // Prefer loaded tape (source of truth during playback), else the focused player/inspect tape
        const tape = loadedTape ?? tapes.find(t => t.id === focusId);
        if (!tape) return null;

        const interactive = isPlaying && !!loadedTape && loadedTape.id === tape.id;
        const hasInfiniteTracklist = tape.isInfinite && tape.infiniteHistory && tape.infiniteHistory.length > 0;
        const hasPlaylistTracklist = tape.isPlaylist && playlistTracks && playlistTracks.tracks.length > 0;

        // Build uniform items (title, author, durationText, videoId, index)
        type Item = { title: string; author: string; durationText: string; videoId: string };
        const tracklistItems: Item[] = hasInfiniteTracklist
          ? tape.infiniteHistory!.map((t, i) => ({
              title: t.title,
              author: t.author,
              durationText: (tape.author === 'mixtape' && mixtapeData?.tracks[i]?.durationText) || '',
              videoId: t.videoId,
            }))
          : hasPlaylistTracklist
            ? playlistTracks!.tracks.map(t => ({
                title: t.title,
                author: t.author,
                durationText: t.durationText || '',
                videoId: t.videoId,
              }))
            : [];
        const hasTracklist = tracklistItems.length > 0;
        // Single-track tapes: hide the whole panel during playback (no info to show once playing).
        if (interactive && !hasTracklist) return null;
        const currentIndex = hasInfiniteTracklist
          ? (tape.infiniteIndex ?? 0)
          : hasPlaylistTracklist
            ? (tape.playlistIndex ?? 0)
            : -1;

        const handleSelect = (i: number, item: Item) => {
          if (!interactive) return;
          if (hasInfiniteTracklist) {
            const tapeId = tape.id;
            setLoadedTape(prev => prev && prev.id === tapeId ? { ...prev, infiniteIndex: i, videoId: item.videoId, progress: 0 } : prev);
            setTapes(prev => prev.map(t => t.id === tapeId ? { ...t, infiniteIndex: i, videoId: item.videoId, progress: 0 } : t));
            playVideoById(item.videoId, item.title, item.author);
          } else if (hasPlaylistTracklist) {
            if (!window.myApp?.player) return;
            window.myApp.player.goto_at(i);
            const tapeId = tape.id;
            setLoadedTape(prev => prev ? { ...prev, playlistIndex: i, progress: 0 } : prev);
            setTapes(prev => prev.map(t => t.id === tapeId ? { ...t, playlistIndex: i, progress: 0 } : t));
          }
        };

        // Portal to document.body so the panel survives `#tapes-root`
        // being display:none'd by player.js during non-tapes bg modes.
        // The old #mixtape-tracklist / #playlist-tracklist overlays mounted
        // directly on <body> for the same reason.
        return createPortal(
          <div className="tape-info-panel" style={{
            position: 'fixed', top: '50%', left: 'calc(50% - 70px)', transform: 'translateY(-50%)',
            width: '50vw', maxHeight: '70vh',
            fontFamily: "'04b03', monospace", fontSize: '1em', color: 'rgba(250,249,246,0.9)',
            background: 'transparent',
            // Drag events need to pass through to the 3D canvas below; inactivity
            // fade toggles opacity via `public/src/player.js` (Inactivity module).
            pointerEvents: dragging3D ? 'none' : 'auto', zIndex: 200,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            border: 'none', borderRadius: 0,
            padding: '24px 24px 20px',
            transition: 'opacity 1s ease',
          }}>
            {!inspectTapeId && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                marginBottom: hasTracklist ? '12px' : '0',
                flexShrink: 0,
              }}>
                <div style={{
                  fontFamily: "'04b03', monospace", fontSize: '1.3em',
                  color: 'rgba(250,249,246,0.7)', letterSpacing: '1.5px',
                  whiteSpace: 'nowrap', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                  pointerEvents: interactive ? 'auto' : 'none',
                  userSelect: interactive ? 'auto' : 'none',
                }}>
                  {tape.title || 'Untitled'}
                </div>
              </div>
            )}
            {!hasTracklist && tape.author && (
              <div style={{
                color: 'rgba(250,249,246,0.5)', marginTop: '6px', fontSize: '1em',
                pointerEvents: interactive ? 'auto' : 'none',
                userSelect: interactive ? 'auto' : 'none',
              }}>
                {tape.author}
              </div>
            )}
            {hasTracklist && (
              <div style={{
                flex: 1, overflowY: 'auto',
                scrollbarWidth: 'thin', scrollbarColor: 'rgba(250,249,246,0.2) transparent',
                padding: '10px 14px',
              }}>
                {tracklistItems.map((track, i) => {
                  const isCurrent = i === currentIndex;
                  return (
                    <div
                      key={i}
                      onClick={interactive ? () => handleSelect(i, track) : undefined}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        fontFamily: "'04b03', monospace", fontSize: '1em',
                        color: isCurrent && interactive ? 'rgba(250,249,246,0.95)' : 'rgba(250,249,246,0.7)',
                        background: isCurrent && interactive ? 'rgba(250,249,246,0.08)' : 'transparent',
                        padding: '6px 4px',
                        borderBottom: '1px solid rgba(250,249,246,0.04)',
                        cursor: interactive ? 'pointer' : 'default',
                        transition: 'color 0.15s, background 0.15s',
                        pointerEvents: interactive ? 'auto' : 'none',
                        userSelect: interactive ? 'auto' : 'none',
                      }}
                      title={interactive ? `${track.title} — ${track.author}` : undefined}
                    >
                      <span style={{ color: 'rgba(250,249,246,0.5)', width: '30px', flexShrink: 0, textAlign: 'right' }}>
                        {String(i + 1).padStart(2, '0')}.
                      </span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, color: isCurrent && interactive ? 'rgba(250,249,246,0.95)' : 'rgba(250,249,246,0.9)' }}>
                        {track.title}
                      </span>
                      <span style={{ color: 'rgba(250,249,246,0.5)', flexShrink: 0, width: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {track.author}
                      </span>
                      {track.durationText && (
                        <span style={{ color: 'rgba(250,249,246,0.5)', flexShrink: 0, width: '50px', textAlign: 'right' }}>
                          {track.durationText}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>,
          document.body
        );
      })()}


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



      {/* Mixtape creator overlay — shown inline when user clicks "+ mixtape" */}
      {showMixtapeCreator && (
        <MixtapeCreator
          initialKeywords={mixtapeKeywords}
          onGenerated={() => {
            // Spawn blank mixtape tape and drop it
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
              tapeStyle: Math.floor(Math.random() * TAPE_STYLES.length),
              textureVariant: randomTextureVariant(),
              progress: 0,
              timestamp: Date.now(),
              x: CANVAS_W * 0.35,
              y: CANVAS_H / 2,
              angle: 0,
            };
            setTapes(prev => [...prev.filter(t => t.id !== MIXTAPE_ID), blankTape]);
            setZOrder(prev => [...prev.filter(id => id !== MIXTAPE_ID), MIXTAPE_ID]);
            setPlayerTapeId(MIXTAPE_ID);
            setNewTapeIds(s => new Set(s).add(MIXTAPE_ID));
            setTimeout(() => setNewTapeIds(s => { const n = new Set(s); n.delete(MIXTAPE_ID); return n; }), 2000);
            setMixtapeGenerating(false);
          }}
          onBack={() => {
            // Remove the blank mixtape tape and close creator
            setTapes(prev => prev.filter(t => t.id !== MIXTAPE_ID));
            setZOrder(prev => prev.filter(id => id !== MIXTAPE_ID));
            setShowMixtapeCreator(false);
            setMixtapeKeywords('');
            setMixtapeGenerating(false);
            exitPlayerView();
          }}
          onPlay={(tape) => {
            // Populate the spawned mixtape tape with generated tracks
            const tracks: InfiniteTrack[] = tape.tracks.map(t => ({
              videoId: t.videoId,
              title: t.title,
              author: t.author,
            }));
            const realId = crypto.randomUUID?.() ?? `${Date.now()}`;
            const mixtapeTape: Tape = {
              id: realId,
              videoId: tracks[0]?.videoId || '',
              isPlaylist: false,
              isInfinite: true,
              infiniteConfig: { source: 'youtube', type: 'artist', value: tape.name } as InfiniteConfig,
              infiniteHistory: tracks,
              infiniteIndex: 0,
              title: tape.name || 'Mixtape',
              author: 'mixtape',
              tapeStyle: Math.floor(Math.random() * TAPE_STYLES.length),
              textureVariant: randomTextureVariant(),
              progress: 0,
              timestamp: Date.now(),
              x: CANVAS_W / 2,
              y: CANVAS_H / 2,
              angle: 0,
              };
            setTapes(prev => prev.map(t => t.id === MIXTAPE_ID ? mixtapeTape : t));
            setPlayerTapeId(realId);
            setMixtapeData({ name: tape.name || 'Mixtape', description: tape.description || '', tracks: tape.tracks });
            mixtapeLoadedRef.current = true;
            setShowMixtapeCreator(false);
            setMixtapeKeywords('');
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
  elementId = 'mixtape-tracklist',
}: {
  mixtape: MixtapeData;
  currentIndex: number;
  onSelectTrack: (index: number, track: MixtapeTrack) => void;
  elementId?: string;
}) {
  const elRef = React.useRef<HTMLElement | null>(null);

  // Create element once on mount, remove on unmount
  useEffect(() => {
    let el = document.getElementById(elementId);
    if (!el) { el = document.createElement('div'); el.id = elementId; document.body.appendChild(el); }
    elRef.current = el;
    return () => { el?.remove(); elRef.current = null; };
  }, [elementId]);

  // Update content when track changes — preserve opacity
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const prevOpacity = el.style.opacity;
    mountMixtapeOverlay(el, mixtape, currentIndex, onSelectTrack);
    if (prevOpacity) el.style.opacity = prevOpacity;
  }, [mixtape, currentIndex, onSelectTrack]);

  return null;
}
