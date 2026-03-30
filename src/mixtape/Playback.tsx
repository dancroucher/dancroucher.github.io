import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { MixtapeTape3D } from './Tape';
import { TrackList, type Track } from './TrackList';

// ── Simple table surface ──
function TableSurface() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.01, 0]}>
      <planeGeometry args={[120, 80]} />
      <meshStandardMaterial color="#1a0f05" roughness={0.95} />
    </mesh>
  );
}

// ── The draggable mixtape tape in 3D ──
function MixtapeTape({
  position,
  dragging,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  position: [number, number, number];
  dragging: boolean;
  onDragStart: () => void;
  onDragMove: (x: number, z: number) => void;
  onDragEnd: (droppedOnDeck: boolean) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const dragActive = useRef(false);
  const dragWorldPos = useRef(new THREE.Vector3(...position));

  // Hover animation
  useFrame((state) => {
    if (!groupRef.current) return;
    if (dragActive.current) {
      groupRef.current.position.copy(dragWorldPos.current);
      groupRef.current.position.y = position[1];
    } else {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.3) * 0.06 + 0.15;
      groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 0.5) * 0.04;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* Invisible hit area — full tape bounding box */}
      <mesh
        visible={false}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          dragActive.current = true;
          dragWorldPos.current.copy(e.point);
          onDragStart();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          if (!dragActive.current) return;
          e.stopPropagation();
          dragWorldPos.current.copy(e.point);
          onDragMove(e.point.x, e.point.z);
        }}
        onPointerUp={(e: ThreeEvent<PointerEvent>) => {
          if (!dragActive.current) return;
          dragActive.current = false;
          (e.target as HTMLElement).releasePointerCapture(e.pointerId);
          const droppedOnDeck = e.point.x > 5;
          onDragEnd(droppedOnDeck);
        }}
      >
        <boxGeometry args={[3.4, 1.0, 2.2]} />
      </mesh>
      {/* Visual tape body */}
      <mesh castShadow>
        <boxGeometry args={[3.2, 0.4, 2.0]} />
        <meshStandardMaterial color="#2a1e0e" roughness={0.85} metalness={0.05} />
      </mesh>
    </group>
  );
}

// ── Deck zone visual ──
function DeckZone({ visible }: { visible: boolean }) {
  return (
    <>
      <mesh position={[12, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, 6]} />
        <meshStandardMaterial
          color={visible ? '#2a1a0a' : '#141008'}
          roughness={0.95}
          transparent
          opacity={visible ? 0.9 : 0.4}
        />
      </mesh>
      <pointLight position={[12, 3, 0]} intensity={visible ? 0.8 : 0.2} color="#c9a84c" />
    </>
  );
}

// ── Scene ──
function Scene({
  tapePos,
  onDropOnDeck,
  dragging,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  tapePos: [number, number, number];
  onDropOnDeck: () => void;
  dragging: boolean;
  onDragStart: () => void;
  onDragMove: (x: number, z: number) => void;
  onDragEnd: (droppedOnDeck: boolean) => void;
}) {
  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight position={[10, 20, 10]} intensity={1.4} castShadow />
      <pointLight position={[-8, 5, -5]} intensity={0.5} color="#ffeedd" />
      <TableSurface />
      <DeckZone visible={dragging} />
      <MixtapeTape
        position={tapePos}
        dragging={dragging}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
      />
    </>
  );
}

interface PlaybackProps {
  name: string;
  description: string;
  tracks: Track[];
  autoplay?: boolean;
}

export function MixtapePlayback({ name, description, tracks, autoplay = false }: PlaybackProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(autoplay);
  const [dragging, setDragging] = useState(false);
  const deckRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const ytReady = useRef(false);
  const currentTrack = tracks[currentIndex];
  const tapePos: [number, number, number] = [-8, 0.5, 0];

  const handleDragStart = useCallback(() => setDragging(true), []);
  const handleDragMove = useCallback(() => {}, []);
  const handleDropOnDeck = useCallback(() => {
    setPlaying(true);
    setCurrentIndex(0);
  }, []);
  const handleDragEnd = useCallback((droppedOnDeck: boolean) => {
    setDragging(false);
    if (droppedOnDeck) handleDropOnDeck();
  }, [handleDropOnDeck]);

  useEffect(() => {
    if (window.YT?.Player) { ytReady.current = true; return; }
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
    window.onYouTubeIframeAPIReady = () => { ytReady.current = true; };
  }, []);

  // Start/load YT player
  useEffect(() => {
    if (!playing || !ytReady.current || !deckRef.current) return;
    const videoId = tracks[currentIndex]?.videoId;
    if (!videoId) return;

    if (!playerRef.current) {
      playerRef.current = new window.YT.Player(deckRef.current, {
        height: '100%',
        width: '100%',
        videoId,
        playerVars: { autoplay: 1, controls: 1 },
        events: {
          onStateChange: (e: any) => {
            if (e.data === window.YT.PlayerState.ENDED) {
              const next = currentIndex + 1;
              if (next < tracks.length) setCurrentIndex(next);
            }
            setPlaying(e.data === window.YT.PlayerState.PLAYING);
          },
        },
      });
    } else {
      playerRef.current.loadVideoById(videoId);
    }
  }, [playing, currentIndex, tracks]);

  const handleTrackSelect = useCallback((i: number) => {
    setCurrentIndex(i);
    if (!playing) setPlaying(true);
  }, [playing]);

  const handleShare = useCallback(() => {
    const tapeId = new URLSearchParams(window.location.search).get('tape');
    const url = `${window.location.origin}${window.location.pathname}?tape=${tapeId}`;
    navigator.clipboard.writeText(url).catch(() => {});
    alert('Link copied!');
  }, []);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.meta}>
          <h1 style={styles.title}>{name}</h1>
          {description && <p style={styles.desc}>{description}</p>}
        </div>
        <button style={styles.shareBtn} onClick={handleShare}>Share</button>
      </div>

      {/* Main */}
      <div style={styles.main}>
        {/* Left: 3D table + deck */}
        <div style={styles.tableSide}>
          {/* 3D Canvas */}
          <div style={styles.canvasWrap}>
            <Canvas
              camera={{ position: [0, 22, 18], fov: 45 }}
              shadows
              style={{ width: '100%', height: '100%', cursor: playing ? 'default' : 'grab' }}
            >
              <Scene
                tapePos={tapePos}
                onDropOnDeck={handleDropOnDeck}
                dragging={dragging}
                onDragStart={handleDragStart}
                onDragMove={handleDragMove}
                onDragEnd={handleDragEnd}
              />
            </Canvas>

            {/* Tape name label */}
            <div style={styles.tapeLabel}>
              <span style={styles.tapeLabelTitle}>{name}</span>
              <span style={styles.tapeLabelSub}>{tracks.length} tracks</span>
            </div>

            {/* Hint */}
            {!playing && (
              <div style={styles.hint}>drag tape to deck →</div>
            )}
          </div>

          {/* Deck player zone */}
          <div
            ref={deckRef}
            style={{
              ...styles.deck,
              opacity: playing ? 1 : 0.6,
              borderColor: dragging ? 'rgba(74,222,128,0.5)' : 'rgba(201,168,76,0.15)',
            }}
          >
            {!playing ? (
              <div style={styles.deckEmpty}>
                <div style={styles.deckIcon}>▶</div>
                <span style={styles.deckText}>drop tape here</span>
              </div>
            ) : (
              <div style={styles.playerEmbed} />
            )}
          </div>
        </div>

        {/* Right: tracklist */}
        <div style={styles.trackListArea}>
          {playing && currentTrack && (
            <div style={styles.nowPlaying}>
              <span style={styles.nowPlayingLabel}>▶ Now playing</span>
              <span style={styles.nowPlayingTitle}>{currentTrack.title}</span>
            </div>
          )}
          <TrackList
            tracks={tracks}
            currentIndex={currentIndex}
            onSelect={handleTrackSelect}
          />
        </div>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | null;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed', inset: 0, zIndex: 100,
    background: 'rgba(10,8,5,0.97)',
    display: 'flex', flexDirection: 'column',
    fontFamily: "'Patrick Hand', cursive",
    color: '#e8d5b0',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 16,
    padding: '16px 24px',
    borderBottom: '1px solid rgba(201,168,76,0.2)',
  },
  meta: { flex: 1, overflow: 'hidden' },
  title: {
    fontFamily: "'Lacquer', cursive",
    fontSize: 20, color: '#c9a84c', margin: 0,
    letterSpacing: 1,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  desc: {
    fontSize: 13, color: 'rgba(232,213,176,0.5)', margin: '4px 0 0',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  shareBtn: {
    padding: '6px 16px',
    background: 'linear-gradient(135deg, #8a5a20, #c9a84c)',
    border: 'none', borderRadius: 4, color: '#0a0805',
    fontFamily: "'Patrick Hand', cursive", fontSize: 14,
    cursor: 'pointer', flexShrink: 0,
  },
  main: { flex: 1, display: 'flex', overflow: 'hidden' },
  tableSide: {
    flex: '0 0 60%',
    display: 'flex', flexDirection: 'column',
    borderRight: '1px solid rgba(201,168,76,0.1)',
  },
  canvasWrap: {
    flex: 1, position: 'relative', overflow: 'hidden',
  },
  tapeLabel: {
    position: 'absolute',
    bottom: 12, left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(10,8,5,0.85)',
    border: '1px solid rgba(201,168,76,0.4)',
    borderRadius: 4, padding: '6px 16px',
    textAlign: 'center', pointerEvents: 'none',
  },
  tapeLabelTitle: {
    display: 'block', fontSize: 13, color: '#c9a84c',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200,
  },
  tapeLabelSub: {
    display: 'block', fontSize: 10, color: 'rgba(201,168,76,0.5)', marginTop: 2,
  },
  hint: {
    position: 'absolute', top: 12, right: 16,
    fontSize: 12, color: 'rgba(201,168,76,0.4)', letterSpacing: 0.5,
  },
  deck: {
    height: 160,
    borderTop: '2px solid',
    background: 'rgba(10,8,5,0.95)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'opacity 0.3s, border-color 0.2s',
  },
  deckEmpty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
  },
  deckIcon: { fontSize: 24, color: 'rgba(201,168,76,0.2)' },
  deckText: { fontSize: 12, color: 'rgba(201,168,76,0.3)', letterSpacing: 1 },
  playerEmbed: { width: '100%', height: '100%' },
  trackListArea: {
    flex: '0 0 40%',
    overflowY: 'auto' as const,
    padding: '16px 16px 16px 12px',
    display: 'flex', flexDirection: 'column',
  },
  nowPlaying: {
    display: 'flex', flexDirection: 'column', gap: 4,
    marginBottom: 12, padding: '8px 12px',
    background: 'rgba(201,168,76,0.05)', borderRadius: 4,
  },
  nowPlayingLabel: {
    fontSize: 10, color: 'rgba(201,168,76,0.5)',
    textTransform: 'uppercase' as const, letterSpacing: 1,
  },
  nowPlayingTitle: {
    fontSize: 13, color: '#e8d5b0',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
  },
};
