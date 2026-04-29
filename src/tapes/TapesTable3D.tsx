import React, { Suspense, useCallback, useRef, useEffect, useMemo, useState, forwardRef, useImperativeHandle } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { MapControls, Stats } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { Tape } from './types';
import { TableSurface } from './TableSurface';
import { TapeBody } from './TapeBody';
import { Recorder3D } from './Recorder3D';
import { YouTubeSurface } from './YouTubeSurface';
import { to2D, DRAG_HEIGHT, CAM_BOUND_X, CAM_BOUND_Z, DRAG_BOUND_X, DRAG_BOUND_Z, TAPE_W, TAPE_H } from './coords';

// Matches DragState in coords.ts — inlined to avoid bundler issues
interface DragState {
  tapeId: string | null;
  targetX: number;
  targetZ: number;
  targetYaw?: number | null;
  targetPitch?: number | null;
  targetY?: number | null;
}

// Matches SnapState in coords.ts — inlined to avoid bundler issues
interface SnapState {
  tapeId: string | null;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

// Recorder placement — kept in sync with the <Recorder3D> props below.
const RECORDER_POS: [number, number, number] = [-20, 0, 4];
const RECORDER_ROT_Y = Math.PI / 6;
// Half-extents of the recorder *hover trigger* zone in local axes. Larger than
// the physical footprint so the lid pops open before the tape is right on top.
const RECORDER_HALF_W = 4;
const RECORDER_HALF_D = 5;
// Larger zone for the tape's yaw/pitch/lift snap — so the tape starts orienting
// toward the recorder before it's right on top, even though the lid itself
// waits for the tighter RECORDER_HALF_W/D zone.
const RECORDER_SNAP_HALF_W = 7;
const RECORDER_SNAP_HALF_D = 8;
// Mirror Recorder3D's lidOpenAngle magnitude, but negated — the hovering tape
// tips its leading edge down (opposite direction to the lid opening upward).
const RECORDER_LID_OPEN_ANGLE = Math.PI / 8;
// Extended drag bounds — let dragged tapes reach closer to the camera viewport
// edges on the left, right and bottom (keep the top bound untouched so tapes
// can't slip behind the search/start UI overlay).
const DRAG_X_EXT = DRAG_BOUND_X + 6;
const DRAG_Z_TOP = DRAG_BOUND_Z;
const DRAG_Z_BOT = DRAG_BOUND_Z + 6;
// Extra lift added to DRAG_HEIGHT when hovering over the open recorder so the
// tape's tipped-down leading edge clears the raised lid.
const RECORDER_HOVER_LIFT = 1;
// Loaded pose — height above table when a tape is snapped into the recorder.
const RECORDER_LOAD_Y = 2.3;
// Local-frame offset from RECORDER_POS to the loaded pose (along recorder's
// rotated axes). Tune these to nudge the snap point over the tape well.
const RECORDER_LOAD_LOCAL_X = 0.4;
const RECORDER_LOAD_LOCAL_Z = 2.15;
// Delay (ms) after drop before the lid closes again.
const LID_CLOSE_DELAY = 800;

export interface TapesTable3DHandle {
  startDrag: (tapeId: string) => void;
}

interface TapesTable3DProps {
  tapes: Tape[];
  loadedTapeId: string | null;
  onDragStart: (tapeId: string) => void;
  onDragEnd: (tapeId: string, x2d: number, y2d: number, droppedOnDeck: boolean) => void;
  onDoubleTap: (tapeId: string) => void;
  onMenuAction: (tapeId: string, action: 'link' | 'rewind' | 'remove') => void;
  menuId: string | null;
  onClearMenu: () => void;
  newTapeIds: Set<string>;
  // Per-tape remount key. When a value bumps, that tape's TapeBody remounts —
  // used to "respawn" a tape (e.g. ejected from recorder by a replacement) so
  // it falls from SPAWN_HEIGHT at its updated x/y instead of dropping in place.
  respawnVersions?: Map<string, number>;
  externalDrag?: DragState; // shared mutable object for external drag initiation
  lockedTapeId?: string | null;
  // Prevents pickup of a specific tape (e.g. while the recorder is still
  // loading the YouTube track). Unlike lockedTapeId, this does NOT disable
  // camera pan/zoom — it just rejects pointer-down on this one tape.
  pickupBlockedTapeId?: string | null;
  lockCamera?: boolean;
  lockPan?: boolean;
  // While true, skip the active-area pan clamp — used during drag/player view
  // so the camera can sit at a tape-centred offset without being yanked back.
  freePan?: boolean;
  maxDragX?: number;
  onRecorderLoad?: (tapeId: string) => void;
  onRecorderEject?: () => void;
  showRecorder?: boolean;
  onSceneReady?: () => void;
  // When set: closer-zoom inspect mode showing only this one tape, no recorder,
  // no camera control, no pickup. Parent dispatches jeem-centre-camera at camY=20.
  inspectTapeId?: string | null;
}

function SceneContents({
  tapes, loadedTapeId, onDragStart, onDragEnd, onDoubleTap, onMenuAction, menuId, onClearMenu, newTapeIds, respawnVersions, externalDrag, lockedTapeId, pickupBlockedTapeId, lockCamera, lockPan, freePan, maxDragX, onRecorderLoad, onRecorderEject, showRecorder, onSceneReady, inspectTapeId,
}: TapesTable3DProps) {
  const { camera, gl, scene } = useThree();
  const controlsRef = useRef<any>(null);

  // Mutable drag state — no React re-renders during drag
  const drag = useMemo<DragState>(() => ({ tapeId: null, targetX: 0, targetZ: 0, targetYaw: null, targetPitch: null, targetY: null }), []);
  // Mutable snap target — read by TapeBody to tween into the recorder pose.
  const snap = useMemo<SnapState>(() => ({ tapeId: null, x: 0, y: 0, z: 0, yaw: 0 }), []);
  const bounceTapeId = useRef<string | null>(null);

  // Recorder lid open when: dragged tape over footprint, mouse over footprint, or
  // just-dropped into the recorder (brief delay before closing).
  const [tapeOverRecorder, setTapeOverRecorder] = useState(false);
  const [mouseOverRecorder, setMouseOverRecorder] = useState(false);
  const [recentlyLoaded, setRecentlyLoaded] = useState(false);
  // Fades the recorder + tapes alongside the rest of the UI when the inactivity
  // module hides them (event dispatched from public/src/player.js).
  const [uiHidden, setUiHidden] = useState(false);
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent).detail as { hidden?: boolean } | undefined;
      setUiHidden(!!detail?.hidden);
    }
    window.addEventListener('jeem-ui-fade', handler);
    return () => window.removeEventListener('jeem-ui-fade', handler);
  }, []);
  // True while a tape is snapped in the recorder — suppresses mouseOverRecorder
  // so the lid stays closed even if the mouse is still parked over the footprint.
  const [tapeInRecorder, setTapeInRecorder] = useState(false);
  // Don't mount any TapeBody until the recorder GLB has loaded — guarantees
  // the recorder appears on the table before any tape model.
  const [recorderReady, setRecorderReady] = useState(false);
  // Track which tapes have finished loading their FBX + textures + materials.
  // Used to gate the "scene ready" signal that hides the loading spinner.
  const readyTapeIdsRef = useRef<Set<string>>(new Set());
  const [readyTick, setReadyTick] = useState(0);
  const handleTapeReady = useCallback((id: string) => {
    if (readyTapeIdsRef.current.has(id)) return;
    readyTapeIdsRef.current.add(id);
    setReadyTick(t => t + 1);
  }, []);
  const tableTapesForReady = tapes.filter(t => t.id !== loadedTapeId);
  const allTapesReady = tableTapesForReady.every(t => readyTapeIdsRef.current.has(t.id));
  const sceneReady = (!showRecorder || recorderReady) && allTapesReady;
  const sceneReadyFiredRef = useRef(false);
  useEffect(() => {
    if (sceneReady && !sceneReadyFiredRef.current) {
      sceneReadyFiredRef.current = true;
      onSceneReady?.();
    }
  }, [sceneReady, onSceneReady]);
  const lidCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track snap.tapeId across frames so we can detect pickup (eject) transitions.
  const prevSnapTapeId = useRef<string | null>(null);
  // Refs so useFrame always calls the latest callbacks.
  const onRecorderEjectRef = useRef(onRecorderEject);
  useEffect(() => { onRecorderEjectRef.current = onRecorderEject; }, [onRecorderEject]);

  // Local-frame footprint test shared by hover (tape) and hover (mouse) checks.
  const isOverRecorder = useCallback((x: number, z: number) => {
    const dx = x - RECORDER_POS[0];
    const dz = z - RECORDER_POS[2];
    const cos = Math.cos(-RECORDER_ROT_Y);
    const sin = Math.sin(-RECORDER_ROT_Y);
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    return Math.abs(lx) < RECORDER_HALF_W && Math.abs(lz) < RECORDER_HALF_D;
  }, []);

  // Wider zone: starts tape yaw/pitch snap before the lid-open trigger fires.
  const isInSnapZone = useCallback((x: number, z: number) => {
    const dx = x - RECORDER_POS[0];
    const dz = z - RECORDER_POS[2];
    const cos = Math.cos(-RECORDER_ROT_Y);
    const sin = Math.sin(-RECORDER_ROT_Y);
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    return Math.abs(lx) < RECORDER_SNAP_HALF_W && Math.abs(lz) < RECORDER_SNAP_HALF_D;
  }, []);

  useFrame(() => {
    const dragging = !!showRecorder && !!drag.tapeId;
    const isOver = dragging && isOverRecorder(drag.targetX, drag.targetZ);
    // Wider zone: tape starts orienting toward the recorder before the lid fires.
    const isInSnap = dragging && isInSnapZone(drag.targetX, drag.targetZ);
    // Publish snap-yaw so TapeBody's per-frame rotation matches the recorder.
    // Add π so the opposite cassette edge faces the recorder slot (flip around Y).
    drag.targetYaw = isInSnap ? RECORDER_ROT_Y + Math.PI : null;
    // Tip the tape's top edge down to match the open lid's angle.
    drag.targetPitch = isInSnap ? RECORDER_LID_OPEN_ANGLE : null;
    // Lift the tape higher so its tipped leading edge clears the open lid.
    drag.targetY = isInSnap ? DRAG_HEIGHT + RECORDER_HOVER_LIFT : null;
    if (isOver !== tapeOverRecorder) setTapeOverRecorder(isOver);

    // Track snap.tapeId transitions — eject = non-null → null (TapeBody clears
    // it on pickup). Load is fired directly in onUp so no detection here.
    const cur = snap.tapeId;
    if (prevSnapTapeId.current && !cur) {
      onRecorderEjectRef.current?.();
    }
    prevSnapTapeId.current = cur;
    const inRec = cur !== null;
    if (inRec !== tapeInRecorder) setTapeInRecorder(inRec);
  });

  // Lid stays closed while a tape is loaded, even if the mouse still hovers —
  // only the hover + drag + just-loaded cases open it.
  const lidOpen = tapeOverRecorder || recentlyLoaded;

  const pointerState = useRef({
    downTapeId: null as string | null,
    active: false,
    startX: 0,
    startY: 0,
    offsetX: 0,  // offset from pointer to tape center
    offsetZ: 0,
  });

  const lastTapRef = useRef<{ time: number; id: string }>({ time: 0, id: '' });
  // Full camera pose saved at drag start, restored on drag end so the view
  // returns to its pre-pickup zoom/pan instead of being yanked by the clamp.
  const savedCamPoseRef = useRef<{ pos: THREE.Vector3; tgt: THREE.Vector3 } | null>(null);
  // Latest pointer position in client coords — read by the edge-pan useFrame
  // so the camera keeps drifting while the pointer hovers near a screen edge,
  // even with no pointermove event firing.
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  const tableTapes = inspectTapeId
    ? tapes.filter(t => t.id === inspectTapeId)
    : tapes.filter(t => t.id !== loadedTapeId);

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
    let bestY = -Infinity;
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
        // Prefer the tape stacked highest (top of any pile). Tie-break by
        // proximity to centre. 0.05 tolerance keeps flat-on-table tapes
        // (which all sit at ~halfY) tied so the original distance rule wins.
        if (world.y > bestY + 0.05 || (Math.abs(world.y - bestY) <= 0.05 && dist < bestDist)) {
          bestY = world.y;
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
    if (r.width === 0 && r.height === 0) return false;
    // Expand hit zone by 30px in each direction for easier drops
    const pad = 30;
    const hit = screenX >= r.left - pad && screenX <= r.right + pad && screenY >= r.top - pad && screenY <= r.bottom + pad;
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
      if (pickupBlockedTapeId && tapeId === pickupBlockedTapeId) return;
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
      // Inspect mode: allow raycast tap detection (for double-tap-to-exit) but
      // block drag from starting.
      if (inspectTapeId && !ps.active) return;
      // Clamp pointer to a border inside the canvas while dragging so the
      // tape can't be flung offscreen past the edge-pan zone.
      const rect = gl.domElement.getBoundingClientRect();
      const border = 24;
      const px = Math.max(rect.left + border, Math.min(rect.right - border, ev.clientX));
      const py = Math.max(rect.top + border, Math.min(rect.bottom - border, ev.clientY));
      lastPointerRef.current = { x: px, y: py };

      if (!ps.active) {
        const dx = ev.clientX - ps.startX;
        const dy = ev.clientY - ps.startY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 5) return;

        // Start drag — tape centre snaps to pointer (zero offset).
        ps.active = true;
        ps.offsetX = 0;
        ps.offsetZ = 0;
        // Remember full pose so we can restore zoom + pan on drop.
        const c0 = controlsRef.current;
        savedCamPoseRef.current = {
          pos: camera.position.clone(),
          tgt: c0 ? c0.target.clone() : new THREE.Vector3(0, 0, 0),
        };
        drag.tapeId = ps.downTapeId;
        if (controlsRef.current) controlsRef.current.enabled = false;
        onDragStart(ps.downTapeId);

        // Race guard: if a fast drop-and-grab happens within one animation
        // frame, no useFrame observes snap.tapeId = X before it's picked up
        // again, so the eject-transition detector never fires and the track
        // plays on with no tape in the recorder. Clear the slot and fire
        // eject synchronously here; set prev to null so the useFrame won't
        // re-fire on the next tick.
        if (snap.tapeId === ps.downTapeId) {
          snap.tapeId = null;
          prevSnapTapeId.current = null;
          onRecorderEjectRef.current?.();
        }
      }

      // Update target — tape follows pointer with offset, clamped to bounds
      const hit = raycastToPlane(px, py, DRAG_HEIGHT);
      if (hit) {
        const boundX = maxDragX != null ? maxDragX : DRAG_X_EXT;
        drag.targetX = Math.max(-DRAG_X_EXT, Math.min(boundX, hit.x + ps.offsetX));
        drag.targetZ = Math.max(-DRAG_Z_TOP, Math.min(DRAG_Z_BOT, hit.z + ps.offsetZ));
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

        // If dropped over the recorder, set the snap target so TapeBody tweens
        // into the loaded pose instead of falling. Also hold the lid open briefly.
        if (showRecorder && isOverRecorder(tx, tz)) {
          // Apply recorder yaw to the local offset to get a world-space nudge.
          const rc = Math.cos(RECORDER_ROT_Y);
          const rs = Math.sin(RECORDER_ROT_Y);
          const offX = RECORDER_LOAD_LOCAL_X * rc + RECORDER_LOAD_LOCAL_Z * rs;
          const offZ = -RECORDER_LOAD_LOCAL_X * rs + RECORDER_LOAD_LOCAL_Z * rc;
          snap.tapeId = tapeId;
          snap.x = RECORDER_POS[0] + offX;
          snap.y = RECORDER_LOAD_Y;
          snap.z = RECORDER_POS[2] + offZ;
          snap.yaw = RECORDER_ROT_Y + Math.PI;
          if (lidCloseTimer.current) clearTimeout(lidCloseTimer.current);
          setRecentlyLoaded(true);
          lidCloseTimer.current = setTimeout(() => setRecentlyLoaded(false), LID_CLOSE_DELAY);
          onRecorderLoad?.(tapeId);
        }

        const [x2d, y2d] = to2D(tx, tz);
        const deckDrop = isDeckDrop(ev.clientX, ev.clientY);
        onDragEnd(tapeId, x2d, y2d, deckDrop);

        savedCamPoseRef.current = null;
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
      lastPointerRef.current = null;
    }

    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [gl, drag, snap, raycastTape, raycastToPlane, getTapeWorldPos, isDeckDrop, isOverRecorder, onDragStart, onDragEnd, onDoubleTap, onClearMenu, lockedTapeId, pickupBlockedTapeId, maxDragX, onRecorderLoad, showRecorder, inspectTapeId]);

  // Track mouse hover over the recorder footprint (for lid open on hover).
  useEffect(() => {
    const el = gl.domElement;
    function onHoverMove(ev: PointerEvent) {
      if (!showRecorder) { setMouseOverRecorder(false); return; }
      const hit = raycastToPlane(ev.clientX, ev.clientY, 0);
      const over = !!hit && isOverRecorder(hit.x, hit.z);
      setMouseOverRecorder(over);
    }
    function onLeave() { setMouseOverRecorder(false); }
    el.addEventListener('pointermove', onHoverMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onHoverMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [gl, raycastToPlane, isOverRecorder, showRecorder]);

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
    onDragStart(externalDrag.tapeId);

    function onExtMove(ev: PointerEvent) {
      const hit = raycastToPlane(ev.clientX, ev.clientY, DRAG_HEIGHT);
      if (hit) {
        drag.targetX = Math.max(-DRAG_X_EXT, Math.min(DRAG_X_EXT, hit.x));
        drag.targetZ = Math.max(-DRAG_Z_TOP, Math.min(DRAG_Z_BOT, hit.z));
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

  // Active camera tween (declared before the clamp useFrame so it can pause
  // clamping while a tween is animating).
  const camTweenRef = useRef<{
    fromPos: THREE.Vector3; toPos: THREE.Vector3;
    fromTgt: THREE.Vector3; toTgt: THREE.Vector3;
    start: number; dur: number;
  } | null>(null);

  // Clamp camera pan so viewport edge stops at active area boundary
  useFrame(() => {
    const c = controlsRef.current;
    if (!c) return;
    // Don't fight an in-flight camera tween, and don't clamp during drag /
    // player view — at typical aspect ratios the active-area is narrower than
    // the viewport so maxX collapses to 0 and yanks the camera back to origin
    // ~600ms after a pickup, jumping the view.
    if (camTweenRef.current || freePan || inspectTapeId) return;
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

  // Listen for centre-camera event. detail = { x?, tx?, tz?, animate?, camY? }
  // Legacy `x` form sets camera at (x, camY, 3) target (x, 0, 0).
  // New `tx/tz` form centres on a tape with offset so tracklist UI on right
  // doesn't overlap it: camera (tx+8, camY, tz+3) target (tx+8, 0, tz).
  // Default camY = 40 (less zoom-in than the previous 35).
  useEffect(() => {
    function handleCentre(e: Event) {
      const detail = (e as CustomEvent).detail || {};
      const camY = detail.camY ?? 40;
      let camX: number, camZ: number, tgtX: number, tgtZ: number;
      if (detail.tx !== undefined || detail.tz !== undefined) {
        const tx = detail.tx ?? 0;
        const tz = detail.tz ?? 0;
        camX = tx + 8; camZ = tz + 3;
        tgtX = tx + 8; tgtZ = tz;
      } else {
        camX = detail.x ?? 0; camZ = 3;
        tgtX = camX; tgtZ = 0;
      }
      const c = controlsRef.current;
      if (detail.animate && c) {
        camTweenRef.current = {
          fromPos: camera.position.clone(),
          toPos: new THREE.Vector3(camX, camY, camZ),
          fromTgt: c.target.clone(),
          toTgt: new THREE.Vector3(tgtX, 0, tgtZ),
          start: performance.now(),
          dur: 600,
        };
      } else {
        camera.position.set(camX, camY, camZ);
        if (c) { c.target.set(tgtX, 0, tgtZ); c.update(); }
      }
    }
    window.addEventListener('jeem-centre-camera', handleCentre);
    return () => window.removeEventListener('jeem-centre-camera', handleCentre);
  }, [camera]);

  useFrame(() => {
    const t = camTweenRef.current;
    if (!t) return;
    const c = controlsRef.current;
    const k = Math.min(1, (performance.now() - t.start) / t.dur);
    const e = 1 - Math.pow(1 - k, 3);
    camera.position.lerpVectors(t.fromPos, t.toPos, e);
    if (c) { c.target.lerpVectors(t.fromTgt, t.toTgt, e); c.update(); }
    if (k >= 1) camTweenRef.current = null;
  });

  // Edge-of-screen camera pan while dragging a tape — so tapes picked up far
  // from the recorder can still reach it. Push the camera (and controls
  // target) along xz when the pointer is near the viewport edge, then
  // re-raycast so the tape continues to follow the pointer.
  useFrame((_, dt) => {
    if (!drag.tapeId) return;
    if (camTweenRef.current) return;
    const p = lastPointerRef.current;
    if (!p) return;
    const c = controlsRef.current;
    if (!c) return;
    const rect = gl.domElement.getBoundingClientRect();
    const nx = (p.x - rect.left) / rect.width;
    const ny = (p.y - rect.top) / rect.height;
    const margin = 0.15;
    // Larger top margin so the pan triggers before the tape reaches the
    // search/start UI overlay at the top of the screen.
    const topMargin = 0.28;
    let vx = 0, vz = 0;
    if (nx < margin) vx = -(margin - nx) / margin;
    else if (nx > 1 - margin) vx = (nx - (1 - margin)) / margin;
    if (ny < topMargin) vz = -(topMargin - ny) / topMargin;
    else if (ny > 1 - margin) vz = (ny - (1 - margin)) / margin;
    if (vx === 0 && vz === 0) return;
    const speed = 40; // world units / sec at full edge
    const dx = vx * speed * dt;
    const dz = vz * speed * dt;
    // Match the edge-pan bound to the active-area clamp's effective bound so
    // releasing the tape doesn't yank the camera back via the clamp.
    const cam = camera as THREE.PerspectiveCamera;
    const halfH = cam.position.y * Math.tan((cam.fov * Math.PI) / 360);
    const halfW = halfH * cam.aspect;
    const maxX = Math.max(0, CAM_BOUND_X - halfW);
    const maxZ = Math.max(0, CAM_BOUND_Z - halfH);
    const nxPos = Math.max(-maxX, Math.min(maxX, camera.position.x + dx));
    const nzPos = Math.max(-maxZ, Math.min(maxZ, camera.position.z + dz));
    const adx = nxPos - camera.position.x;
    const adz = nzPos - camera.position.z;
    camera.position.x = nxPos;
    camera.position.z = nzPos;
    c.target.x += adx;
    c.target.z += adz;
    c.update();
    // Re-raycast pointer so the held tape follows under the new camera.
    const hit = raycastToPlane(p.x, p.y, DRAG_HEIGHT);
    if (hit) {
      const boundX = maxDragX != null ? maxDragX : DRAG_X_EXT;
      const ps = pointerState.current;
      drag.targetX = Math.max(-DRAG_X_EXT, Math.min(boundX, hit.x + ps.offsetX));
      drag.targetZ = Math.max(-DRAG_Z_TOP, Math.min(DRAG_Z_BOT, hit.z + ps.offsetZ));
    }
  });

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
        shadow-radius={8}
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
          <YouTubeSurface />
          {/* Recorder — lower-left, partially running off the table edge */}
          <group visible={sceneReady}>
            {showRecorder && <Recorder3D position={RECORDER_POS} rotationY={RECORDER_ROT_Y} lidOpen={lidOpen} hidden={uiHidden} onReady={() => setRecorderReady(true)} />}
            {(!showRecorder || recorderReady) && tableTapes.map(tape => (
              <TapeBody
                key={`${tape.id}:${respawnVersions?.get(tape.id) ?? 0}`}
                tape={tape}
                drag={drag}
                snap={snap}
                menuOpen={menuId === tape.id}
                onMenuAction={onMenuAction}
                isNew={newTapeIds.has(tape.id)}
                bounceTapeId={bounceTapeId}
                hidden={uiHidden}
                onReady={handleTapeReady}
                spawnAllowed={sceneReady}
              />
            ))}
          </group>
        </Physics>
      </Suspense>

      <MapControls
        ref={controlsRef}
        enableRotate={false}
        enablePan={!lockedTapeId && !lockCamera && !lockPan && !inspectTapeId}
        enableZoom={!lockedTapeId && !lockCamera && !inspectTapeId}
        minDistance={inspectTapeId ? 18 : 35}
        maxDistance={inspectTapeId ? 22 : 45}
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
    <div style={{ flex: 1, position: 'relative', background: '#0a0805', isolation: 'isolate' }}>
      <Canvas
        shadows
        camera={{ position: [0, 30, 3], fov: 45, near: 0.1, far: 200 }}
        gl={{ antialias: false, powerPreference: 'high-performance', alpha: true }}
        dpr={[1, 1.5]}
        style={{ background: 'transparent' }}
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
