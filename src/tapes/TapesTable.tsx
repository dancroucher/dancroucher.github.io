import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Tape, TAPE_STYLES, STORAGE_KEY } from './types';
import { CassetteTape } from './CassetteTape';

// ── Persistence ──

function loadTapes(): Tape[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveTapesToStorage(tapes: Tape[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tapes)); } catch {}
}

// ── Bridge to vanilla JS player ──
// window.myApp is the Demo instance, window.AppState is the shared state

declare global {
  interface Window {
    myApp?: any;
    AppState?: any;
    TapesBridge?: {
      onTapePlay: (tape: Tape) => void;
      updateProgress: (videoId: string, progress: number) => void;
      addTapeFromSearch: (videoId: string, title: string, author: string, isPlaylist: boolean, playlistId?: string) => void;
    };
  }
}

// ── Canvas dimensions ──
const CANVAS_W = 3200;
const CANVAS_H = 2400;

export function TapesTable() {
  const [tapes, setTapes] = useState<Tape[]>([]);
  const [mounted, setMounted] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dragScreenPos, setDragScreenPos] = useState<{ x: number; y: number } | null>(null);
  const [zOrder, setZOrder] = useState<string[]>([]);
  const [rewindingId, setRewindingId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const tapesRef = useRef(tapes);
  tapesRef.current = tapes;

  // Double-tap detection
  const lastTapRef = useRef<{ time: number; id: string }>({ time: 0, id: '' });
  const isDoubleTap = useCallback((id: string) => {
    const now = Date.now();
    const last = lastTapRef.current;
    const isDbl = last.id === id && now - last.time < 400;
    lastTapRef.current = { time: now, id };
    return isDbl;
  }, []);

  // Load tapes from localStorage on mount (migrate from old history if needed)
  useEffect(() => {
    let loaded = loadTapes();

    // Migrate from old userVideoHistory format
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
              progress: v.progress || 0,
              playlistIndex: v.track || 0,
              timestamp: v.timestamp || Date.now(),
              x: 30 + col * 260 + Math.round((Math.random() - 0.5) * 40),
              y: 20 + row * 170 + Math.round((Math.random() - 0.5) * 30),
              angle: Math.round((Math.random() * 40 - 20) * 10) / 10,
            } as Tape;
          });
          saveTapesToStorage(loaded);
        }
      } catch {}
    }

    setTapes(loaded);
    setZOrder(loaded.map(t => t.id));
    setMounted(true);
  }, []);

  // Save whenever tapes change (after mount)
  useEffect(() => {
    if (mounted) saveTapesToStorage(tapes);
  }, [tapes, mounted]);

  // Expose bridge for vanilla JS to add tapes + update progress
  useEffect(() => {
    window.TapesBridge = {
      onTapePlay: (tape: Tape) => {
        // Called when a tape is played — vanilla JS handles actual playback
      },
      updateProgress: (videoId: string, progress: number) => {
        setTapes(prev => prev.map(t =>
          (t.videoId === videoId || t.playlistId === videoId)
            ? { ...t, progress }
            : t
        ));
      },
      addTapeFromSearch: (videoId: string, title: string, author: string, isPlaylist: boolean, playlistId?: string) => {
        setTapes(prev => {
          const dedupKey = isPlaylist ? playlistId! : videoId;
          if (prev.some(t => isPlaylist ? t.playlistId === dedupKey : t.videoId === dedupKey)) {
            // Already exists — just update timestamp and move to recent
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
            y: st + 20 + row2 * 170 + Math.round((Math.random() - 0.5) * 30),
            angle: Math.round((Math.random() * 40 - 20) * 10) / 10,
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

  const playTape = useCallback((tape: Tape) => {
    // Bridge to vanilla JS player
    if (!window.myApp) return;
    const AppState = window.AppState;
    if (!AppState) return;

    AppState.starting = true;

    if (tape.isPlaylist && tape.playlistId) {
      AppState.singleVideo = false;
      AppState.myVideoPlaylistName = tape.playlistId;
      AppState.songTitle = tape.title;
      AppState.songAuthor = tape.author;
      window.myApp.submitVideoNameFromSaved(tape.playlistId, tape.playlistIndex ?? 0);
    } else {
      AppState.singleVideo = true;
      AppState.myVideoName = tape.videoId;
      AppState.songTitle = tape.title;
      AppState.songAuthor = tape.author;
      window.myApp.submitVideoNameFromSaved(tape.videoId, 0);
    }
  }, []);

  const deleteTape = useCallback((id: string) => {
    setTapes(prev => prev.filter(t => t.id !== id));
    setZOrder(prev => prev.filter(i => i !== id));
    setMenuId(null);
  }, []);

  const rewindTape = useCallback((id: string) => {
    setTapes(prev => prev.map(t => t.id === id ? { ...t, progress: 0 } : t));
    setRewindingId(id);
    setTimeout(() => setRewindingId(null), 400);
    setMenuId(null);
  }, []);

  // --- Drag system ---
  const startDrag = useCallback((e: React.PointerEvent, tape: Tape) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuId(null);

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
    }

    function onUp(ev: PointerEvent) {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!dragging) return;
      const { cx, cy } = posFromEvent(ev);
      setTapes(prev => prev.map(t => t.id === tape.id ? { ...t, x: cx, y: cy } : t));
      setDragId(null);
      setDragPos(null);
      setDragScreenPos(null);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  // --- Pan on background ---
  const startPan = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-tape]')) return;
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

  // Assign positions to tapes that don't have them
  const positionedTapes = tapes.map((tape, i) => {
    if (tape.x !== undefined && tape.y !== undefined) return tape;
    const col = i % 4;
    const row = Math.floor(i / 4);
    return {
      ...tape,
      x: 30 + col * 260 + Math.round((Math.random() - 0.5) * 40),
      y: 20 + row * 170 + Math.round((Math.random() - 0.5) * 30),
      angle: Math.round((Math.random() * 40 - 20) * 10) / 10,
    };
  });

  return (
    <>
      <style>{`
        @keyframes tape-spin-slow { to { transform: rotate(-360deg) } }
        @keyframes tape-spin-fast { to { transform: rotate(-360deg) } }
        @keyframes tape-rewind { 0%,100% { transform: rotate(0deg) } 20% { transform: rotate(-4deg) } 40% { transform: rotate(4deg) } 60% { transform: rotate(-3deg) } 80% { transform: rotate(2deg) } }
      `}</style>

      <div
        ref={tableRef}
        onPointerDown={startPan}
        onClick={e => {
          if (!(e.target as HTMLElement)?.closest('[data-tape]')) setMenuId(null);
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
          {positionedTapes.map(tape => {
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
                    playTape(tape);
                  }
                }}
                onContextMenu={e => {
                  e.preventDefault();
                  setMenuId(prev => prev === tape.id ? null : tape.id);
                }}
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

                {/* Context menu */}
                {hasMenu && (
                  <div style={{
                    position: 'absolute', bottom: -40, left: '50%', transform: 'translateX(-50%)',
                    display: 'flex', gap: 6, zIndex: 10000,
                  }}>
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); playTape(tape); }}
                      style={{
                        padding: '4px 10px', borderRadius: 6, border: 'none',
                        background: '#22c55e', color: '#fff', fontSize: 12,
                        cursor: 'pointer', whiteSpace: 'nowrap',
                        fontFamily: "'Courier New', monospace",
                      }}
                    >Play</button>
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); rewindTape(tape.id); }}
                      style={{
                        padding: '4px 10px', borderRadius: 6, border: 'none',
                        background: '#333', color: '#fff', fontSize: 12,
                        cursor: 'pointer', whiteSpace: 'nowrap',
                        fontFamily: "'Courier New', monospace",
                      }}
                    >Rewind</button>
                    <button
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); deleteTape(tape.id); }}
                      style={{
                        padding: '4px 10px', borderRadius: 6, border: 'none',
                        background: '#ef4444', color: '#fff', fontSize: 12,
                        cursor: 'pointer', whiteSpace: 'nowrap',
                        fontFamily: "'Courier New', monospace",
                      }}
                    >Remove</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Drag overlay */}
      {dragId && dragScreenPos && (() => {
        const tape = positionedTapes.find(t => t.id === dragId);
        if (!tape) return null;
        return (
          <div style={{
            position: 'fixed',
            left: dragScreenPos.x,
            top: dragScreenPos.y,
            zIndex: 99999,
            pointerEvents: 'none',
            transform: `rotate(${tape.angle ?? 0}deg) scale(1.06)`,
            filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.4))',
          }}>
            <CassetteTape tape={tape} />
          </div>
        );
      })()}
    </>
  );
}
