import React, { Suspense, useCallback, useRef, useEffect, useMemo, useState, forwardRef, useImperativeHandle } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { MapControls, Stats } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import * as THREE from 'three';
import { Tape } from './types';
import { TableSurface } from './TableSurface';
import { TableSticker } from './TableSticker';
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
// Pre-computed trig for recorder zone tests — module scope, computed once.
const REC_COS = Math.cos(-RECORDER_ROT_Y);
const REC_SIN = Math.sin(-RECORDER_ROT_Y);
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
  onDragEnd: (tapeId: string, x2d: number, y2d: number, droppedOnDeck: boolean, landedOnRecorder: boolean) => void;
  onDoubleTap: (tapeId: string, worldX?: number, worldZ?: number) => void;
  // `info.isLabel` is true when the click landed in the upper half of the
   // canvas above the tape's projected centre — i.e. the cassette's label
   // region in inspect/edit views. Used by callers to route label taps to
   // the name editor instead of the texture-cycle handler.
  onSingleTap?: (tapeId: string, info?: { isLabel: boolean }) => void;
  // When set, single-taps on this tape fire `onSingleTap` (with label-hit
   // info) instead of being absorbed by the double-tap detector. Used to
   // arm the cassette for in-place editing on an existing mixtape inspect.
  editTapeId?: string | null;
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
  // Shared ref updated by the 3D scene so the parent knows where the
  // camera is looking (used to spawn new tapes at the camera centre).
  cameraTargetRef?: React.MutableRefObject<{ x: number; z: number }>;
  // When set: closer-zoom inspect mode showing only this one tape, no recorder,
  // no camera control, no pickup. Parent dispatches jeem-centre-camera at camY=20.
  inspectTapeId?: string | null;
  // When true, the inspected tape is faded out alongside the others (used
  // by the remove flow to dissolve the tape before the exit-inspect tween).
  fadeInspectedTape?: boolean;
  // Shared YouTube-playing flag — passed through to each TapeBody to drive
  // spool spin without polling a vanilla-JS global every frame.
  isPlayingRef?: React.MutableRefObject<boolean>;
  // While a pending-single flow is active, hide the mixtape table sticker;
  // vice versa for the pending-mixtape flow.
  hideMixtapeSticker?: boolean;
  hideSingleSticker?: boolean;
  // Suppress hover/click on table stickers (e.g. while dragging a tape).
  stickersInert?: boolean;
}

function SceneContents({
  tapes, loadedTapeId, onDragStart, onDragEnd, onDoubleTap, onSingleTap, editTapeId, onMenuAction, menuId, onClearMenu, newTapeIds, respawnVersions, externalDrag, lockedTapeId, pickupBlockedTapeId, lockCamera, lockPan, freePan, maxDragX, onRecorderLoad, onRecorderEject, showRecorder, onSceneReady, inspectTapeId, fadeInspectedTape, cameraTargetRef, isPlayingRef, hideMixtapeSticker, hideSingleSticker, stickersInert,
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

  // Track snap.tapeId across frames so we can detect pickup (eject) transitions.
  const prevSnapTapeId = useRef<string | null>(null);
  // Refs so useFrame always calls the latest callbacks.
  const onRecorderEjectRef = useRef(onRecorderEject);
  useEffect(() => { onRecorderEjectRef.current = onRecorderEject; }, [onRecorderEject]);
  // Mutable timer ref for lid-close delay — must be declared before the
  // cleanup effect so the ref is available when the effect runs on unmount.
  const lidCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hold-to-grab timer. If the pointer is held still over a tape for this
  // long, promote to drag even though the movement threshold hasn't been
  // crossed — fixes the "tape doesn't pick up when the mouse is static"
  // case.
  const holdToGrabTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const HOLD_TO_GRAB_MS = 220;

  // Cleanup lid close timer on unmount
  useEffect(() => {
    return () => {
      if (lidCloseTimer.current) clearTimeout(lidCloseTimer.current);
    };
  }, []);

  // Local-frame footprint test shared by hover (tape) and hover (mouse) checks.
  const isOverRecorder = useCallback((x: number, z: number) => {
    const dx = x - RECORDER_POS[0];
    const dz = z - RECORDER_POS[2];
    const lx = dx * REC_COS - dz * REC_SIN;
    const lz = dx * REC_SIN + dz * REC_COS;
    return Math.abs(lx) < RECORDER_HALF_W && Math.abs(lz) < RECORDER_HALF_D;
  }, []);

  // Wider zone: starts tape yaw/pitch snap before the lid-open trigger fires.
  const isInSnapZone = useCallback((x: number, z: number) => {
    const dx = x - RECORDER_POS[0];
    const dz = z - RECORDER_POS[2];
    const lx = dx * REC_COS - dz * REC_SIN;
    const lz = dx * REC_SIN + dz * REC_COS;
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
  // Latest pointer position in client coords — read by the edge-pan useFrame
  // so the camera keeps drifting while the pointer hovers near a screen edge,
  // even with no pointermove event firing.
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  // In inspect mode, keep all tapes mounted (so the non-focused ones can fade
  // out via their `hidden` prop) instead of filtering them away abruptly.
  const tableTapes = tapes.filter(t => t.id !== loadedTapeId);

  // Reusable objects — allocated once, reused every pointer event to avoid GC pressure
  const _raycaster = useMemo(() => new THREE.Raycaster(), []);
  const _ndcVec = useMemo(() => new THREE.Vector2(), []);
  const _hitVec = useMemo(() => new THREE.Vector3(), []);
  const _worldVec = useMemo(() => new THREE.Vector3(), []);

  const _plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const raycastToPlane = useCallback((clientX: number, clientY: number, planeY: number): THREE.Vector3 | null => {
    const rect = gl.domElement.getBoundingClientRect();
    _ndcVec.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ndcVec.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_ndcVec, camera);
    _plane.constant = -planeY;
    return _raycaster.ray.intersectPlane(_plane, _hitVec) ? _hitVec.clone() : null;
  }, [camera, gl, _plane, _ndcVec, _raycaster, _hitVec]);

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
      // Inspect mode (incl. pending single / pending mixtape): only the
      // focused tape is clickable — other tapes' AABBs are ignored so
      // their stacking doesn't steal taps from the focused subject.
      const id = obj.name.replace('tape-', '');
      if (inspectTapeId && id !== inspectTapeId) return;
      obj.getWorldPosition(_worldVec);
      const dx = Math.abs(hit.x - _worldVec.x);
      const dz = Math.abs(hit.z - _worldVec.z);
      if (dx < HALF_W + 0.1 && dz < HALF_H + 0.1) {
        const dist = dx + dz;
        // Prefer the tape stacked highest (top of any pile). Tie-break by
        // proximity to centre. 0.05 tolerance keeps flat-on-table tapes
        // (which all sit at ~halfY) tied so the original distance rule wins.
        if (_worldVec.y > bestY + 0.05 || (Math.abs(_worldVec.y - bestY) <= 0.05 && dist < bestDist)) {
          bestY = _worldVec.y;
          bestDist = dist;
          bestId = id;
        }
      }
    });
    return bestId;
  }, [scene, raycastToPlane, inspectTapeId]);

  const getTapeWorldPos = useCallback((tapeId: string): { x: number; z: number } | null => {
    let result: { x: number; z: number } | null = null;
    scene.traverse((obj) => {
      if (obj.name === `tape-${tapeId}`) {
        obj.getWorldPosition(_worldVec);
        result = { x: _worldVec.x, z: _worldVec.z };
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

    function activateDrag() {
      const ps = pointerState.current;
      if (ps.active || !ps.downTapeId) return;
      if (inspectTapeId) return;
      ps.active = true;
      ps.offsetX = 0;
      ps.offsetZ = 0;
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

    function onDown(ev: PointerEvent) {
      const tapeId = raycastTape(ev.clientX, ev.clientY);
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
      // Seed lastPointer so the edge-pan useFrame has a reading even if the
      // hold-to-grab path fires before the first pointermove.
      lastPointerRef.current = { x: ev.clientX, y: ev.clientY };

      // Hold-to-grab: if the pointer stays put long enough, promote to drag
      // without requiring a movement threshold. Cancelled on move / up.
      if (holdToGrabTimer.current) clearTimeout(holdToGrabTimer.current);
      holdToGrabTimer.current = setTimeout(() => {
        holdToGrabTimer.current = null;
        activateDrag();
      }, HOLD_TO_GRAB_MS);
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
        // Movement threshold crossed — cancel the hold timer and start drag.
        if (holdToGrabTimer.current) {
          clearTimeout(holdToGrabTimer.current);
          holdToGrabTimer.current = null;
        }
        activateDrag();
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
      if (holdToGrabTimer.current) {
        clearTimeout(holdToGrabTimer.current);
        holdToGrabTimer.current = null;
      }
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
        const landedOnRecorder = !!showRecorder && isOverRecorder(tx, tz);
        if (landedOnRecorder) {
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
        onDragEnd(tapeId, x2d, y2d, deckDrop, landedOnRecorder);
      } else if (tapeId && !wasDragging) {
        // Single-tap routing for "editable" cassettes (pending-mixtape
        // creation flow OR an existing mixtape that's currently in
        // edit mode, identified via `editTapeId`):
        //   • upper-half-of-canvas hit → label tap → route via `isLabel`
        //     so the caller can focus the inline name editor.
        //   • lower-half hit → texture-variant cycle (existing behaviour).
        // For everything else we fall through to the double-tap detector.
        const tappedTape = tapes.find(t => t.id === tapeId);
        const isEditable = !!tappedTape?.isPendingMixtape || (editTapeId != null && tapeId === editTapeId);
        if (isEditable && onSingleTap) {
          // Project the tape's two length-axis endpoints into screen
          // space so the "label" hit zone tracks the FBX itself —
          // upper third of the cassette's projected vertical span,
          // not a fixed canvas slab. Robust to camera angle, tape yaw,
          // and viewport size (fixes label-zone-too-low on narrow).
          const r = el.getBoundingClientRect();
          let isLabel = (ev.clientY - r.top) / r.height < 0.5; // safe fallback
          const obj = scene.getObjectByName(`tape-${tapeId}`);
          if (obj) {
            const a = obj.localToWorld(new THREE.Vector3(0, 0, -TAPE_H / 2));
            const b = obj.localToWorld(new THREE.Vector3(0, 0,  TAPE_H / 2));
            a.project(camera);
            b.project(camera);
            const aY = (1 - a.y) / 2 * r.height;
            const bY = (1 - b.y) / 2 * r.height;
            const minY = Math.min(aY, bY);
            const maxY = Math.max(aY, bY);
            const clickY = ev.clientY - r.top;
            isLabel = clickY < minY + (maxY - minY) / 3;
          }
          onSingleTap(tapeId, { isLabel });
          lastTapRef.current = { time: 0, id: '' };
        } else {
          const now = Date.now();
          const last = lastTapRef.current;
          if (last.id === tapeId && now - last.time < 400) {
            bounceTapeId.current = tapeId;
            // Delay menu open slightly so bounce ref is consumed first
            // Send the tape's current world XZ along — its stored 2D x/y in
            // state can lag the rigid-body's actual position (physics
            // settle, recent drops, etc.), and the inspect-camera math
            // needs the live position to centre the tape correctly.
            const live = getTapeWorldPos(tapeId);
            setTimeout(() => onDoubleTap(tapeId, live?.x, live?.z), 50);
            lastTapRef.current = { time: 0, id: '' };
          } else {
            lastTapRef.current = { time: now, id: tapeId };
            onClearMenu();
          }
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
      if (holdToGrabTimer.current) {
        clearTimeout(holdToGrabTimer.current);
        holdToGrabTimer.current = null;
      }
    };
  }, [gl, drag, snap, raycastTape, raycastToPlane, getTapeWorldPos, isDeckDrop, isOverRecorder, onDragStart, onDragEnd, onDoubleTap, onSingleTap, editTapeId, onClearMenu, lockedTapeId, pickupBlockedTapeId, maxDragX, onRecorderLoad, showRecorder, inspectTapeId, tapes]);

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
        onDragEnd(tapeId, x2d, y2d, deckDrop, false);
      }
    }

    window.addEventListener('pointermove', onExtMove);
    window.addEventListener('pointerup', onExtUp);
  });

  // Mobile heuristic — touch support OR narrow viewport. Forces wide zoom,
  // disables zoom controls, and pans the camera toward the recorder so it
  // isn't off-screen on portrait phones.
  const isMobile = typeof window !== 'undefined' && (
    window.innerWidth <= 745 ||
    (window.innerWidth <= 1024 && navigator.maxTouchPoints > 0)
  );

  // Restore saved zoom level (skip on mobile — we always want max zoom out).
  const zoomRestored = useRef(false);
  if (!zoomRestored.current) {
    if (isMobile) {
      camera.position.y = 45;
    } else {
      const saved = localStorage.getItem('jeem_table_zoom');
      if (saved) {
        const y = parseFloat(saved);
        if (y >= 35 && y <= 45) camera.position.y = y;
      }
    }
    zoomRestored.current = true;
  }

  // On mobile, nudge the initial camera target and position left so the
  // recorder is in view without requiring a pan first.
  const mobileTargetSet = useRef(false);
  if (isMobile && !mobileTargetSet.current && controlsRef.current) {
    controlsRef.current.target.set(-8, 0, 0);
    camera.position.x = -8;
    mobileTargetSet.current = true;
  }

  const lastSavedZoom = useRef(camera.position.y);

  // Active camera tween (declared before the clamp useFrame so it can pause
  // clamping while a tween is animating).
  const camTweenRef = useRef<{
    fromPos: THREE.Vector3; toPos: THREE.Vector3;
    fromTgt: THREE.Vector3; toTgt: THREE.Vector3;
    start: number; dur: number;
  } | null>(null);
  // Separate Y-only tween so a zoom can run in parallel with the pan tween
  // (typically slightly offset in time) without overwriting it.
  const camYTweenRef = useRef<{ fromY: number; toY: number; start: number; dur: number } | null>(null);
  // Camera pose captured right before entering inspect mode, so the exit
  // tween can restore exactly where the user was instead of snapping to
  // origin (where the post-tween clamp may want to push it).
  const savedInspectPoseRef = useRef<{ pos: THREE.Vector3; tgt: THREE.Vector3 } | null>(null);

  // Clamp camera pan so viewport edge stops at active area boundary
  useFrame(() => {
    const c = controlsRef.current;
    if (!c) return;
    // Don't fight an in-flight camera tween, and don't clamp during drag /
    // player view — at typical aspect ratios the active-area is narrower than
    // the viewport so maxX collapses to 0 and yanks the camera back to origin
    // ~600ms after a pickup, jumping the view.
    if (camTweenRef.current || camYTweenRef.current || freePan || inspectTapeId) return;
    const cam = camera as THREE.PerspectiveCamera;
    const halfH = cam.position.y * Math.tan((cam.fov * Math.PI) / 360);
    const halfW = halfH * cam.aspect;
    // Allow a small Z range on mobile even when halfH exceeds CAM_BOUND_Z
    // so two-finger-drag panning doesn't feel broken.
    const minZ = isMobile ? -5 : 0;
    const maxX = Math.max(0, CAM_BOUND_X - halfW);
    const maxZ = Math.max(minZ, CAM_BOUND_Z - halfH);
    c.target.x = Math.max(-maxX, Math.min(maxX, c.target.x));
    c.target.z = Math.max(-maxZ, Math.min(maxZ, c.target.z));
    camera.position.x = Math.max(-maxX, Math.min(maxX, camera.position.x));
    camera.position.z = Math.max(-maxZ, Math.min(maxZ, camera.position.z));

    // Keep the parent aware of where the camera is looking (for spawn logic).
    if (cameraTargetRef) {
      cameraTargetRef.current = { x: c.target.x, z: c.target.z };
    }

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
      // If `zoomTo` is supplied, the pan tween leaves Y untouched and a
      // separate camYTween handles the zoom (optionally delayed by zoomDelay).
      const zoomTo: number | undefined = detail.zoomTo;
      const camY = zoomTo != null ? camera.position.y : (detail.camY ?? camera.position.y);
      let camX: number, camZ: number, tgtX: number, tgtZ: number;
      const saved = savedInspectPoseRef.current;
      if (detail.restoreSaved && saved) {
        // Exit-from-inspect: restore the pre-entry pose exactly so the post-
        // tween clamp doesn't yank the camera to a different spot.
        camX = saved.pos.x; camZ = saved.pos.z;
        tgtX = saved.tgt.x; tgtZ = saved.tgt.z;
      } else if (detail.tx !== undefined || detail.tz !== undefined) {
        const tx = detail.tx ?? 0;
        const tz = detail.tz ?? 0;
        camX = tx + 8; camZ = tz + 3;
        tgtX = tx + 8; tgtZ = tz;
      } else {
        camX = detail.x ?? 0; camZ = 3;
        tgtX = camX; tgtZ = 0;
      }
      const c = controlsRef.current;
      if (detail.saveCurrentPose && c) {
        savedInspectPoseRef.current = { pos: camera.position.clone(), tgt: c.target.clone() };
      }
      if (detail.animate && c) {
        const dur = detail.dur ?? 600;
        camTweenRef.current = {
          fromPos: camera.position.clone(),
          toPos: new THREE.Vector3(camX, camY, camZ),
          fromTgt: c.target.clone(),
          toTgt: new THREE.Vector3(tgtX, 0, tgtZ),
          start: performance.now(),
          dur,
        };
        if (zoomTo != null) {
          const zoomDelay = detail.zoomDelay ?? 0;
          const zoomDur = detail.zoomDur ?? dur;
          setTimeout(() => {
            camYTweenRef.current = {
              fromY: camera.position.y,
              toY: zoomTo,
              start: performance.now(),
              dur: zoomDur,
            };
          }, zoomDelay);
        }
      } else {
        camera.position.set(camX, zoomTo ?? camY, camZ);
        if (c) { c.target.set(tgtX, 0, tgtZ); c.update(); }
      }
    }
    window.addEventListener('jeem-centre-camera', handleCentre);
    return () => window.removeEventListener('jeem-centre-camera', handleCentre);
  }, [camera]);

  useFrame(() => {
    const t = camTweenRef.current;
    const yT = camYTweenRef.current;
    if (!t && !yT) return;
    const c = controlsRef.current;
    if (t) {
      const k = Math.min(1, (performance.now() - t.start) / t.dur);
      const e = 1 - Math.pow(1 - k, 3);
      camera.position.lerpVectors(t.fromPos, t.toPos, e);
      if (c) { c.target.lerpVectors(t.fromTgt, t.toTgt, e); c.update(); }
      if (k >= 1) camTweenRef.current = null;
    }
    if (yT) {
      const k = Math.min(1, (performance.now() - yT.start) / yT.dur);
      const e = 1 - Math.pow(1 - k, 3);
      camera.position.y = yT.fromY + (yT.toY - yT.fromY) * e;
      if (c) c.update();
      if (k >= 1) camYTweenRef.current = null;
    }
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
    const speed = 32; // world units / sec at full edge
    const dx = vx * speed * dt;
    const dz = vz * speed * dt;
    // Match the edge-pan bound to the active-area clamp's effective bound so
    // releasing the tape doesn't yank the camera back via the clamp.
    const cam = camera as THREE.PerspectiveCamera;
    const halfH = cam.position.y * Math.tan((cam.fov * Math.PI) / 360);
    const halfW = halfH * cam.aspect;
    const minZ = isMobile ? -5 : 0;
    const maxX = Math.max(0, CAM_BOUND_X - halfW);
    const maxZ = Math.max(minZ, CAM_BOUND_Z - halfH);
    const nxPos = Math.max(-maxX, Math.min(maxX, camera.position.x + dx));
    const nzPos = Math.max(-maxZ, Math.min(maxZ, camera.position.z + dz));
    // Camera position and target must move by the same delta — otherwise
    // the look direction changes and the view appears to rotate. The
    // earlier lerpFactor only on `adx/adz` left the target lagging behind
    // the camera, which surfaced as a strange rotation while dragging
    // near the recorder (where edge-pan triggers continuously).
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
          {/* Sticker on the table surface — near top-left, under tapes */}
          <TableSticker position={[-4.5, 0.03, -5.5]} size={5} textureUrl="/assets/mixtape_sticker.png" clickEvent="jeem-create-pending-mixtape" enabled={!inspectTapeId && !lockCamera && !stickersInert} visible={!hideMixtapeSticker} />
          <TableSticker position={[1, 0.03, -4]} size={3} textureUrl="/assets/single_sticker.png" clickEvent="jeem-create-pending-tape" enabled={!inspectTapeId && !lockCamera && !stickersInert} visible={!hideSingleSticker} />
          {/* Recorder — lower-left, partially running off the table edge */}
          <group visible={sceneReady}>
            {/* Always mounted so it can fade out via `hidden` when entering
                inspect mode instead of unmounting abruptly. `showRecorder`
                still gates interaction (drag-to-load, hover detection). */}
            <Recorder3D position={RECORDER_POS} rotationY={RECORDER_ROT_Y} lidOpen={lidOpen} hidden={uiHidden || !showRecorder} onReady={() => setRecorderReady(true)} />
            {recorderReady && tableTapes.map(tape => (
              <TapeBody
                key={`${tape.id}:${respawnVersions?.get(tape.id) ?? 0}`}
                tape={tape}
                drag={drag}
                snap={snap}
                menuOpen={menuId === tape.id}
                onMenuAction={onMenuAction}
                isNew={newTapeIds.has(tape.id)}
                bounceTapeId={bounceTapeId}
                hidden={uiHidden || (!!inspectTapeId && (tape.id !== inspectTapeId || !!fadeInspectedTape))}
                inspecting={!!inspectTapeId && tape.id === inspectTapeId && !fadeInspectedTape}
                onReady={handleTapeReady}
                spawnAllowed={sceneReady}
                isPlayingRef={isPlayingRef}
              />
            ))}
          </group>
        </Physics>
      </Suspense>

      <MapControls
        ref={controlsRef}
        enableRotate={false}
        enablePan={!lockedTapeId && !lockCamera && !lockPan && !inspectTapeId}
        enableZoom={!isMobile && !lockedTapeId && !lockCamera && !inspectTapeId}
        minDistance={inspectTapeId ? 20 : (isMobile ? 45 : 35)}
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
    <div style={{ flex: 1, position: 'relative', background: '#0a0805', isolation: 'isolate' }}>
      <Canvas
        shadows={{ type: THREE.PCFShadowMap }}
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
