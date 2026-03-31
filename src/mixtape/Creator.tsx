import React, { useState, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import type { Tape } from '../tapes/types';
import { stampTitle } from '../tapes/TapeBody';

interface Track {
  videoId: string;
  title: string;
  author: string;
  duration: number;
  durationText: string;
}

interface CreatorProps {
  onBack: () => void;
  onPlay: (tape: { name: string; description: string; tracks: Track[] }) => void;
}

const TEX_BASE = '/assets/cassette/';
const TAPE_W = 14;
const TAPE_H = 0.7;
const TAPE_D = 9;

// ── 3D Cassette rendered with plain Three.js ──────────────────────────────────
function MixtapeTape3D({ name }: { name: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    animId: number;
    tape: THREE.Group;
  } | null>(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    // ── Renderer ──────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    // ── Scene ─────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = null; // transparent

    // ── Camera ────────────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 1000);
    camera.position.set(0, 16, 18);
    camera.lookAt(0, 0, 0);

    // ── Lighting ──────────────────────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.2);
    dirLight.position.set(8, 14, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x8899cc, 0.4);
    fillLight.position.set(-6, 4, -8);
    scene.add(fillLight);

    // ── Simple table surface ──────────────────────────────────────────────────
    const tableGeo = new THREE.PlaneGeometry(80, 80);
    const tableMat = new THREE.MeshStandardMaterial({ color: 0x1a0f08, roughness: 0.9, metalness: 0.0 });
    const table = new THREE.Mesh(tableGeo, tableMat);
    table.rotation.x = -Math.PI / 2;
    table.position.y = -TAPE_H / 2 - 0.01;
    table.receiveShadow = true;
    scene.add(table);

    // ── Load FBX + textures ───────────────────────────────────────────────────
    let disposed = false;

    (async () => {
      // Load base texture for stamping
      const texLoader = new THREE.TextureLoader();
      const baseTex = await new Promise<THREE.Texture>((resolve, reject) => {
        texLoader.load(`${TEX_BASE}audio_cassette_a_base.png`, resolve, undefined, reject);
      });

      const mixtapeTape: Tape = {
        id: '__jeem_mixtape__',
        videoId: '',
        isPlaylist: false,
        isInfinite: true,
        title: name || 'Mixtape',
        author: 'mixtape',
        tapeStyle: 0,
        textureVariant: 'a',
        progress: 0,
        timestamp: Date.now(),
        x: 0, y: 0, angle: 0,
        infiniteHistory: [],
        infiniteIndex: 0,
        infiniteConfig: {} as any,
      };

      const stampedTex = stampTitle(baseTex, name || 'Mixtape', 'a', mixtapeTape);

      // Load FBX
      const fbxLoader = new FBXLoader();
      const fbx = await new Promise<THREE.Group>((resolve, reject) => {
        fbxLoader.load(`${TEX_BASE}audio_cassettes.fbx`, resolve, undefined, reject);
      });

      if (disposed) return;

      // Find body mesh and apply stamped texture
      let bodyMesh: THREE.Mesh | null = null;
      fbx.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh && mesh.name === 'Cube') {
          bodyMesh = mesh;
        }
      });

      if (bodyMesh) {
        bodyMesh.material = new THREE.MeshStandardMaterial({
          map: stampedTex,
          roughness: 0.5,
          metalness: 0.1,
        });
        bodyMesh.castShadow = true;
        bodyMesh.receiveShadow = true;
      }

      // Position tape
      const tape = fbx;
      tape.position.set(0, TAPE_H / 2, 0);
      scene.add(tape);

      // ── Animate ─────────────────────────────────────────────────────────────
      const clock = new THREE.Clock();
      function animate() {
        if (disposed) return;
        animId = requestAnimationFrame(animate);
        const t = clock.getElapsedTime();
        // Slow gentle rotation so user sees the 3D shape
        tape.rotation.y = Math.sin(t * 0.3) * 0.15;
        renderer.render(scene, camera);
      }
      animate();

      sceneRef.current = { renderer, scene, camera, animId: 0, tape };
    })();

    // ── Resize observer ───────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      if (!el) return;
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    });
    ro.observe(el);

    return () => {
      disposed = true;
      ro.disconnect();
      if (sceneRef.current) {
        cancelAnimationFrame(sceneRef.current.animId);
        sceneRef.current.renderer.dispose();
        el.removeChild(sceneRef.current.renderer.domElement);
        sceneRef.current = null;
      } else {
        cancelAnimationFrame(sceneRef.current?.animId ?? 0);
        renderer.dispose();
        if (renderer.domElement.parentNode === el) el.removeChild(renderer.domElement);
      }
    };
  }, [name]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
}

// ── Fake mixtape tape for step 1 label ───────────────────────────────────────
function makeMixtapeTape(name: string, tracks: Track[]): Tape {
  return {
    id: '__jeem_mixtape__',
    videoId: tracks[0]?.videoId || '',
    isPlaylist: false,
    isInfinite: true,
    title: name || 'Mixtape',
    author: 'mixtape',
    tapeStyle: 0,
    textureVariant: 'a',
    progress: 0,
    timestamp: Date.now(),
    x: 0, y: 0, angle: 0,
    infiniteHistory: tracks.map(t => ({ videoId: t.videoId, title: t.title, author: t.author })),
    infiniteIndex: 0,
    infiniteConfig: { source: 'youtube', type: 'artist', value: name } as any,
  };
}

export function MixtapeCreator({ onBack, onPlay }: CreatorProps) {
  const [url, setUrl] = useState('');
  const [keywords, setKeywords] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [seedTitle, setSeedTitle] = useState('');

  const handleGenerate = useCallback(async () => {
    if (!url.trim() && !keywords.trim()) {
      setError('Enter a YouTube URL or some keywords');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/mixtape/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), keywords: keywords.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setTracks(data.tracks || []);
      setSeedTitle(data.seedTitle || 'Mixtape');
    } catch (e: any) {
      setError(e.message || 'Failed to generate mixtape');
    } finally {
      setLoading(false);
    }
  }, [url, keywords]);

  const canSave = name.trim().length > 0;

  const handleSave = useCallback(() => {
    if (!name.trim()) return;
    const tape = { name: name.trim(), description: '', tracks };
    onPlay(tape);
  }, [name, tracks, onPlay]);

  const handleRegenerate = useCallback(() => {
    setTracks([]);
    setName('');
    setError('');
  }, []);

  const mixtapeTape = makeMixtapeTape(name || seedTitle || 'Mixtape', tracks);

  return (
    <div style={styles.overlay}>
      {/* ── Step 1: URL / Keywords input ── */}
      {!tracks.length && (
        <div style={styles.inputModal}>
          <p style={styles.modalSubtitle}>Enter a YouTube URL or keywords to generate a 16-track mixtape</p>
          <div style={styles.inputGroup}>
            <input
              style={styles.input}
              type="text"
              placeholder="YouTube URL"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGenerate()}
              disabled={loading}
            />
            <span style={styles.or}>or</span>
            <input
              style={styles.input}
              type="text"
              placeholder="Keywords (e.g. 80s synthwave)"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGenerate()}
              disabled={loading}
            />
          </div>
          {error && <p style={styles.error}>{error}</p>}
          <button
            style={{ ...styles.generateBtn, ...(loading ? styles.generateBtnDisabled : {}) }}
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? 'Generating...' : 'Generate Mixtape'}
          </button>
        </div>
      )}

      {/* ── Step 2: tracklist (tape is visible on table behind) ── */}
      {tracks.length > 0 && (
        <div style={styles.creator}>
          <div style={styles.trackSide}>
            {/* Name input — blank until saved */}
            <input
              style={styles.nameInput}
              type="text"
              placeholder="Mixtape name..."
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && canSave && handleSave()}
              maxLength={60}
            />

            {/* Track count */}
            <p style={styles.trackCount}>{tracks.length} tracks — generated from "{seedTitle}"</p>

            {/* Track list — show all 16 */}
            <div style={styles.trackList}>
              {tracks.map((track, i) => (
                <div key={i} style={styles.trackRow}>
                  <span style={styles.trackNum}>{String(i + 1).padStart(2, '0')}.</span>
                  <span style={styles.trackTitle}>{track.title || 'Untitled'}</span>
                  <span style={styles.trackAuthor}>{track.author}</span>
                  <span style={styles.trackDuration}>{track.durationText || ''}</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            {error && <p style={styles.error}>{error}</p>}
            <div style={styles.actions}>
              <button style={styles.regenerateBtn} onClick={handleRegenerate} disabled={loading}>
                ← Back
              </button>
              <button
                style={{ ...styles.saveBtn, ...((loading || !canSave) ? styles.saveBtnDisabled : {}) }}
                onClick={handleSave}
                disabled={loading || !canSave}
              >
                {loading ? 'Saving...' : !canSave ? 'Name required' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Shared panel geometry — used by both Creator and playback tracklist overlay
export const MIXTAPE_PANEL_STYLES = {
  // Position: fixed to right side, shifted left so tape is visible
  position: 'fixed' as const,
  top: 130,
  right: 110,
  width: 590,
  maxHeight: 'calc(100vh - 120px)',
  fontFamily: "'04b03', monospace",
  fontSize: '1em',
  color: '#e8d5b0',
  background: 'transparent',
  pointerEvents: 'auto' as const,
  zIndex: 200,
  display: 'flex' as const,
  flexDirection: 'column' as const,
  overflow: 'hidden' as const,
  border: '1px solid rgba(201,168,76,0.2)',
  borderRadius: 12,
};

export const MIXTAPE_TRACK_ROW: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '6px 4px',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
  fontSize: '1em',
  fontFamily: "'04b03', monospace",
};

export const MIXTAPE_TRACK_NUM: React.CSSProperties = {
  fontFamily: "'04b03', monospace",
  color: 'rgba(201,168,76,0.5)', width: 30, flexShrink: 0,
  textAlign: 'right', fontSize: '1em',
};

export const MIXTAPE_TRACK_TITLE: React.CSSProperties = {
  fontFamily: "'04b03', monospace",
  flex: 1, color: '#e8d5b0', overflow: 'hidden',
  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  minWidth: 0, fontSize: '1em',
};

export const MIXTAPE_TRACK_AUTHOR: React.CSSProperties = {
  fontFamily: "'04b03', monospace",
  color: 'rgba(232,213,176,0.45)', flexShrink: 0,
  width: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  fontSize: '1em',
};

export const MIXTAPE_TRACK_DURATION: React.CSSProperties = {
  fontFamily: "'04b03', monospace",
  color: 'rgba(201,168,76,0.4)', flexShrink: 0,
  width: 50, textAlign: 'right', fontSize: '1em',
};

export const MIXTAPE_TRACK_LIST: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  background: 'transparent',
  borderRadius: 6,
  padding: '10px 14px',
  minHeight: 0,
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'transparent',
    pointerEvents: 'none',
  },
  inputModal: {
    ...MIXTAPE_PANEL_STYLES,
    top: '50%',
    transform: 'translateY(-50%)',
    maxHeight: undefined,
    padding: '32px 40px',
    gap: 16,
    alignItems: 'center',
  },
  modalSubtitle: {
    fontFamily: "'04b03', monospace",
    fontSize: '1em', color: 'rgba(232,213,176,0.55)',
    textAlign: 'center', margin: 0,
  },
  inputGroup: {
    width: '100%', display: 'flex', flexDirection: 'column', gap: 10,
  },
  input: {
    width: '100%', padding: '10px 14px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(201,168,76,0.3)',
    borderRadius: 6, color: '#e8d5b0', fontSize: '1em',
    fontFamily: "'04b03', monospace",
    outline: 'none', boxSizing: 'border-box',
  },
  or: {
    textAlign: 'center', color: 'rgba(201,168,76,0.4)', fontSize: '1em',
    fontFamily: "'04b03', monospace",
  },
  error: {
    fontFamily: "'04b03', monospace",
    color: '#ff6b6b', fontSize: '1em', margin: 0,
  },
  generateBtn: {
    padding: '10px 28px',
    background: 'linear-gradient(135deg, #8a5a20, #c9a84c)',
    border: 'none', borderRadius: 6, color: '#0a0805',
    fontFamily: "'04b03', monospace", fontSize: '1em', letterSpacing: 1,
    cursor: 'pointer',
  },
  generateBtnDisabled: {
    opacity: 0.6, cursor: 'not-allowed',
  },
  creator: {
    ...MIXTAPE_PANEL_STYLES,
  },
  trackSide: {
    flex: 1,
    padding: '24px 24px 20px',
    display: 'flex', flexDirection: 'column', gap: 0,
    overflow: 'hidden',
    minWidth: 0,
    background: 'transparent',
  },
  nameInput: {
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(201,168,76,0.4)',
    borderRadius: 6, color: '#e8d5b0', fontSize: '1em',
    fontFamily: "'04b03', monospace", letterSpacing: 0.5,
    outline: 'none', width: '100%', boxSizing: 'border-box', marginBottom: 12,
  },
  trackCount: {
    fontFamily: "'04b03', monospace",
    fontSize: '1em', color: 'rgba(201,168,76,0.4)', margin: '0 0 8px',
    letterSpacing: '0.05em',
  },
  trackList: MIXTAPE_TRACK_LIST,
  trackRow: MIXTAPE_TRACK_ROW,
  trackNum: MIXTAPE_TRACK_NUM,
  trackTitle: MIXTAPE_TRACK_TITLE,
  trackAuthor: MIXTAPE_TRACK_AUTHOR,
  trackDuration: MIXTAPE_TRACK_DURATION,
  actions: {
    display: 'flex', gap: 10, justifyContent: 'space-between',
    marginTop: 14,
  },
  regenerateBtn: {
    padding: '10px 20px',
    background: 'transparent',
    border: '1px solid rgba(201,168,76,0.4)',
    borderRadius: 6, color: '#c9a84c',
    fontFamily: "'04b03', monospace", fontSize: '1em',
    cursor: 'pointer',
  },
  saveBtn: {
    padding: '10px 28px',
    background: 'linear-gradient(135deg, #8a5a20, #c9a84c)',
    border: 'none', borderRadius: 6, color: '#0a0805',
    fontFamily: "'04b03', monospace", fontSize: '1em', letterSpacing: 1,
    cursor: 'pointer',
    flex: 1,
  },
  saveBtnDisabled: {
    opacity: 0.6, cursor: 'not-allowed',
  },
};
