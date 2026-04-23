import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { useLoader, useFrame } from '@react-three/fiber';
import { TABLE_W, TABLE_H, VISUAL_W, VISUAL_H, TILE_W, TILE_H, ACTIVE_W, ACTIVE_H, DRAG_BOUND_X, DRAG_BOUND_Z, TAPE_W, TAPE_H } from './coords';

// Video plane dimensions — 5:3 aspect matching the original 2D canvas (4000×2400)
const VIDEO_H = 30;
const VIDEO_W = VIDEO_H * (4000 / 2400); // ~50

const WALL_HEIGHT = 4;
const WALL_THICKNESS = 0.5;

// Extra-wide surface to cover ultrawide viewports (cosmetic only)
const SURFACE_W = VISUAL_W * 3;
const SURFACE_H = VISUAL_H * 2;

// Debug grid: draw lines at tile boundaries
function DebugGrid() {
  const lines = useMemo(() => {
    const pts: [THREE.Vector3, THREE.Vector3, string][] = [];
    const hw = TABLE_W / 2;
    const hh = TABLE_H / 2;
    const ahw = ACTIVE_W / 2;
    const ahh = ACTIVE_H / 2;
    const dhw = DRAG_BOUND_X;
    const dhh = DRAG_BOUND_Z;
    const y = 0.01;

    // Tile grid lines (yellow)
    for (let x = -hw; x <= hw + 0.01; x += TILE_W) {
      pts.push([new THREE.Vector3(x, y, -hh), new THREE.Vector3(x, y, hh), '#ffff00']);
    }
    for (let z = -hh; z <= hh + 0.01; z += TILE_H) {
      pts.push([new THREE.Vector3(-hw, y, z), new THREE.Vector3(hw, y, z), '#ffff00']);
    }

    // Active area outline (green)
    pts.push([new THREE.Vector3(-ahw, y + 0.01, -ahh), new THREE.Vector3(ahw, y + 0.01, -ahh), '#00ff00']);
    pts.push([new THREE.Vector3(ahw, y + 0.01, -ahh), new THREE.Vector3(ahw, y + 0.01, ahh), '#00ff00']);
    pts.push([new THREE.Vector3(ahw, y + 0.01, ahh), new THREE.Vector3(-ahw, y + 0.01, ahh), '#00ff00']);
    pts.push([new THREE.Vector3(-ahw, y + 0.01, ahh), new THREE.Vector3(-ahw, y + 0.01, -ahh), '#00ff00']);

    // Drag bounds (cyan)
    pts.push([new THREE.Vector3(-dhw, y + 0.02, -dhh), new THREE.Vector3(dhw, y + 0.02, -dhh), '#00ffff']);
    pts.push([new THREE.Vector3(dhw, y + 0.02, -dhh), new THREE.Vector3(dhw, y + 0.02, dhh), '#00ffff']);
    pts.push([new THREE.Vector3(dhw, y + 0.02, dhh), new THREE.Vector3(-dhw, y + 0.02, dhh), '#00ffff']);
    pts.push([new THREE.Vector3(-dhw, y + 0.02, dhh), new THREE.Vector3(-dhw, y + 0.02, -dhh), '#00ffff']);

    return pts;
  }, []);

  return (
    <>
      {lines.map(([a, b, color], i) => {
        const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
        return (
          <lineSegments key={i} geometry={geo}>
            <lineBasicMaterial color={color} />
          </lineSegments>
        );
      })}
    </>
  );
}

interface BgInfo { bgTypeIndex: number; videoEl: HTMLVideoElement | null }

export function TableSurface() {
  const woodTexture = useLoader(THREE.TextureLoader, '/wood-table-alt.jpg');

  // Bridged from public/src/player.js via the `jeem-bg-change` CustomEvent.
  // Indices 0–2 are MP4 modes (vintage/anime/video) — the table renders the
  // active <video> as a VideoTexture so the recorder stays usable for eject.
  // Read synchronously on first render so we don't miss the init-time event.
  const [bgInfo, setBgInfo] = useState<BgInfo>(() => {
    const bg = (window as any).Backgrounds;
    if (!bg) return { bgTypeIndex: -1, videoEl: null };
    const isMedia = typeof bg._isMediaType === 'function' ? bg._isMediaType() : (bg.bgTypeIndex >= 0 && bg.bgTypeIndex <= 2);
    return {
      bgTypeIndex: bg.bgTypeIndex ?? -1,
      videoEl: isMedia ? (bg._activeEl ?? null) : null,
    };
  });

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent).detail as BgInfo | undefined;
      setBgInfo({
        bgTypeIndex: detail?.bgTypeIndex ?? -1,
        videoEl: detail?.videoEl ?? null,
      });
    }
    window.addEventListener('jeem-bg-change', handler);
    return () => window.removeEventListener('jeem-bg-change', handler);
  }, []);

  const isMediaMode = bgInfo.bgTypeIndex >= 0 && bgInfo.bgTypeIndex <= 2;

  // Gate the video plane on the <video> actually having data. At initial load,
  // Backgrounds defaults to index 0 (media) but no src has been set yet, so the
  // video renders as a black rectangle. Only flip to video mode once the
  // element reports readyState >= 2.
  const [hasLoadedVideo, setHasLoadedVideo] = useState(false);
  useEffect(() => {
    const v = bgInfo.videoEl;
    if (!isMediaMode || !v) { setHasLoadedVideo(false); return; }
    const check = () => setHasLoadedVideo(!!v.currentSrc && v.readyState >= 2);
    check();
    v.addEventListener('loadeddata', check);
    v.addEventListener('canplay', check);
    v.addEventListener('emptied', check);
    return () => {
      v.removeEventListener('loadeddata', check);
      v.removeEventListener('canplay', check);
      v.removeEventListener('emptied', check);
    };
  }, [isMediaMode, bgInfo.videoEl]);

  const showVideo = isMediaMode && hasLoadedVideo;

  // Mirror Recorder3D's UI-fade signal so the cast-shadow on the video plane
  // fades in/out with the recorder body instead of snapping on/off.
  const [uiHidden, setUiHidden] = useState(false);
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent).detail as { hidden?: boolean } | undefined;
      setUiHidden(!!detail?.hidden);
    }
    window.addEventListener('jeem-ui-fade', handler);
    return () => window.removeEventListener('jeem-ui-fade', handler);
  }, []);

  const SHADOW_OPACITY = 0.22;
  const shadowMatRef = useRef<THREE.ShadowMaterial | null>(null);
  const shadowOpacityRef = useRef(SHADOW_OPACITY);
  useFrame((_, dt) => {
    const m = shadowMatRef.current;
    if (!m) return;
    const target = uiHidden ? 0 : SHADOW_OPACITY;
    const k = 1 - Math.exp(-dt * 2.5); // matches Recorder3D fade rate
    shadowOpacityRef.current += (target - shadowOpacityRef.current) * k;
    m.opacity = shadowOpacityRef.current;
  });


  const videoTexture = useMemo(() => {
    if (!isMediaMode || !bgInfo.videoEl) return null;
    const tex = new THREE.VideoTexture(bgInfo.videoEl);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.format = THREE.RGBAFormat;
    return tex;
  }, [isMediaMode, bgInfo.videoEl]);

  useEffect(() => {
    return () => { videoTexture?.dispose(); };
  }, [videoTexture]);

  // Force VideoTexture to refresh from the element every frame. Three.js does
  // this automatically in most builds, but explicit needsUpdate is a cheap
  // safety net and guarantees the plane never freezes on a stale frame.
  const texRef = useRef<THREE.VideoTexture | null>(null);
  texRef.current = videoTexture;
  useFrame(() => {
    const tex = texRef.current;
    const v = tex?.image as HTMLVideoElement | undefined;
    if (tex && v && v.readyState >= 2) tex.needsUpdate = true;
  });

  // Keep the video playing. player.js pauses it whenever no tape is playing,
  // which freezes the texture. We force play via multiple triggers and a
  // low-frequency polling fallback so browser quirks can't leave us stuck.
  useEffect(() => {
    const v = bgInfo.videoEl;
    if (!isMediaMode || !v) return;
    v.muted = true;
    (v as any).playsInline = true;
    const kick = () => { v.play().catch(() => {}); };
    kick();
    v.addEventListener('pause', kick);
    v.addEventListener('loadeddata', kick);
    v.addEventListener('canplay', kick);
    const poll = setInterval(() => { if (v.paused) kick(); }, 500);
    return () => {
      v.removeEventListener('pause', kick);
      v.removeEventListener('loadeddata', kick);
      v.removeEventListener('canplay', kick);
      clearInterval(poll);
    };
  }, [isMediaMode, bgInfo.videoEl]);

  const woodMaterial = useMemo(() => {
    woodTexture.wrapS = woodTexture.wrapT = THREE.RepeatWrapping;
    woodTexture.repeat.set(SURFACE_W / TILE_W, SURFACE_H / TILE_H);
    woodTexture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({
      map: woodTexture,
      roughness: 1.0,
      metalness: 0.0,
      color: '#ffffff',
    });
  }, [woodTexture]);

  const videoMaterial = useMemo(() => {
    if (!videoTexture) return null;
    return new THREE.MeshBasicMaterial({ map: videoTexture, toneMapped: false });
  }, [videoTexture]);


  // CRT overlay texture — scanlines + chromatic stripes + vignette. Drawn once
  // to a canvas and mapped onto a plane the same size as the video. Sits just
  // above the video (y=0.03) but well below tapes/recorder so it reads as
  // behind the 3D objects.
  const crtMaterial = useMemo(() => {
    // 2× resolution vs the old 1000×600 so the scanline + stripe pitch is
    // half as wide on-screen — reads as finer "pixels" instead of chunky bars.
    const cw = 2000;
    const ch = 1200;
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d')!;

    // Vertical chromatic stripes — 1px R / 1px G / 1px B cycle. Alphas bumped
    // so they survive the plane's downsampling on screen.
    for (let x = 0; x < cw; x += 3) {
      ctx.fillStyle = 'rgba(255,0,0,0.07)';
      ctx.fillRect(x, 0, 1, ch);
      ctx.fillStyle = 'rgba(0,255,0,0.03)';
      ctx.fillRect(x + 1, 0, 1, ch);
      ctx.fillStyle = 'rgba(0,0,255,0.07)';
      ctx.fillRect(x + 2, 0, 1, ch);
    }

    // Radial vignette — a little stronger than the last pass but still softer
    // than the original.
    const grad = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.25, cw / 2, ch / 2, Math.max(cw, ch) * 0.7);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cw, ch);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    // Nearest-neighbour keeps the 1px scanlines/stripes crisp instead of
    // getting smeared to invisible by bilinear filtering when the plane is
    // rendered at a smaller on-screen size than the 2000×1200 source.
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    return new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  }, []);

  return (
    <group>
      {/* Table surface — static rigid body, always wood */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[SURFACE_W / 2, 0.5, SURFACE_H / 2]} position={[0, -0.5, 0]} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[SURFACE_W, SURFACE_H]} />
          <primitive object={woodMaterial} attach="material" />
        </mesh>
      </RigidBody>

      {/* Edge walls — invisible colliders inside active area */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[ACTIVE_W / 2, WALL_HEIGHT / 2, WALL_THICKNESS / 2]} position={[0, WALL_HEIGHT / 2, -(ACTIVE_H / 2)]} />
        <CuboidCollider args={[ACTIVE_W / 2, WALL_HEIGHT / 2, WALL_THICKNESS / 2]} position={[0, WALL_HEIGHT / 2, (ACTIVE_H / 2 + TILE_H / 2)]} />
        <CuboidCollider args={[WALL_THICKNESS / 2, WALL_HEIGHT / 2, ACTIVE_H / 2 + TILE_H]} position={[-(ACTIVE_W / 2 + TILE_W / 2), WALL_HEIGHT / 2, 0]} />
        <CuboidCollider args={[WALL_THICKNESS / 2, WALL_HEIGHT / 2, ACTIVE_H / 2 + TILE_H]} position={[(ACTIVE_W / 2 + TILE_W / 2), WALL_HEIGHT / 2, 0]} />
      </RigidBody>

      {/* Dark overlay — dims the wood in non-video modes (and before a video
          has actually loaded, to avoid a black canvas flash at initial load). */}
      {!showVideo && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
          <planeGeometry args={[SURFACE_W, SURFACE_H]} />
          <meshStandardMaterial color="#000000" transparent opacity={0.45} roughness={1} metalness={0} />
        </mesh>
      )}

      {/* Video screen — 5:3 aspect matches the original 2D canvas.
          renderOrder=-1 ensures it renders behind other objects. */}
      {showVideo && videoMaterial && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
            <planeGeometry args={[VIDEO_W, VIDEO_H]} />
            <primitive object={videoMaterial} attach="material" />
          </mesh>
          {/* Shadow-only catcher — MeshBasicMaterial on the video can't receive
              shadows, so overlay a transparent ShadowMaterial plane to draw the
              recorder's cast shadow on top of the video. */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.105, 0]} receiveShadow>
            <planeGeometry args={[VIDEO_W, VIDEO_H]} />
            <shadowMaterial ref={shadowMatRef} transparent opacity={SHADOW_OPACITY} />
          </mesh>
          {/* CRT overlay — above the video plane but physically below tapes /
              recorder, so scanlines + vignette read as behind the 3D objects. */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.11, 0]}>
            <planeGeometry args={[VIDEO_W, VIDEO_H]} />
            <primitive object={crtMaterial} attach="material" />
          </mesh>
        </>
      )}

      {/* <DebugGrid /> */}
    </group>
  );
}
