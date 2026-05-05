import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Tape, TAPE_STYLES, InfiniteConfig, InfiniteTrack } from './types';
import { to3D, to2D } from './coords';
import { loadTapes, saveTapes } from './db';
import { buildShareUrl, decodeTapeShare, fetchShareById, type SharePayload } from './share';
import { DeckTape3D } from './DeckTape3D';
import { MixtapeCreator, MIXTAPE_PANEL_STYLES, MIXTAPE_TRACK_LIST, MIXTAPE_TRACK_ROW, MIXTAPE_TRACK_NUM, MIXTAPE_TRACK_TITLE, MIXTAPE_TRACK_AUTHOR, MIXTAPE_TRACK_DURATION } from '../mixtape/Creator';
import { MixtapeBuilder, MixtapeBuilderTrack } from './MixtapeBuilder';
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

function ShareButton({ tape, narrow = false }: { tape: Tape; narrow?: boolean }) {
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
  // Narrow + wide use the same style — `narrow` arg retained for API compat.
  void narrow;
  return (
    <button
      onClick={onClick}
      className="tape-btn"
      style={{ fontSize: '1.1em', padding: '4px 10px', lineHeight: '1.5em' }}
    ><i className={copied ? 'fas fa-check' : 'fas fa-share'} />&nbsp;{copied ? 'copied' : 'share'}</button>
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

export function TapesTable({ mixtape }: { mixtape?: MixtapeData }) {
  const [tapes, setTapes] = useState<Tape[]>([]);
  const [mounted, setMounted] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [tableReady, setTableReady] = useState(false);
  useEffect(() => {
    function onTableReady() { setTableReady(true); }
    window.addEventListener('jeem-table-ready', onTableReady);
    return () => window.removeEventListener('jeem-table-ready', onTableReady);
  }, []);
  // Reveal the search/start UI with a glitch-in flicker once the 3D scene is
  // fully ready (table texture + recorder + tapes all loaded).
  useEffect(() => {
    if (!sceneReady) return;
    // Wait a beat after the tapes settle before flickering the start UI in.
    const reveal = setTimeout(() => {
      document.body.classList.remove('scene-not-ready');
      const startEl = document.getElementById('start-container');
      if (startEl) {
        startEl.classList.add('ui-glitching-in');
        setTimeout(() => startEl.classList.remove('ui-glitching-in'), 600);
      }
    }, 500);
    return () => clearTimeout(reveal);
  }, [sceneReady]);
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
  // Camera target in 3D — updated by SceneContents so new-tape spawn logic
  // knows where the camera is looking (e.g. offset on mobile).
  const cameraTargetRef = useRef<{ x: number; z: number }>({ x: 0, z: 0 });
  const spawnX = () => Math.round(to2D(cameraTargetRef.current.x, cameraTargetRef.current.z)[0] + (Math.random() - 0.5) * 280);
  const spawnY = () => Math.round(to2D(cameraTargetRef.current.x, cameraTargetRef.current.z)[1] + (Math.random() - 0.5) * 200);
  const spawnCX = () => Math.round(to2D(cameraTargetRef.current.x, cameraTargetRef.current.z)[0]);
  const spawnCY = () => Math.round(to2D(cameraTargetRef.current.x, cameraTargetRef.current.z)[1]);
  const [isPanning, setIsPanning] = useState(false);
  const [loadedTape, setLoadedTape] = useState<Tape | null>(null);
  // True when the current loadedTape is playing via the 3D recorder rather than
  // the 2D deck — suppresses the deck-side filter so the 3D tape stays visible.
  const [recorderSourced, setRecorderSourced] = useState(false);
  const [deckEjecting, setDeckEjecting] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  // Shared mutable ref read by TapeBody's useFrame to spin spools — avoids
  // polling window.AppState every tick and avoids re-rendering all tapes
  // on play/pause toggles.
  const isPlayingRef = useRef(false);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
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
  const inspectTapeIdRef = useRef<string | null>(null);
  inspectTapeIdRef.current = inspectTapeId;
  // Delayed flag — UI overlays for the inspect view only appear after the
  // fade + camera tween have settled. Cleared immediately on exit.
  const [inspectUiVisible, setInspectUiVisible] = useState(false);
  const inspectUiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Animation phase for the inspect-view UI so we can apply a glitch-in /
  // glitch-out flicker around the boolean visibility toggle.
  // 'hidden'  → not rendered.
  // 'showing' → rendered + ui-glitching-in class for ~450ms.
  // 'visible' → rendered, no animation class.
  // 'hiding'  → rendered + ui-glitching-out class for ~450ms before unmount.
  const [inspectUiPhase, setInspectUiPhase] = useState<'hidden' | 'showing' | 'visible' | 'hiding'>('hidden');
  useEffect(() => {
    if (inspectUiVisible) {
      setInspectUiPhase('showing');
      const t = setTimeout(() => setInspectUiPhase('visible'), 450);
      return () => clearTimeout(t);
    }
    setInspectUiPhase(prev => (prev === 'hidden' ? 'hidden' : 'hiding'));
    const t = setTimeout(() => setInspectUiPhase('hidden'), 450);
    return () => clearTimeout(t);
  }, [inspectUiVisible]);
  const inspectUiRendered = inspectUiPhase !== 'hidden';
  const inspectUiClass = inspectUiPhase === 'showing' ? 'ui-glitching-in' : inspectUiPhase === 'hiding' ? 'ui-glitching-out' : '';
  // Set when the user clicks remove on the inspected tape — fades it away
  // before the exit-inspect sequence runs. Cleared once removal completes.
  const [removingInspected, setRemovingInspected] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [mixtapeBuilderTracks, setMixtapeBuilderTracks] = useState<MixtapeBuilderTrack[]>([]);
  const trackListScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!loadedTape) return;
    const list = trackListScrollRef.current;
    if (!list) return;
    const active = list.querySelector('.tape-track.active') as HTMLElement | null;
    if (!active) return;
    const targetTop = active.offsetTop - (list.clientHeight / 2) + (active.offsetHeight / 2);
    list.scrollTo({ top: targetTop, behavior: 'smooth' });
  }, [loadedTape?.infiniteIndex, loadedTape?.playlistIndex, loadedTape?.id]);

  // Track narrow viewports so the tracklist panel + inspect layout can
  // collapse to a full-width / bottom-anchored layout on phones.
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth <= 960
  );
  useEffect(() => {
    const handler = () => setIsNarrow(window.innerWidth <= 960);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Brief glitch-in flicker on the playback info panel each time the panel
  // appears (i.e. each time `isPlaying` transitions from false to true).
  const [playbackPanelGlitching, setPlaybackPanelGlitching] = useState(false);
  const wasPlayingRef = useRef(false);
  useEffect(() => {
    if (isPlaying && !wasPlayingRef.current) {
      setPlaybackPanelGlitching(true);
      const t = setTimeout(() => setPlaybackPanelGlitching(false), 500);
      wasPlayingRef.current = true;
      return () => clearTimeout(t);
    }
    if (!isPlaying) wasPlayingRef.current = false;
  }, [isPlaying]);

  // While a pending placeholder tape is in inspect view, show the
  // search-creator overlay (#single-tape-creator) with the same glitch
  // class as the rest of the inspect UI. The two action buttons in
  // #start-form are already hidden by the existing inspect → form-hide
  // effect, so we don't need to touch #start-container here.
  const inspectedTape = inspectTapeId ? tapes.find(t => t.id === inspectTapeId) : undefined;
  const inspectedIsPending = !!inspectedTape?.isPending;
  const inspectedIsPendingMixtape = !!inspectedTape?.isPendingMixtape;
  useEffect(() => {
    const pendingActive = inspectedIsPending && inspectUiRendered;
    const creatorEl = document.getElementById('single-tape-creator');
    if (!creatorEl) return;
    if (pendingActive) {
      creatorEl.style.display = 'flex';
      creatorEl.classList.remove('ui-glitching-in', 'ui-glitching-out');
      if (inspectUiClass) {
        void creatorEl.offsetWidth;
        creatorEl.classList.add(inspectUiClass);
      }
      if (inspectUiPhase === 'visible') {
        const input = document.getElementById('idEntry') as HTMLInputElement | null;
        if (input && document.activeElement !== input) input.focus();
      }
    } else {
      creatorEl.classList.remove('ui-glitching-in', 'ui-glitching-out');
      creatorEl.style.display = 'none';
      const input = document.getElementById('idEntry') as HTMLInputElement | null;
      if (input) input.value = '';
    }
  }, [inspectedIsPending, inspectUiRendered, inspectUiClass, inspectUiPhase]);


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
      // Inspect view: run the standard exit-inspect tween instead of letting
      // the <a href="."> reload the page (which kills the glitch animation
      // and leaves UI elements visible mid-fade).
      if (inspectTapeIdRef.current != null) {
        e.preventDefault();
        exitInspectRef.current?.();
        return;
      }
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

      // Migration: rescue any tape whose saved position lands under the 3D
      // recorder (older builds saved the recorder pose as the tape's xy when
      // it was loaded). Without this, refreshing while a tape is in the
      // recorder leaves that tape stuck under it.
      // Recorder is at 3D (-20, 0, 4) → 2D (1000, 1400); snap zone ~350×400.
      const RX = 1000, RY = 1400, RW = 380, RH = 420;
      loaded = loaded.map(t => {
        if (t.x == null || t.y == null) return t;
        if (Math.abs(t.x - RX) < RW && Math.abs(t.y - RY) < RH) {
          return {
            ...t,
            x: spawnX(),
            y: spawnY(),
            angle: Math.round((Math.random() * 40 - 20) * 10) / 10,
          };
        }
        return t;
      });

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

  // Persist to IndexedDB on every tapes state change. Skip pending
  // placeholder tapes so they don't get saved across refreshes.
  useEffect(() => {
    if (mounted) {
      saveTapes(tapes.filter(t => !t.isPending && !t.isPendingMixtape)).catch(console.error);
    }
  }, [tapes, mounted]);

  // Cleanup all pending timers on unmount — prevents stale callbacks
  // from firing on an unmounted component (e.g. navigating away mid-inspect).
  useEffect(() => {
    return () => {
      if (inspectUiTimerRef.current) clearTimeout(inspectUiTimerRef.current);
      if (recorderLoadingTimerRef.current) clearTimeout(recorderLoadingTimerRef.current);
    };
  }, []);

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
            x: spawnX(),
            y: spawnY(),
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
            x: spawnX(),
            y: spawnY(),
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
        // If a pending placeholder is in the inspect view, hand off the
        // metadata to finishPendingTape so it can drive the timed sequence
        // (fade UI/tape, populate, camera back, respawn). We don't update
        // tapes here at all in that case.
        const hasPending = tapesRef.current.some(t => t.isPending);
        if (hasPending) {
          finishPendingTapeRef.current?.({ videoId, title, author, isPlaylist, playlistId });
          return;
        }
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
            x: spawnX(),
            y: spawnY(),
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
        x: spawnX(),
        y: spawnY(),
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

    // Wipe any stale title/author display from the previous tape so the
    // padinfo bar doesn't flash the previous video while the new YouTube
    // metadata is loading. demo.js's state_change handler will refill these
    // once the new video's data arrives.
    const songName = document.getElementById('song-name');
    const songAuthor = document.getElementById('song-author');
    if (songName) songName.innerHTML = '';
    if (songAuthor) songAuthor.innerHTML = '';
    if (window.AppState) {
      window.AppState.songTitle = tape.title || '';
      window.AppState.songAuthor = tape.author || '';
    }

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
  const handle3DDragStart = useCallback((tapeId: string) => {
    cancelMenu();
    setDragging3D(true);
    if (tapeId === MIXTAPE_ID && showMixtapeCreator) return;
    // Don't swap the player-view UI to a newly picked tape while another
    // tape is loaded/playing — the playing tape's tracklist stays put.
    if (loadedRef.current && loadedRef.current.id !== tapeId) return;
    enterPlayerView(tapeId);
  }, [cancelMenu, enterPlayerView, showMixtapeCreator]);

  const handle3DDragEnd = useCallback((tapeId: string, x2d: number, y2d: number, droppedOnDeck: boolean, landedOnRecorder: boolean) => {
    setDragging3D(false);
    // Block interaction with mixtape tape while creator is open
    if (tapeId === MIXTAPE_ID && showMixtapeCreator) return;
    if (droppedOnDeck) {
      const t = tapesRef.current.find(t => t.id === tapeId);
      if (t) loadIntoPlayer(t);
      return;
    }
    // If the drag ended by loading into the recorder, skip the position
    // save — `x2d/y2d` are the recorder pose, and persisting them means the
    // tape would spawn under the recorder on refresh and get stuck there.
    if (!landedOnRecorder) {
      setTapes(prev => prev.map(t => t.id === tapeId ? { ...t, x: x2d, y: y2d } : t));
    }
    if (!landedOnRecorder && (!loadedRef.current || loadedRef.current.id === tapeId)) {
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

    // Respawn any previously-loaded tape: drop it back onto the centre of the
    // table from SPAWN_HEIGHT (with a bit of variance) instead of having it
    // fall in place from the recorder pose.
    const prev = loadedRef.current;
    if (prev && prev.id !== tapeId) {
      const px = spawnX();
      const py = spawnY();
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

  const exitInspectRef = useRef<(() => void) | null>(null);
  interface PendingMetadata { videoId: string; title: string; author: string; isPlaylist: boolean; playlistId?: string }
  const finishPendingTapeRef = useRef<((meta: PendingMetadata) => void) | null>(null);
  const exitInspect = useCallback(() => {
    if (inspectUiTimerRef.current) { clearTimeout(inspectUiTimerRef.current); inspectUiTimerRef.current = null; }
    if (inspectTapeIdRef.current == null) return;
    const camDur = 1000;
    const zoomDelay = 200;
    const zoomDur = 1000;
    setInspectUiVisible(false);
    window.dispatchEvent(new CustomEvent('jeem-centre-camera', {
      detail: { restoreSaved: true, animate: true, dur: camDur, zoomTo: 40, zoomDelay, zoomDur },
    }));
    // If the inspected tape is still a pending placeholder (no videoId set),
    // delete it as part of the exit so we don't leave an empty tape behind.
    const inspectingId = inspectTapeIdRef.current;
    inspectUiTimerRef.current = setTimeout(() => {
      const stillPending = tapesRef.current.some(t => t.id === inspectingId && (t.isPending || t.isPendingMixtape));
      if (stillPending) {
        setTapes(prev => prev.filter(t => t.id !== inspectingId));
      }
      setInspectTapeId(null);
      setEditingTitle(false);
      setMixtapeBuilderTracks([]);
      setRemovingInspected(false);
      inspectUiTimerRef.current = null;
    }, zoomDelay + zoomDur);
  }, []);
  exitInspectRef.current = exitInspect;
  // Expose for vanilla JS (e.g. // jeem-fm title link) so it can exit
  // inspect view instead of doing a full page reload.
  (window as any).exitTapeInspect = exitInspect;
  (window as any).isTapeInspecting = () => inspectTapeIdRef.current != null;

  // Sequence that runs after the user submits a URL/search while in the
  // pending-tape inspect view. Mirrors the entry timing in reverse:
  //   t=0    glitch search UI out, fade the populated tape
  //   t=600  start camera tween back to the table
  //   t=1800 inspectTapeId clears; respawn the tape from SPAWN_HEIGHT so it
  //          drops into a fresh spot on the table view
  const finishPendingTape = useCallback((meta: PendingMetadata) => {
    const placeholderId = inspectTapeIdRef.current;
    if (!placeholderId) return;
    // t=0: glitch the search overlay out + fade the placeholder tape.
    setInspectUiVisible(false);
    setRemovingInspected(true);
    const FADE_MS = 600;
    const EXIT_MS = 1200; // matches zoomDelay + zoomDur in exitInspect
    setTimeout(() => {
      // t=600: fade complete. Populate the placeholder in place (keep its
      // id so exitInspect's restore-saved-pose still operates on the same
      // tape) and start the camera tween back to the table.
      setTapes(prev => prev.map(t => t.id === placeholderId ? {
        ...t,
        videoId: meta.videoId,
        playlistId: meta.playlistId || undefined,
        isPlaylist: meta.isPlaylist,
        title: meta.title,
        author: meta.author,
        timestamp: Date.now(),
        isPending: false,
      } : t));
      exitInspectRef.current?.();
      setTimeout(() => {
        // t=1800: camera back. Re-position the now-populated tape at canvas
        // centre with random jitter and bump its respawn version so TapeBody
        // remounts and drops in from SPAWN_HEIGHT.
        const px = spawnX();
        const py = spawnY();
        const pa = Math.round((Math.random() * 40 - 20) * 10) / 10;
        setTapes(prev => prev.map(t => t.id === placeholderId ? { ...t, x: px, y: py, angle: pa } : t));
        setNewTapeIds(s => { const n = new Set(s); n.add(placeholderId); return n; });
        setTimeout(() => setNewTapeIds(s => { const n = new Set(s); n.delete(placeholderId); return n; }), 2000);
        setRespawnVersions(m => { const n = new Map(m); n.set(placeholderId, (n.get(placeholderId) ?? 0) + 1); return n; });
        setRemovingInspected(false);
      }, EXIT_MS);
    }, FADE_MS);
  }, []);
  finishPendingTapeRef.current = finishPendingTape;

  const handle3DDoubleTap = useCallback((tapeId: string, worldX?: number, worldZ?: number) => {
    // Double-tap on table view → enter inspect view (closer zoom, single tape).
    // Double-tap while inspecting → exit back to table view.
    if (viewRef.current === 'player' || showMixtapeCreator) return;
    if (inspectTapeIdRef.current != null) {
      exitInspect();
      return;
    }
    if (inspectUiTimerRef.current) { clearTimeout(inspectUiTimerRef.current); inspectUiTimerRef.current = null; }
    const tape = tapesRef.current.find(t => t.id === tapeId);
    if (!tape) return;
    // Prefer the live world XZ from the rigid body — the stored 2D x/y can
    // lag the actual position, which would offset the inspect camera so the
    // tape isn't centred on screen.
    let tx: number, tz: number;
    if (worldX != null && worldZ != null) {
      tx = worldX; tz = worldZ;
    } else if (tape.x != null && tape.y != null) {
      [tx, tz] = to3D(tape.x, tape.y);
    } else {
      return;
    }
    setInspectTapeId(tapeId);
    const camDelay = 200;
    const camDur = 1000;
    const zoomDelay = 200;
    const zoomDur = 1000;
    // Single tapes have no tracklist panel, so centre the tape on screen.
    // Playlist / infinite / mixtape tapes leave room on the right for the
    // tracklist by sitting in the left half of the screen — but on narrow
    // viewports the panel anchors below the tape, so centre it there too.
    const isSingle = !tape.isPlaylist && !tape.isInfinite;
    const narrowNow = window.innerWidth <= 960;
    const tapeOffset = -8;
    // Single / narrow: target south of tape so tape projects higher (leaves room
    // for title above + tracklist panel below). Wide tracklist: target north of
    // tape so the cassette drops lower in the frame, with title above and
    // buttons below stacked tightly around it.
    // Single tapes: small negative offset puts the cassette in the lower half
    // of the screen (leaves room above for the title). Narrow viewports keep
    // the +4 (tape sits high so the bottom-anchored panel has room). Wide
    // tracklist tapes use +2 (cassette mid-frame, title above, buttons below).
    // Narrow tracklist bumps tz to 6 so the cassette projects ~10% higher
    // on screen, leaving room for buttons at 95vh.
    const tzOffset = 3;
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('jeem-centre-camera', {
        detail: { tx: tx + tapeOffset, tz: tz + tzOffset, animate: true, dur: camDur, zoomTo: 24, zoomDelay, zoomDur, saveCurrentPose: true },
      }));
    }, camDelay);
    inspectUiTimerRef.current = setTimeout(() => {
      setInspectUiVisible(true);
      inspectUiTimerRef.current = null;
    }, camDelay + zoomDelay + zoomDur + 250);
  }, [showMixtapeCreator, exitInspect]);

  const handle3DMenuAction = useCallback((_tapeId: string, _action: 'link' | 'rewind' | 'remove') => {
    // Context menu disabled — functionality will be rebuilt later
  }, []);

  // ── "make a single tape" flow ──
  // Spawns a placeholder tape and runs the inspect-entry sequence so the
  // user lands in view 2 with a blank tape and a search bar.
  const startPendingSingleTape = useCallback(() => {
    if (viewRef.current === 'player' || showMixtapeCreator) return;
    if (inspectTapeIdRef.current != null) return;
    if (tapesRef.current.some(t => t.isPending)) return;

    const px = spawnCX();
    const py = spawnCY();
    const placeholderId = crypto.randomUUID?.() ?? `pending-${Date.now()}`;
    const placeholder: Tape = {
      id: placeholderId,
      videoId: '',
      isPlaylist: false,
      title: '',
      author: '',
      tapeStyle: Math.floor(Math.random() * TAPE_STYLES.length),
      textureVariant: nextTextureVariant(),
      progress: 0,
      timestamp: Date.now(),
      x: px, y: py,
      angle: Math.round((Math.random() * 40 - 20) * 10) / 10,
      isPending: true,
    };
    setTapes(prev => [placeholder, ...prev]);
    setZOrder(o => [placeholder.id, ...o]);
    // Don't mark as `isNew` — that triggers SPAWN_HEIGHT fall-in, but inspect
    // mode pins the tape on the next frame and captures the still-airborne y,
    // leaving the cassette floating above the table.

    if (inspectUiTimerRef.current) { clearTimeout(inspectUiTimerRef.current); inspectUiTimerRef.current = null; }
    setInspectTapeId(placeholderId);
    const [tx, tz] = to3D(px, py);
    const camDelay = 200, camDur = 1000, zoomDelay = 200, zoomDur = 1000;
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('jeem-centre-camera', {
        detail: { tx: tx - 8, tz: tz + 2.5, animate: true, dur: camDur, zoomTo: 24, zoomDelay, zoomDur, saveCurrentPose: true},
      }));
    }, camDelay);
    inspectUiTimerRef.current = setTimeout(() => {
      setInspectUiVisible(true);
      inspectUiTimerRef.current = null;
    }, camDelay + zoomDelay + zoomDur + 250);
  }, [showMixtapeCreator]);

  useEffect(() => {
    function handle() { startPendingSingleTape(); }
    window.addEventListener('jeem-create-pending-tape', handle);
    return () => window.removeEventListener('jeem-create-pending-tape', handle);
  }, [startPendingSingleTape]);

  // ── "make a mixtape" flow ──
  // Same shape as startPendingSingleTape but flagged as isPendingMixtape.
  // The inspect-view title editor is reused for the mixtape name; a
  // separate DOM overlay (#mixtape-creator-overlay) holds the blurb +
  // tracks placeholder + create button.
  const startPendingMixtape = useCallback(() => {
    if (viewRef.current === 'player' || showMixtapeCreator) return;
    if (inspectTapeIdRef.current != null) return;
    if (tapesRef.current.some(t => t.isPending || t.isPendingMixtape)) return;
    setMixtapeBuilderTracks([]);

    const px = spawnCX();
    const py = spawnCY();
    const placeholderId = crypto.randomUUID?.() ?? `pending-mix-${Date.now()}`;
    const placeholder: Tape = {
      id: placeholderId,
      videoId: '',
      isPlaylist: false,
      isInfinite: true,
      title: '[mixtape name]',
      author: 'mixtape',
      tapeStyle: Math.floor(Math.random() * TAPE_STYLES.length),
      textureVariant: nextTextureVariant(),
      progress: 0,
      timestamp: Date.now(),
      x: px, y: py,
      angle: Math.round((Math.random() * 40 - 20) * 10) / 10,
      isPendingMixtape: true,
    };
    setTapes(prev => [placeholder, ...prev]);
    setZOrder(o => [placeholder.id, ...o]);

    if (inspectUiTimerRef.current) { clearTimeout(inspectUiTimerRef.current); inspectUiTimerRef.current = null; }
    setInspectTapeId(placeholderId);
    const [tx, tz] = to3D(px, py);
    const camDelay = 200, camDur = 1000, zoomDelay = 200, zoomDur = 1000;
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('jeem-centre-camera', {
        detail: { tx: tx - 8, tz: tz + 3.5, animate: true, dur: camDur, zoomTo: 24, zoomDelay, zoomDur, saveCurrentPose: true },
      }));
    }, camDelay);
    inspectUiTimerRef.current = setTimeout(() => {
      setInspectUiVisible(true);
      inspectUiTimerRef.current = null;
    }, camDelay + zoomDelay + zoomDur + 250);
  }, [showMixtapeCreator]);

  useEffect(() => {
    function handle() { startPendingMixtape(); }
    window.addEventListener('jeem-create-pending-mixtape', handle);
    return () => window.removeEventListener('jeem-create-pending-mixtape', handle);
  }, [startPendingMixtape]);

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

  // Active area in 2D coords
  const cx = spawnCX();   // 2000
  const cy = spawnCY();   // 1200
  const halfAX = 22.9 * 50;  // ACTIVE_W/2 * MAP_SCALE ≈ 1145
  const halfAZ = 15 * 50;    // ACTIVE_H/2 * MAP_SCALE = 750
  const minX = cx - halfAX + 150;
  const maxX = cx + halfAX - 150;
  const minY = cy - halfAZ + 100;
  const maxY = cy + halfAZ - 100;

  // Position tapes inside the active area. Cached on `tapes` identity so the
  // per-tape jitter / re-centering doesn't re-run (with fresh Math.random)
  // every render — previously this produced a new array + new positions on
  // every render, which cascaded through the whole 3D tree.
  const positionedTapes = useMemo(() => tapes.map((tape) => {
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
    return {
      ...tape,
      x: cx + Math.round((Math.random() - 0.5) * 280),
      y: cy + Math.round((Math.random() - 0.5) * 200),
      angle: Math.round((Math.random() * 40 - 20) * 10) / 10,
    };
  // cx/cy/minX/maxX/minY/maxY read camera target refs; intentionally omitted
  // from deps so the memo doesn't bust on every pan.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [tapes]);

  if (!mounted) return null;

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
          cameraTargetRef={cameraTargetRef}
          fadeInspectedTape={removingInspected}
          isPlayingRef={isPlayingRef}
        />
      </Suspense>

      {!sceneReady && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99997,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          // Drop the opaque background once the table texture is rendered so
          // the wood surface is visible behind the spinner while tapes load.
          background: tableReady ? 'transparent' : '#0a0805',
          pointerEvents: tableReady ? 'none' : 'auto',
          transition: 'background 0.25s ease',
        }}>
          <div className="tape-spinner" />
        </div>
      )}

      {inspectTapeId && inspectUiRendered && (() => {
        const tape = tapes.find(t => t.id === inspectTapeId);
        if (!tape) return null;
        // Pending placeholder uses a separate DOM overlay (#single-tape-creator)
        // for the search input — no title/remove UI here.
        if (tape.isPending) return null;
        // Single tapes get a centred camera + no tracklist panel, so centre
        // the title and button row over the tape too. Playlist / infinite /
        // mixtape inspect keeps them at 32% so they sit above the tape in
        // the left half of the screen.
        const isSingle = !tape.isPlaylist && !tape.isInfinite;
        // On narrow viewports the panel anchors at the bottom and the
        // tape is centred — so place the inspect title/buttons row centred
        // and full-width too. On wider viewports the tracklist panel sits
        // in the right half so the inspect row stays at 32% above the tape.
        const centred = true;
        // Mixtape builder uses centred layout (tape is centred on screen).
        const mixtapeCentred = tape.isPendingMixtape;
        // Narrow uses the same desktop-style layout for both single and
        // tracklist: tighter title, free-floating buttons (no bottom bar).
        const wrapperWidth = isNarrow ? '50vw' : '25vw';
        // Wide non-centred (tracklist inspect): anchor at 25% — middle of the
        // left half of the screen — so title/buttons stay put as the viewport
        // resizes, instead of drifting with a percentage that doesn't match
        // the cassette's projected position.
        const colStyle: React.CSSProperties = {
          position: 'fixed', left: (centred || mixtapeCentred) ? '50%' : '25%', transform: 'translateX(-50%)',
          width: wrapperWidth,
          zIndex: 99996, pointerEvents: 'auto',
          display: 'flex', justifyContent: 'center',
        };
        // Title/top position based on viewport. Wide tracklist tapes get a
        // lower title (sits just above the cassette, which is also dropped
        // lower in the frame) so the title/cassette/buttons stack tightly.
        // Title vertical position. Narrow (single + tracklist) matches the
        // desktop pattern with the title above the cassette.
        const titleTop = isNarrow ? '13vh' : '12vh';
        // Buttons row position. Narrow (single + tracklist) uses the same
        // free-floating row at 75vh as desktop, content-sized + nowrap.
        const buttonsRowStyle: React.CSSProperties = {
          ...colStyle, width: 'auto', top: '94vh', gap: 12, justifyContent: 'center', flexWrap: 'nowrap',
        };
        // Shared button classes
        const btnClass = 'tape-btn';
        return (
          <div className={inspectUiClass}>
            <div style={{ ...colStyle, top: titleTop }}>
              {editingTitle ? (
                <textarea
                  rows={1}
                  autoFocus
                  value={tape.title}
                  onChange={(e) => {
                    const newTitle = e.target.value;
                    setTapes(prev => prev.map(t => t.id === inspectTapeId ? { ...t, title: newTitle } : t));
                    const ta = e.target as HTMLTextAreaElement;
                    ta.style.height = 'auto';
                    ta.style.height = ta.scrollHeight + 'px';
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      setEditingTitle(false);
                    } else if (e.key === 'Escape') {
                      setEditingTitle(false);
                    }
                  }}
                  onBlur={() => setEditingTitle(false)}
                  ref={(el) => {
                    if (el) {
                      el.style.height = 'auto';
                      el.style.height = el.scrollHeight + 'px';
                      el.setSelectionRange(el.value.length, el.value.length);
                    }
                  }}
                  className="tape-inspect-title"
                  style={{ width: '100%', paddingRight: centred ? undefined : 20, boxSizing: 'border-box' }}
                />
              ) : (
                <div
                  className="tape-inspect-title-display"
                  onClick={() => setEditingTitle(true)}
                  title="Click to edit"
                  style={{ width: '100%', paddingRight: centred ? undefined : 20, boxSizing: 'border-box' }}
                >
                  <span className="tape-inspect-title-text">{tape.title || (tape.isPending ? '' : 'Untitled')}</span>
                  <i className="fas fa-pen tape-inspect-title-pen" aria-hidden="true" />
                </div>
              )}
            </div>
            {!tape.isPendingMixtape && (
              <div style={buttonsRowStyle}>
                <button
                  className={btnClass}
                  onClick={() => rewindTape(inspectTapeId)}
                ><i className="fa fa-fast-backward" />&nbsp;rewind</button>
                <ShareButton tape={tape} narrow={isNarrow} />

                <button
                  className={btnClass}
                  onClick={() => {
                    const target = inspectTapeId;
                    if (!target) return;
                    setRemovingInspected(true);
                    setTimeout(() => {
                      deleteTape(target);
                      exitInspect();
                    }, 600);
                  }}
                ><i className="fas fa-trash" />&nbsp;remove</button>
              </div>
            )}
          </div>
        );
      })()}

      {inspectedIsPendingMixtape && inspectUiRendered && (() => {
        const tape = tapes.find(t => t.id === inspectTapeId);
        if (!tape) return null;
        return (
          <div className={`mixtape-creator-overlay ${inspectUiClass}`}>
            <div className="single-tape-blurb">Create your mixtape by adding tracks via youtube url or search then click create.</div>
            <MixtapeBuilder
              name={tape.title === '[mixtape name]' ? '' : tape.title}
              tracks={mixtapeBuilderTracks}
              onAddTrack={(t) => setMixtapeBuilderTracks(prev => [...prev, t])}
              onCreate={() => {
                const mixtapeName = tape.title === '[mixtape name]' ? '' : tape.title;
                if (!mixtapeName.trim() || !mixtapeBuilderTracks.length) return;
                const realId = crypto.randomUUID?.() ?? `${Date.now()}`;
                const infiniteTracks: InfiniteTrack[] = mixtapeBuilderTracks.map(t => ({
                  videoId: t.videoId,
                  title: t.title,
                  author: t.author,
                }));
                const realTape: Tape = {
                  id: realId,
                  videoId: infiniteTracks[0]?.videoId || '',
                  isPlaylist: false,
                  isInfinite: true,
                  infiniteConfig: { source: 'youtube', type: 'artist', value: mixtapeName } as InfiniteConfig,
                  infiniteHistory: infiniteTracks,
                  infiniteIndex: 0,
                  title: mixtapeName.trim(),
                  author: 'mixtape',
                  tapeStyle: tape.tapeStyle,
                  textureVariant: tape.textureVariant,
                  progress: 0,
                  timestamp: Date.now(),
                  x: spawnCX(),
                  y: spawnCY(),
                  angle: Math.round((Math.random() * 40 - 20) * 10) / 10,
                };
                setTapes(prev => prev.map(t => t.id === tape.id ? realTape : t));
                setZOrder(o => [realId, ...o.filter(id => id !== tape.id)]);
                setNewTapeIds(s => new Set(s).add(realId));
                setTimeout(() => setNewTapeIds(s => { const n = new Set(s); n.delete(realId); return n; }), 2000);
                setMixtapeBuilderTracks([]);
                setInspectTapeId(null);
              }}
            />
          </div>
        );
      })()}

{/* Unified tape info + tracklist panel — single layout for idle and playback */}
      {((playerTapeId && isPlaying) || (inspectTapeId && inspectUiRendered)) && !showMixtapeCreator && (() => {
        const focusId = playerTapeId || inspectTapeId;
        // Prefer loaded tape (source of truth during playback), else the focused player/inspect tape
        const tape = loadedTape ?? tapes.find(t => t.id === focusId);
        if (!tape) return null;
        if (tape.isPending || tape.isPendingMixtape) return null;
        // Single-tape inspect view: nothing useful to show in the panel
        // (no tracklist, no per-track info), so suppress it entirely.
        if (inspectTapeId && !playerTapeId && !tape.isPlaylist && !tape.isInfinite) return null;

        const interactive = isPlaying && !!loadedTape && loadedTape.id === tape.id;
        const isMixtape = tape.author === 'mixtape' && !!tape.isInfinite;
        const isPlaylistTape = !!tape.isPlaylist;
        // Mixtape + playlist tracklists are read-only — clicks should fall
        // through to the 3D canvas so users can still drag tapes underneath.
        const tracklistInteractive = interactive && !isMixtape && !isPlaylistTape;
        const headerLabel = isMixtape ? 'mixtape' : isPlaylistTape ? 'playlist' : null;
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
        // Pointer events: mixtapes + playlists always click through (read-only),
        // and the panel itself disables pointer events while the user is
        // dragging a tape (so the click-target is the 3D canvas underneath).
        // In inspect mode the panel must accept pointer events so users can
        // scroll the tracklist (especially on touch devices). During playback
        // we keep the read-only click-through behaviour for mixtape/playlist.
        const panelClickThrough = dragging3D || (!inspectTapeId && (isMixtape || isPlaylistTape));
        const panelGlitchClass = inspectTapeId ? inspectUiClass : (playbackPanelGlitching ? 'ui-glitching-in' : '');
        // Layout: on narrow viewports the panel anchors to the bottom of
        // the screen and goes full-width with edge padding (the tape sits
        // above it in inspect view). On wider viewports it sits in the
        // right half of the screen with the tape on the left.
        // Bottom 60px leaves room for the inspect-mode buttons row (anchored
        // at bottom: 12px, ~36px tall) plus a small gap above it.
        const narrowPanel: React.CSSProperties = inspectTapeId
          ? {
              left: 0, right: 0, bottom: 60,
              width: 'auto', maxHeight: '46vh',
              padding: '16px 16px 12px',
            }
          : {
              // Span from below the song title/author header down to the
              // bottom of the screen — forces the panel to actually extend up
              // (maxHeight alone wouldn't grow a short content list).
              left: 0, right: 0, top: '22vh', bottom: 60,
              width: 'auto',
              // Match the song-name/song-author left edge: their containers
              // have padding-left: 6px, and .padsong inside adds another 32px
              // — total 38px from the screen edge.
              padding: '16px 16px 12px 38px',
            };
        const widePanel: React.CSSProperties = {
          top: '50%', left: 'calc(50% - 70px)', transform: 'translateY(-50%)',
          width: 'min(56vw, 720px)', maxHeight: '70vh',
          padding: '24px 24px 20px',
        };
        return createPortal(
          <div className={`tape-info-panel tape-panel${isNarrow ? ' tape-inspect-narrow-panel' : ' tape-inspect-wide-panel'}${!inspectTapeId ? ' tape-playback-panel' : ''}${panelGlitchClass ? ` ${panelGlitchClass}` : ''}`} style={{
            pointerEvents: panelClickThrough ? 'none' : 'auto', zIndex: 200,
            opacity: dragging3D ? 0 : 1,
            transition: 'opacity 0.2s ease',
          }}>
            {!inspectTapeId && (
              <div className="tape-panel-header">
                {headerLabel && (
                  <div className="tape-panel-label">
                    {headerLabel} /
                  </div>
                )}
                <div className="tape-panel-title">
                  {tape.title || 'Untitled'}
                </div>
              </div>
            )}
            {!hasTracklist && tape.author && (
              <div className="tape-panel-author" style={{
                pointerEvents: interactive ? 'auto' : 'none',
                userSelect: interactive ? 'auto' : 'none',
              }}>
                {tape.author}
              </div>
            )}
            {hasTracklist && (
              <div className="mixtape-track-list-frame">
              <div className="mixtape-track-list" ref={!inspectTapeId ? trackListScrollRef : undefined}>
                {tracklistItems.map((track, i) => {
                  const isCurrent = i === currentIndex && interactive;
                  const clickable = tracklistInteractive && !isMixtape;
                  return (
                    <div
                      key={i}
                      onClick={clickable ? () => handleSelect(i, track) : undefined}
                      className={`tape-track${isCurrent ? ' active' : ''}`}
                      style={{
                        pointerEvents: tracklistInteractive ? 'auto' : 'none',
                        cursor: clickable ? 'pointer' : 'default',
                      }}
                      title={clickable ? `${track.title} — ${track.author}` : undefined}
                    >
                      <div className="tape-track-top">
                        <span className="tape-track-num">{String(i + 1).padStart(2, '0')}</span>
                        <span className="tape-track-title">{track.title}</span>
                      </div>
                      <div className="tape-track-author-row">{track.author}</div>
                    </div>
                  );
                })}
              </div>
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
              y: spawnCY(),
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
              x: spawnCX(),
              y: spawnCY(),
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

