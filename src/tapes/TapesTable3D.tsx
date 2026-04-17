import React, { Suspense, useCallback, useRef, useEffect, useMemo, useState, forwardRef, useImperativeHandle } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { MapControls, Stats } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { Tape } from './types';
import { TableSurface } from './TableSurface';
import { TapeBody } from './TapeBody';
import { Recorder3D } from './Recorder3D';
import { to2D, DRAG_HEIGHT, CAM_BOUND_X, CAM_BOUND_Z, DRAG_BOUND_X, DRAG_BOUND_Z, TAPE_W, TAPE_H } from './coords';

// Matches DragState in coords.ts — inlined to avoid bundler issues
interface DragState {
  tapeId: string | null;
  targetX: number;
  targetZ: number;
  targetYaw?: number | null;
}

// Recorder placement — kept in sync with the <Recorder3D> props below.
const RECORDER_POS: [number, number, number] = [-18, 0, 8];
const RECORDER_ROT_Y = Math.PI / 6;
// Half-extents of the recorder *hover trigger* zone in local axes. Larger than
// the physical footprint so the lid pops open before the tape is right on top.
const RECORDER_HALF_W = 13;
const RECORDER_HALF_D = 8;

export interface TapesTable3DHandle {
  startDrag: (tapeId: string) => void;
}

interface TapesTable3DProps {
  tapes: Tape[];
  loadedTapeId: string | null;
  onDragStart: () => void;
  onDragEnd: (tapeId: string, x2d: number, y2d: number, droppedOnDeck: boolean) => void;
  onDoubleTap: (tapeId: string) => void;
  onMenuAction: (tapeId: string, action: 'link' | 'rewind' | 'remove') => void;
  menuId: string | null;
  onClearMenu: () => void;
  newTapeIds: Set<string>;
  externalDrag?: DragState; // shared mutable object for external drag initiation
  lockedTapeId?: string | null;
  lockCamera?: boolean;
  maxDragX?: number;
}

function SceneContents({
  tapes, loadedTapeId, onDragStart, onDragEnd, onDoubleTap, onMenuAction, menuId, onClearMenu, newTapeIds, externalDrag, lockedTapeId, lockCamera, maxDragX,
}: TapesTable3DProps) {
  const { camera, gl, scene } = useThree();
  const controlsRef = useRef<any>(null);

  // Mutable drag state — no React re-renders during drag
  const drag = useMemo<DragState>(() => ({ tapeId: null, targetX: 0, targetZ: 0, targetYaw: null }), []);
  const bounceTapeId = useRef<string | null>(null);

  // Open the recorder lid while a dragged tape hovers over its footprint.
  const [tapeOverRecorder, setTapeOverRecorder] = useState(false);
  useFrame(() => {
    let isOver = false;
    if (drag.tapeId) {
      // Transform drag target into the recorder's local frame (inverse Y rotation),
      // then axis-align against its half-extents.
      const dx = drag.targetX - RECORDER_POS[0];
      const dz = drag.targetZ - RECORDER_POS[2];
      const cos = Math.cos(-RECORDER_ROT_Y);
      const sin = Math.sin(-RECORDER_ROT_Y);
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      isOver = Math.abs(lx) < RECORDER_HALF_W && Math.abs(lz) < RECORDER_HALF_D;
    }
    // Publish snap-yaw so TapeBody's per-frame rotation matches the recorder.
    // Add π so the opposite cassette edge faces the recorder slot (flip around Y).
    drag.targetYaw = isOver ? RECORDER_ROT_Y + Math.PI : null;
    if (isOver !== tapeOverRecorder) setTapeOverRecorder(isOver);
  });

  const pointerState = useRef({
    downTapeId: null as string | null,
    active: false,
    startX: 0,
    startY: 0,
    offsetX: 0,  // offset from pointer to tape center
    offsetZ: 0,
  });

  const lastTapRef = useRef<{ time: number; id: string }>({ time: 0, id: '' });

  const tableTapes = tapes.filter(t => t.id !== loadedTapeId);

  const raycastToPlane = useCallback((clientX: number, clientY: number, planeY: number): THREE.Vector3 | null => {
    const rect = gl.domElement.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const hit = new THREE.Vector3();
    return raycaster.ray.intersectPlane(plane, hit) ? hit : null;
  }, [camera, gl]);

  // Hit test: raycast to table plane, find nearest tape within its bounding box
  const raycastTape = useCallback((clientX: number, clientY: number): string | null => {
    const hit = raycastToPlane(clientX, clientY, 0);
    if (!hit) return null;

    let bestId: string | null = null;
    let bestDist = Infinity;
    const HALF_W = TAPE_W / 2;
    const HALF_H = TAPE_H / 2;

    scene.traverse((obj) => {
      if (!obj.name?.startsWith('tape-')) return;
      const world = new THREE.Vector3();
      obj.getWorldPosition(world);
      const dx = Math.abs(hit.x - world.x);
      const dz = Math.abs(hit.z - world.z);
      if (dx < HALF_W + 0.1 && dz < HALF_H + 0.1) {
        const dist = dx + dz;
        if (dist < bestDist) {
          bestDist = dist;
          bestId = obj.name.replace('tape-', '');
        }
      }
    });
    return bestId;
  }, [scene, raycastToPlane]);

  const getTapeWorldPos = useCallback((tapeId: string): { x: number; z: number } | null => {
    let result: { x: number; z: number } | null = null;
    scene.traverse((obj) => {
      if (obj.name === `tape-${tapeId}`) {
        const world = new THREE.Vector3();
        obj.getWorldPosition(world);
        result = { x: world.x, z: world.z };
      }
    });
    return result;
  }, [scene]);

  const isDeckDrop = useCallback((screenX: number, screenY: number) => {
    const deckEl = document.getElementById('tape-deck');
    if (!deckEl) return false;
    const r = deckEl.getBoundingClientRect();
    // Expand hit zone by 30px in each direction for easier drops
    const pad = 30;
    const hit = screenX >= r.left - pad && screenX <= r.right + pad && screenY >= r.top - pad && screenY <= r.bottom + pad;
    console.log('[TapeTable] deck drop check:', hit, 'pointer:', screenX, screenY, 'deck:', r.left, r.top, r.right, r.bottom);
    return hit;
  }, []);

  useEffect(() => {
    const el = gl.domElement;

    function onDown(ev: PointerEvent) {
      const tapeId = raycastTape(ev.clientX, ev.clientY);
      console.log('[TapeTable] pointerdown hit:', tapeId, 'at', ev.clientX, ev.clientY);
      if (!tapeId) {
        onClearMenu();
        return;
      }
      if (lockedTapeId && tapeId === lockedTapeId) return;
      const ps = pointerState.current;
      ps.downTapeId = tapeId;
      ps.active = false;
      ps.startX = ev.clientX;
      ps.startY = ev.clientY;

      const tapePos = getTapeWorldPos(tapeId);
      if (tapePos) {
        drag.targetX = tapePos.x;
        drag.targetZ = tapePos.z;
      }
    }

    function onMove(ev: PointerEvent) {
      const ps = pointerState.current;
      if (!ps.downTapeId) return;

      if (!ps.active) {
        const dx = ev.clientX - ps.startX;
        const dy = ev.clientY - ps.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 5) return;

        // Start drag — compute offset so tape doesn't snap to pointer
        ps.active = true;
        const hit = raycastToPlane(ev.clientX, ev.clientY, DRAG_HEIGHT);
        if (hit) {
          ps.offsetX = drag.targetX - hit.x;
          ps.offsetZ = drag.targetZ - hit.z;
        }
        drag.tapeId = ps.downTapeId;
        if (controlsRef.current) controlsRef.current.enabled = false;
        onDragStart();
      }

      // Update target — tape follows pointer with offset, clamped to bounds
      const hit = raycastToPlane(ev.clientX, ev.clientY, DRAG_HEIGHT);
      if (hit) {
        const boundX = maxDragX != null ? maxDragX : DRAG_BOUND_X;
        drag.targetX = Math.max(-DRAG_BOUND_X, Math.min(boundX, hit.x + ps.offsetX));
        drag.targetZ = Math.max(-DRAG_BOUND_Z, Math.min(DRAG_BOUND_Z, hit.z + ps.offsetZ));
      }
    }

    function onUp(ev: PointerEvent) {
      const ps = pointerState.current;
      const tapeId = ps.downTapeId;
      const wasDragging = ps.active;

      if (wasDragging && tapeId) {
        const tx = drag.targetX;
        const tz = drag.targetZ;
        // Clear drag — TapeBody will see null on next useFrame and release
        drag.tapeId = null;
        if (controlsRef.current) controlsRef.current.enabled = true;

        const [x2d, y2d] = to2D(tx, tz);
        const deckDrop = isDeckDrop(ev.clientX, ev.clientY);
        onDragEnd(tapeId, x2d, y2d, deckDrop);
      } else if (tapeId && !wasDragging) {
        const now = Date.now();
        const last = lastTapRef.current;
        if (last.id === tapeId && now - last.time < 400) {
          bounceTapeId.current = tapeId;
          // Delay menu open slightly so bounce ref is consumed first
          setTimeout(() => onDoubleTap(tapeId), 50);
          lastTapRef.current = { time: 0, id: '' };
        } else {
          lastTapRef.current = { time: now, id: tapeId };
          onClearMenu();
        }
      }

      ps.downTapeId = null;
      ps.active = false;
    }

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [gl, drag, raycastTape, raycastToPlane, getTapeWorldPos, isDeckDrop, onDragStart, onDragEnd, onDoubleTap, onClearMenu, lockedTapeId, maxDragX]);

  // Pick up external drag initiation (e.g. tape ejected from deck)
  const extDragActive = useRef(false);

  useFrame(() => {
    if (!externalDrag || extDragActive.current) return;
    if (!externalDrag.tapeId) return;

    // Start external drag — raycast screen coords to get initial 3D position
    extDragActive.current = true;
    const sx = (externalDrag as any).screenX as number | undefined;
    const sy = (externalDrag as any).screenY as number | undefined;
    if (sx !== undefined && sy !== undefined) {
      const hit = raycastToPlane(sx, sy, DRAG_HEIGHT);
      if (hit) {
        externalDrag.targetX = hit.x;
        externalDrag.targetZ = hit.z;
      }
    }
    drag.tapeId = externalDrag.tapeId;
    drag.targetX = externalDrag.targetX;
    drag.targetZ = externalDrag.targetZ;
    if (controlsRef.current) controlsRef.current.enabled = false;
    onDragStart();

    function onExtMove(ev: PointerEvent) {
      const hit = raycastToPlane(ev.clientX, ev.clientY, DRAG_HEIGHT);
      if (hit) {
        drag.targetX = Math.max(-DRAG_BOUND_X, Math.min(DRAG_BOUND_X, hit.x));
        drag.targetZ = Math.max(-DRAG_BOUND_Z, Math.min(DRAG_BOUND_Z, hit.z));
      }
    }

    function onExtUp(ev: PointerEvent) {
      const tapeId = drag.tapeId;
      const tx = drag.targetX;
      const tz = drag.targetZ;
      externalDrag!.tapeId = null;
      drag.tapeId = null;
      extDragActive.current = false;
      if (controlsRef.current) controlsRef.current.enabled = true;
      window.removeEventListener('pointermove', onExtMove);
      window.removeEventListener('pointerup', onExtUp);
      if (tapeId) {
        const [x2d, y2d] = to2D(tx, tz);
        const deckDrop = isDeckDrop(ev.clientX, ev.clientY);
        onDragEnd(tapeId, x2d, y2d, deckDrop);
      }
    }

    window.addEventListener('pointermove', onExtMove);
    window.addEventListener('pointerup', onExtUp);
  });

  // Restore saved zoom level
  const zoomRestored = useRef(false);
  if (!zoomRestored.current) {
    const saved = localStorage.getItem('jeem_table_zoom');
    if (saved) {
      const y = parseFloat(saved);
      if (y >= 35 && y <= 45) camera.position.y = y;
    }
    zoomRestored.current = true;
  }

  const lastSavedZoom = useRef(camera.position.y);

  // Clamp camera pan so viewport edge stops at active area boundary
  useFrame(() => {
    const c = controlsRef.current;
    if (!c) return;
    const cam = camera as THREE.PerspectiveCamera;
    const halfH = cam.position.y * Math.tan((cam.fov * Math.PI) / 360);
    const halfW = halfH * cam.aspect;
    const maxX = Math.max(0, CAM_BOUND_X - halfW);
    const maxZ = Math.max(0, CAM_BOUND_Z - halfH);
    c.target.x = Math.max(-maxX, Math.min(maxX, c.target.x));
    c.target.z = Math.max(-maxZ, Math.min(maxZ, c.target.z));
    camera.position.x = Math.max(-maxX, Math.min(maxX, camera.position.x));
    camera.position.z = Math.max(-maxZ, Math.min(maxZ, camera.position.z));

    // Persist zoom when it changes
    if (Math.abs(cam.position.y - lastSavedZoom.current) > 0.3) {
      lastSavedZoom.current = cam.position.y;
      localStorage.setItem('jeem_table_zoom', String(cam.position.y));
    }
  });

  // Listen for centre-camera event (used when entering mixtape creation)
  useEffect(() => {
    function handleCentre(e: Event) {
      const detail = (e as CustomEvent).detail;
      const cx = detail?.x ?? 0;
      camera.position.set(cx, 35, 3);
      if (controlsRef.current) {
        controlsRef.current.target.set(cx, 0, 0);
        controlsRef.current.update();
      }
    }
    window.addEventListener('jeem-centre-camera', handleCentre);
    return () => window.removeEventListener('jeem-centre-camera', handleCentre);
  }, [camera]);

  return (
    <>
      <ambientLight intensity={0.55} color="#fffaf6" />
      <directionalLight
        position={[-11, 28, 8]}
        intensity={1.0}
        color="#fff0e6"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0001}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-near={0.5}
        shadow-camera-far={150}
        shadow-radius={2}
      />
      {/* Fill light from opposite side — no shadows, softens the shaded faces */}
      <directionalLight
        position={[11, 20, -8]}
        intensity={0.45}
        color="#dce7ff"
      />
      <pointLight position={[-8, 6, -4]} intensity={0.25} color="#ffe8d6" />

      <Suspense fallback={null}>
        <Physics gravity={[0, -400, 0]} timeStep={1 / 60}>
          <TableSurface />
          {/* Recorder — lower-left, partially running off the table edge */}
          <Recorder3D position={RECORDER_POS} rotationY={RECORDER_ROT_Y} lidOpen={tapeOverRecorder} />
          {tableTapes.map(tape => (
            <TapeBody
              key={tape.id}
              tape={tape}
              drag={drag}
              menuOpen={menuId === tape.id}
              onMenuAction={onMenuAction}
              isNew={newTapeIds.has(tape.id)}
              bounceTapeId={bounceTapeId}
            />
          ))}
        </Physics>
      </Suspense>

      <MapControls
        ref={controlsRef}
        enableRotate={false}
        enablePan={!lockedTapeId && !lockCamera}
        enableZoom={!lockedTapeId && !lockCamera}
        minDistance={35}
        maxDistance={45}
        panSpeed={1.5}
        zoomSpeed={1.2}
        screenSpacePanning={false}
        target={[0, 0, 0]}
      />
    </>
  );
}

export function TapesTable3D(props: TapesTable3DProps) {
  return (
    <div style={{ flex: 1, position: 'relative' }}>
      {/* Vignette — below search UI (z-index 2) */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2,
        background: 'radial-gradient(circle, transparent 50%, rgba(0,0,0,0.5) 120%)',
      }} />
      <Canvas
        shadows
        camera={{ position: [0, 30, 3], fov: 45, near: 0.1, far: 200 }}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        dpr={[1, 1.5]}
        style={{ background: '#0a0805' }}
        onCreated={({ gl }) => {
          const canvas = gl.domElement;
          canvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            console.warn('[TapeTable] WebGL context lost — will restore');
          });
          canvas.addEventListener('webglcontextrestored', () => {
            console.log('[TapeTable] WebGL context restored');
          });
        }}
      >
        <SceneContents {...props} />
      </Canvas>
    </div>
  );
}
