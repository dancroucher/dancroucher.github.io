import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Tape, TAPE_STYLES, STORAGE_KEY } from './types';
import { CassetteTape } from './CassetteTape';

// ── Persistence (KV primary, localStorage fallback) ──

function loadTapesLocal(): Tape[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveTapesLocal(tapes: Tape[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tapes)); } catch {}
}

async function loadTapesFromKV(): Promise<Tape[] | null> {
  try {
    const res = await fetch('/api/tapes');
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.tapes) ? data.tapes : null;
  } catch { return null; }
}

let _kvSaveTimer: ReturnType<typeof setTimeout> | null = null;
function saveTapesToKV(tapes: Tape[]) {
  // Debounce KV writes to avoid excessive API calls
  if (_kvSaveTimer) clearTimeout(_kvSaveTimer);
  _kvSaveTimer = setTimeout(async () => {
    try {
      await fetch('/api/tapes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tapes }),
      });
    } catch {}
  }, 2000);
}

function saveTapesToStorage(tapes: Tape[]) {
  saveTapesLocal(tapes);
  saveTapesToKV(tapes);
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
      addTapeFromSearch: (videoId: string, title: string, author: string, isPlaylist: boolean, playlistId?: string) => void;
      notifyPlayState: (playing: boolean) => void;
      onTrackEnded: () => void;
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

export function TapesTable() {
  const [tapes, setTapes] = useState<Tape[]>([]);
  const [mounted, setMounted] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dragScreenPos, setDragScreenPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [zOrder, setZOrder] = useState<string[]>([]);
  const [rewindingId, setRewindingId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [loadedTape, setLoadedTape] = useState<Tape | null>(null);
  const [deckEjecting, setDeckEjecting] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mineOnly, setMineOnly] = useState(() => localStorage.getItem('jeem_mine_only') === '1');
  const [keepTidy, setKeepTidy] = useState(() => localStorage.getItem('jeem_keep_tidy') === '1');
  const ownerId = useRef(getOwnerId()).current;
  const tableRef = useRef<HTMLDivElement>(null);
  const playerZoneRef = useRef<HTMLDivElement>(null);
  const deckPortal = typeof document !== 'undefined' ? document.getElementById('tape-deck') : null;
  const tapesRef = useRef(tapes);
  tapesRef.current = tapes;
  const loadedRef = useRef(loadedTape);
  loadedRef.current = loadedTape;
  const autoEjectRef = useRef<() => void>(() => {});

  // Double-tap detection
  const lastTapRef = useRef<{ time: number; id: string }>({ time: 0, id: '' });
  const isDoubleTap = useCallback((id: string) => {
    const now = Date.now();
    const last = lastTapRef.current;
    const isDbl = last.id === id && now - last.time < 400;
    lastTapRef.current = { time: now, id };
    return isDbl;
  }, []);

  // Load tapes: KV first, localStorage fallback, old history migration last
  useEffect(() => {
    (async () => {
      // Try KV first
      let loaded = await loadTapesFromKV();

      // Fall back to localStorage
      if (!loaded || loaded.length === 0) {
        loaded = loadTapesLocal();
      }

      // Migrate from old history format
      if (!loaded || loaded.length === 0) {
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

      // Sync KV data to localStorage
      saveTapesLocal(loaded);

      setTapes(loaded);
      setZOrder(loaded.map(t => t.id));
      setMounted(true);
    })();
  }, []);

  useEffect(() => {
    if (mounted) saveTapesToStorage(tapes);
  }, [tapes, mounted]);

  // Bridge for vanilla JS
  useEffect(() => {
    window.TapesBridge = {
      onTapePlay: () => {},
      updateProgress: (videoId: string, progress: number) => {
        setTapes(prev => prev.map(t =>
          (t.videoId === videoId || t.playlistId === videoId)
            ? { ...t, progress }
            : t
        ));
        // Also update loaded tape if it matches
        setLoadedTape(prev => {
          if (!prev) return prev;
          if (prev.videoId === videoId || prev.playlistId === videoId) {
            return { ...prev, progress };
          }
          return prev;
        });
      },
      notifyPlayState: (playing: boolean) => {
        setIsPlaying(playing);
      },
      onTrackEnded: () => {
        autoEjectRef.current();
      },
      addTapeFromSearch: (videoId: string, title: string, author: string, isPlaylist: boolean, playlistId?: string) => {
        setTapes(prev => {
          const dedupKey = isPlaylist ? playlistId! : videoId;
          if (prev.some(t => isPlaylist ? t.playlistId === dedupKey : t.videoId === dedupKey)) {
            return prev.map(t => {
              if ((isPlaylist ? t.playlistId === dedupKey : t.videoId === dedupKey)) {
                return { ...t, timestamp: Date.now() };
              }
              return t;
            });
          }

          const tbl = document.getElementById('tapes-table-canvas');
          const sl = tbl?.parentElement?.scrollLeft ?? 0;
          const st = tbl?.parentElement?.scrollTop ?? 0;
          const col = prev.length % 4;
          const row2 = Math.floor(prev.length / 4);

          const tape: Tape = {
            id: crypto.randomUUID?.() ?? `${Date.now()}`,
            videoId,
            playlistId: playlistId || undefined,
            isPlaylist,
            title,
            author,
            tapeStyle: Math.floor(Math.random() * TAPE_STYLES.length),
            progress: 0,
            timestamp: Date.now(),
            x: sl + 30 + col * 260 + Math.round((Math.random() - 0.5) * 40),
            y: Math.max(st + HEADER_BLOCK_H + row2 * 170 + Math.round((Math.random() - 0.5) * 30), HEADER_BLOCK_H),
            angle: Math.round((Math.random() * 40 - 20) * 10) / 10,
            ownerId: getOwnerId(),
          };
          const next = [tape, ...prev];
          if (next.length > 50) next.pop();
          setZOrder(o => [tape.id, ...o]);
          return next;
        });
      },
    };
    return () => { delete window.TapesBridge; };
  }, []);

  // ── Play tape via vanilla JS bridge ──
  const loadIntoPlayer = useCallback((tape: Tape) => {
    setLoadedTape(tape);
    if (!window.myApp) return;
    const AppState = window.AppState;
    if (!AppState) return;

    AppState.starting = true;

    // Show jeem-fm title when playing
    const titleEl = document.getElementById('title-container');
    if (titleEl) titleEl.style.display = 'block';

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
  }, []);

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
      }
      setTimeout(() => {
        const pauseEl = document.getElementById('pause-overlay');
        if (pauseEl) pauseEl.classList.remove('visible');
      }, 50);
    }

    if (window.switchBgType) window.switchBgType(5);
  }, []);
  autoEjectRef.current = autoEject;

  const cancelMenu = useCallback(() => { setMenuId(null); }, []);

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
        }
        // Suppress pause overlay (state_change fires async after pause)
        setTimeout(() => {
          const pauseEl = document.getElementById('pause-overlay');
          if (pauseEl) pauseEl.classList.remove('visible');
        }, 50);
      }

      // Switch to tapes bg so user can see where the tape lands
      if (window.switchBgType) window.switchBgType(5);

      const tbl = tableRef.current!;
      const sx = fromEv.clientX - gx;
      const sy = fromEv.clientY - gy;
      const r = tbl.getBoundingClientRect();
      setDragId(tape.id);
      setDragPos({ x: sx - r.left + tbl.scrollLeft, y: sy - r.top + tbl.scrollTop });
      setDragScreenPos({ x: sx, y: sy });
      setZOrder(prev => [...prev.filter(id => id !== tape.id), tape.id]);
    }

    function posFromEvent(ev: PointerEvent) {
      const sx = ev.clientX - gx;
      const sy = ev.clientY - gy;
      const r = tableRef.current!.getBoundingClientRect();
      return { sx, sy, cx: sx - r.left + tableRef.current!.scrollLeft, cy: sy - r.top + tableRef.current!.scrollTop };
    }

    function onMove(ev: PointerEvent) {
      if (!ejected && holdReady && (Math.abs(ev.clientX - startX) > 5 || Math.abs(ev.clientY - startY) > 5)) {
        eject(ev);
      }
      if (!ejected) return;
      const { sx, sy, cx, cy } = posFromEvent(ev);
      setDragPos({ x: cx, y: cy });
      setDragScreenPos({ x: sx, y: sy });
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
      const tapeId = tape.id;
      const { cx, cy } = posFromEvent(ev);
      setTapes(prev => prev.map(t => t.id === tapeId ? { ...t, x: cx, y: Math.max(cy, HEADER_BLOCK_H) } : t));
      setDragId(null); setDragPos(null); setDragScreenPos(null); setDragOver(false); setDeckEjecting(false);
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

  const positionedTapes = tapes.map((tape, i) => {
    if (tape.x !== undefined && tape.y !== undefined) return tape;
    const col = i % 4;
    const row = Math.floor(i / 4);
    return {
      ...tape,
      x: 30 + col * 260 + Math.round((Math.random() - 0.5) * 40),
      y: Math.max(HEADER_BLOCK_H + row * 170 + Math.round((Math.random() - 0.5) * 30), HEADER_BLOCK_H),
      angle: Math.round((Math.random() * 40 - 20) * 10) / 10,
    };
  });

  // Tapes on table = all except what's loaded in the deck, filtered by settings
  const tableTapes = positionedTapes.filter(t => {
    if (t.id === loadedTape?.id) return false;
    if (mineOnly && t.ownerId && t.ownerId !== ownerId) return false;
    return true;
  });

  return (
    <>
      <style>{`
        @keyframes tape-spin-slow { to { transform: rotate(-360deg) } }
        @keyframes tape-spin-fast { to { transform: rotate(-360deg) } }
        @keyframes tape-rewind { 0%,100% { transform: rotate(0deg) } 20% { transform: rotate(-4deg) } 40% { transform: rotate(4deg) } 60% { transform: rotate(-3deg) } 80% { transform: rotate(2deg) } }
        .tapes-scroll::-webkit-scrollbar { display: none; }
        .tapes-scroll { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>

      <div
        ref={tableRef}
        className="tapes-scroll"
        onPointerDown={startPan}
        onClick={e => {
          if (!(e.target as HTMLElement)?.closest('[data-tape]') && !(e.target as HTMLElement)?.closest('[data-deck]')) setMenuId(null);
        }}
        style={{
          flex: 1,
          overflow: 'auto',
          position: 'relative',
          cursor: isPanning ? 'grabbing' : dragId ? 'grabbing' : 'grab',
          boxShadow: 'inset 0 3px 16px rgba(0,0,0,0.4), inset 0 0 60px rgba(0,0,0,0.2)',
        }}
      >
        {/* Wood texture canvas with black overlay */}
        <div
          id="tapes-table-canvas"
          style={{
            width: CANVAS_W,
            height: CANVAS_H,
            position: 'relative',
            backgroundImage: [
              'linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5))',
              'radial-gradient(ellipse 1200px 900px at 40% 30%, rgba(255,255,255,0.04) 0%, transparent 70%)',
              'repeating-linear-gradient(45deg, transparent 0px, transparent 1px, rgba(255,255,255,0.01) 1px, rgba(255,255,255,0.01) 2px)',
              'url(/table-wood.jpg)',
            ].join(','),
            backgroundSize: 'auto, auto, auto, 600px',
            backgroundRepeat: 'repeat',
            backgroundColor: '#1a1208',
          }}
        >
          {/* Tapes on table */}
          {tableTapes.map(tape => {
            const isDragging = dragId === tape.id;
            if (isDragging) return null;
            const zi = zOrder.indexOf(tape.id) + 1;
            const hasMenu = menuId === tape.id;

            return (
              <div
                key={tape.id}
                data-tape="true"
                title={tape.title + (tape.author ? ` - ${tape.author}` : '')}
                onPointerDown={e => startDrag(e, tape as Tape & { x: number; y: number })}
                onClick={() => {
                  if (isDoubleTap(tape.id)) {
                    setMenuId(prev => prev === tape.id ? null : tape.id);
                  }
                }}
                onContextMenu={e => e.preventDefault()}
                style={{
                  position: 'absolute',
                  left: tape.x,
                  top: tape.y,
                  transform: `rotate(${tape.angle ?? 0}deg)`,
                  transition: 'transform 0.15s',
                  animation: rewindingId === tape.id ? 'tape-rewind 0.4s ease' : 'none',
                  zIndex: hasMenu ? 9999 : zi,
                  cursor: 'grab',
                  userSelect: 'none',
                  touchAction: 'none',
                  filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.45))',
                }}
              >
                <CassetteTape tape={tape} />

                {hasMenu && (
                  <div style={{
                    position: 'absolute', bottom: -40, left: '50%', transform: 'translateX(-50%)',
                    display: 'flex', gap: 6, zIndex: 10000,
                  }}>
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => {
                        e.stopPropagation();
                        const id = tape.isPlaylist ? tape.playlistId : tape.videoId;
                        const url = `${window.location.origin}${window.location.pathname}?v=${id}&t=${tape.playlistIndex ?? 0}`;
                        navigator.clipboard.writeText(url).then(() => {
                          (e.target as HTMLButtonElement).textContent = 'Copied!';
                          setTimeout(() => { (e.target as HTMLButtonElement).textContent = 'Link'; }, 1500);
                        }).catch(() => { prompt('Copy this link:', url); });
                      }}
                      style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'Courier New', monospace" }}
                    >Link</button>
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); rewindTape(tape.id); }}
                      style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#333', color: '#fff', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'Courier New', monospace" }}
                    >Rewind</button>
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); deleteTape(tape.id); }}
                      style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'Courier New', monospace" }}
                    >Remove</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Drag overlay — portaled to body so it's above everything */}
      {dragId && dragScreenPos && (() => {
        const tape = positionedTapes.find(t => t.id === dragId);
        if (!tape) return null;
        return createPortal(
          <div style={{
            position: 'fixed',
            left: dragScreenPos.x,
            top: dragScreenPos.y,
            zIndex: 90000,
            pointerEvents: 'none',
            transform: `rotate(${tape.angle ?? 0}deg) scale(1.06)`,
            filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.4))',
          }}>
            <CassetteTape tape={tape} />
          </div>,
          document.body
        );
      })()}

      {/* Deck — portaled outside tapes-root so it's visible in all bg modes */}
      {deckPortal && createPortal(
        <div
          data-deck="true"
          ref={playerZoneRef}
        >
          <div
            className="deck-slot"
            onPointerDown={loadedTape ? startDeckDrag : undefined}
            style={{
              width: 234, height: 143, position: 'relative',
              background: loadedTape ? 'transparent' : '#141414',
              borderRadius: 5,
              border: !loadedTape && dragId ? '1px solid rgba(249,115,22,0.4)' : loadedTape ? 'none' : '1px solid #333',
              display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
              cursor: loadedTape ? 'grab' : 'default',
              boxShadow: !loadedTape && dragId
                ? 'inset 0 2px 8px rgba(0,0,0,0.3), 0 0 12px rgba(249,115,22,0.15), 0 0 4px rgba(249,115,22,0.1)'
                : loadedTape ? '0 4px 20px rgba(0,0,0,0.5)' : 'inset 0 2px 8px rgba(0,0,0,0.3), 0 4px 20px rgba(0,0,0,0.5)',
              transition: 'box-shadow 0.2s, border-color 0.2s',
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
            {[65, 169].map((cx, i) => (
              <div key={i} style={{ position: 'absolute', left: cx - 13, top: 68 - 13, width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(160deg, #2a2a2a 0%, #111 60%, #000 100%)', border: '1px solid #333', boxShadow: '0 2px 4px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.08)', zIndex: 0 }}>
                <div style={{ position: 'absolute', inset: 3, borderRadius: '50%', background: 'linear-gradient(160deg, #222 0%, #141414 50%, #0a0a0a 100%)', boxShadow: 'inset 0 -1px 2px rgba(255,255,255,0.06), inset 0 1px 2px rgba(0,0,0,0.6)', border: '0.5px solid #2a2a2a' }}>
                  <div style={{ position: 'absolute', left: '50%', top: 2, bottom: 2, width: 2, transform: 'translateX(-50%)', background: 'linear-gradient(180deg, #333 0%, #1a1a1a 100%)', borderRadius: 1, boxShadow: '0 0 1px rgba(0,0,0,0.5)' }} />
                  <div style={{ position: 'absolute', top: '50%', left: 2, right: 2, height: 2, transform: 'translateY(-50%)', background: 'linear-gradient(90deg, #333 0%, #1a1a1a 100%)', borderRadius: 1, boxShadow: '0 0 1px rgba(0,0,0,0.5)' }} />
                  <div style={{ position: 'absolute', left: '50%', top: '50%', width: 7, height: 7, transform: 'translate(-50%, -50%)', borderRadius: '50%', background: 'linear-gradient(145deg, #2a2a2a 0%, #080808 100%)', border: '0.5px solid #333', boxShadow: '0 1px 2px rgba(0,0,0,0.7), inset 0 0.5px 0.5px rgba(255,255,255,0.1)' }} />
                </div>
              </div>
            ))}

            {loadedTape ? (
              <div style={{ position: 'relative', zIndex: 1 }}>
                <CassetteTape tape={loadedTape} playing={isPlaying} />
              </div>
            ) : null}
          </div>
        </div>,
        deckPortal
      )}

      {/* Settings cog — top right, level with title */}
      {createPortal(
        <div style={{ position: 'fixed', top: 44, right: 40, zIndex: 10001 }}>
          <button
            onClick={() => setSettingsOpen(p => !p)}
            style={{
              background: 'none', border: 'none', color: 'rgba(250, 249, 246, 0.6)',
              fontSize: 18, cursor: 'pointer', padding: 6,
            }}
            title="Settings"
          >
            <i className="fas fa-cog" />
          </button>

          {settingsOpen && (
            <div style={{
              position: 'absolute', top: 36, right: 0, background: 'rgba(0, 0, 0, 0.85)',
              border: '1px solid rgba(250, 249, 246, 0.15)', padding: '12px 16px',
              minWidth: 180, fontFamily: "'04b03', monospace", fontSize: 12,
              color: 'rgba(250, 249, 246, 0.8)',
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 10 }}>
                <input
                  type="checkbox"
                  checked={mineOnly}
                  onChange={e => {
                    setMineOnly(e.target.checked);
                    localStorage.setItem('jeem_mine_only', e.target.checked ? '1' : '0');
                  }}
                  style={{ accentColor: '#888' }}
                />
                mine only
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={keepTidy}
                  onChange={e => {
                    const on = e.target.checked;
                    setKeepTidy(on);
                    localStorage.setItem('jeem_keep_tidy', on ? '1' : '0');
                    if (on) {
                      setTapes(prev => tidyTapes(prev));
                    }
                  }}
                  style={{ accentColor: '#888' }}
                />
                keep tidy
              </label>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
