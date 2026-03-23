import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import type { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { Tape } from './types';
import { loadFBXCached, useVariantTextures, VARIANTS, VARIANT_TO_MESH } from './Tape3D';

// 2D canvas is 4000×2400. We use 1 unit = 1 px in orthographic camera.
const CANVAS_W = 4000;
const CANVAS_H = 2400;
// FBX model is ~27.38 units wide. Scale to ~700px wide (3x the 234px tape).
const FBX_SCALE = 700 / 27.38;
// Collider half-extents in px-space
const COL_HX = 117; // 234/2
const COL_HY = 15;  // tape thickness
const COL_HZ = 71;  // 143/2

// ── Static FBX tape (no physics) ──
function StaticTapeFBX({ tape }: { tape: Tape }) {
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const seed = tape.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const variant = VARIANTS[seed % VARIANTS.length];
  const meshName = VARIANT_TO_MESH[variant];
  const textures = useVariantTextures(variant);

  useEffect(() => {
    loadFBXCached().then(fbx => setScene(fbx.clone()));
  }, []);

  useEffect(() => {
    if (!scene || !textures) return;
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.name === meshName) {
          mesh.visible = true;
          mesh.material = new THREE.MeshStandardMaterial({
            map: textures.baseColor,
            metalness: 0.0,
            roughness: 0.75,
            normalMap: textures.normal,
            normalScale: new THREE.Vector2(0.5, 0.5),
            envMapIntensity: 0.3,
          });
        } else {
          mesh.visible = false;
        }
      }
    });
  }, [scene, textures, meshName]);

  useEffect(() => {
    if (!scene) return;
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).visible = (child as THREE.Mesh).name === meshName;
      }
    });
  }, [scene, meshName]);

  if (!scene) return null;

  const angleRad = ((tape.angle ?? 0) * Math.PI) / 180 + Math.PI;

  return (
    <group
      position={[tape.x ?? 0, 0, tape.y ?? 0]}
      rotation={[0, angleRad, 0]}
    >
      <group scale={[FBX_SCALE, FBX_SCALE, FBX_SCALE]}>
        <primitive object={scene} />
      </group>
    </group>
  );
}

// ── Falling FBX tape (physics) ──
function FallingTapeFBX({ tape, onSettled }: { tape: Tape; onSettled: (id: string) => void }) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const settledFrames = useRef(0);

  const seed = tape.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const variant = VARIANTS[seed % VARIANTS.length];
  const meshName = VARIANT_TO_MESH[variant];
  const textures = useVariantTextures(variant);

  useEffect(() => {
    loadFBXCached().then(fbx => setScene(fbx.clone()));
  }, []);

  useEffect(() => {
    if (!scene || !textures) return;
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.name === meshName) {
          mesh.visible = true;
          mesh.material = new THREE.MeshStandardMaterial({
            map: textures.baseColor,
            metalness: 0.0,
            roughness: 0.75,
            normalMap: textures.normal,
            normalScale: new THREE.Vector2(0.5, 0.5),
            envMapIntensity: 0.3,
          });
        } else {
          mesh.visible = false;
        }
      }
    });
  }, [scene, textures, meshName]);

  useEffect(() => {
    if (!scene) return;
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).visible = (child as THREE.Mesh).name === meshName;
      }
    });
  }, [scene, meshName]);

  // Detect when tape has settled (low velocity for several frames)
  useFrame(() => {
    const body = bodyRef.current;
    if (!body) return;
    const vel = body.linvel();
    const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
    if (speed < 5) {
      settledFrames.current++;
      if (settledFrames.current > 30) {
        onSettled(tape.id);
      }
    } else {
      settledFrames.current = 0;
    }
  });

  if (!scene) return null;

  const angleRad = ((tape.angle ?? 0) * Math.PI) / 180 + Math.PI;

  return (
    <RigidBody
      ref={bodyRef}
      position={[tape.x ?? 0, 400, tape.y ?? 0]}
      rotation={[0, angleRad, 0]}
      type="dynamic"
      colliders={false}
      linearDamping={1}
      angularDamping={2}
      mass={0.5}
      restitution={0.1}
      friction={0.6}
    >
      <CuboidCollider args={[COL_HX, COL_HY, COL_HZ]} />
      <group scale={[FBX_SCALE, FBX_SCALE, FBX_SCALE]}>
        <primitive object={scene} />
      </group>
    </RigidBody>
  );
}

// ── Camera synced to 2D scroll ──
function SyncedCamera({ scrollRef }: { scrollRef: React.RefObject<{ scrollLeft: number; scrollTop: number; clientWidth: number; clientHeight: number } | null> }) {
  const { camera } = useThree();
  const logged = useRef(false);

  useFrame(() => {
    const el = scrollRef.current;
    if (!el) return;
    const cam = camera as THREE.OrthographicCamera;
    // Camera looks down -Y. up=[0,0,-1] means +X→right, +Z→down on screen.
    const cx = el.scrollLeft + el.clientWidth / 2;
    const cz = el.scrollTop + el.clientHeight / 2;
    const hw = el.clientWidth / 2;
    const hh = el.clientHeight / 2;

    cam.position.x = cx;
    cam.position.z = cz;
    cam.left = -hw;
    cam.right = hw;
    cam.top = hh;   // +Z is down on screen, so top frustum = +half
    cam.bottom = -hh;
    cam.updateProjectionMatrix();

    if (!logged.current) {
      logged.current = true;
      console.log('[SyncedCamera] scroll:', el.scrollLeft, el.scrollTop, 'client:', el.clientWidth, el.clientHeight, 'cam:', cx, cz, 'frustum:', -hw, hw, -hh, hh);
    }
  });

  return null;
}

// ── Main overlay scene ──
function OverlayScene({
  tapes,
  fallingIds,
  dragId,
  onSettled,
  scrollRef,
}: {
  tapes: Tape[];
  fallingIds: Set<string>;
  dragId: string | null;
  onSettled: (id: string) => void;
  scrollRef: React.RefObject<{ scrollLeft: number; scrollTop: number; clientWidth: number; clientHeight: number } | null>;
}) {
  const staticTapes = tapes.filter(t => !fallingIds.has(t.id) && t.id !== dragId);
  const fallingTapes = tapes.filter(t => fallingIds.has(t.id));

  useEffect(() => {
    console.log('[OverlayScene] static:', staticTapes.length, 'falling:', fallingTapes.length,
      staticTapes.slice(0, 2).map(t => `${t.id}@(${t.x},${t.y})`));
  }, [staticTapes.length, fallingTapes.length]);

  return (
    <>
      <SyncedCamera scrollRef={scrollRef} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[2000, 1000, -500]} intensity={1.0} />

      {/* Static tapes — no physics */}
      {staticTapes.map(tape => (
        <StaticTapeFBX key={tape.id} tape={tape} />
      ))}

      {/* Falling tapes — physics sim */}
      {fallingTapes.length > 0 && (
        <Physics gravity={[0, -3000, 0]} timeStep={1 / 60}>
          {/* Floor */}
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider args={[CANVAS_W, 10, CANVAS_H]} position={[CANVAS_W / 2, -10, CANVAS_H / 2]} />
          </RigidBody>

          {fallingTapes.map(tape => (
            <FallingTapeFBX key={tape.id} tape={tape} onSettled={onSettled} />
          ))}
        </Physics>
      )}
    </>
  );
}

// ── Exported overlay component ──
export interface TapeOverlayHybridProps {
  tapes: Tape[];
  fallingIds: Set<string>;
  dragId: string | null;
  onSettled: (id: string) => void;
  scrollRef: React.RefObject<{ scrollLeft: number; scrollTop: number; clientWidth: number; clientHeight: number } | null>;
}

export function TapeOverlayHybrid({ tapes, fallingIds, dragId, onSettled, scrollRef }: TapeOverlayHybridProps) {
  const [size, setSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    const el = scrollRef.current as HTMLElement | null;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef]);

  return (
    <div style={{
      position: 'sticky',
      top: 0,
      left: 0,
      width: size.w,
      height: size.h,
      marginBottom: -size.h,
      pointerEvents: 'none',
      zIndex: 10,
    }}>
      <Canvas
        orthographic
        camera={{
          position: [CANVAS_W / 2, 500, CANVAS_H / 2],
          near: 0.1,
          far: 2000,
          up: [0, 0, -1],
          zoom: 1,
        }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        dpr={[1, 1.5]}
        events={() => ({ enabled: false, priority: 0, compute: () => {} })}
        style={{ background: 'transparent', pointerEvents: 'none' }}
        onCreated={({ camera }) => {
          camera.lookAt(CANVAS_W / 2, 0, CANVAS_H / 2);
        }}
      >
        <OverlayScene
          tapes={tapes}
          fallingIds={fallingIds}
          dragId={dragId}
          onSettled={onSettled}
          scrollRef={scrollRef}
        />
      </Canvas>
    </div>
  );
}

// ── Drag preview: single FBX tape rendered in a small Canvas ──
function DragTapeFBX({ tape }: { tape: Tape }) {
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const seed = tape.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const variant = VARIANTS[seed % VARIANTS.length];
  const meshName = VARIANT_TO_MESH[variant];
  const textures = useVariantTextures(variant);

  useEffect(() => {
    loadFBXCached().then(fbx => setScene(fbx.clone()));
  }, []);

  useEffect(() => {
    if (!scene || !textures) return;
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.name === meshName) {
          mesh.visible = true;
          mesh.material = new THREE.MeshStandardMaterial({
            map: textures.baseColor,
            metalness: 0.0,
            roughness: 0.75,
            normalMap: textures.normal,
            normalScale: new THREE.Vector2(0.5, 0.5),
            envMapIntensity: 0.3,
          });
        } else {
          mesh.visible = false;
        }
      }
    });
  }, [scene, textures, meshName]);

  useEffect(() => {
    if (!scene) return;
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).visible = (child as THREE.Mesh).name === meshName;
      }
    });
  }, [scene, meshName]);

  if (!scene) return null;

  // Match the table overlay: same FBX_SCALE, top-down, rotated 180
  const angleRad = ((tape.angle ?? 0) * Math.PI) / 180 + Math.PI;
  return (
    <group rotation={[0, angleRad, 0]} scale={[FBX_SCALE, FBX_SCALE, FBX_SCALE]}>
      <primitive object={scene} />
    </group>
  );
}

// Preview size matches 3x tape: 700 x 430 (same aspect as 234x143)
const PREVIEW_W = 700;
const PREVIEW_H = 430;
// Ortho frustum padding
const PAD = 50;

export function TapeDragPreview({ tape }: { tape: Tape }) {
  return (
    <div style={{ width: PREVIEW_W, height: PREVIEW_H }}>
      <Canvas
        orthographic
        camera={{
          position: [0, 500, 0],
          near: 0.1,
          far: 2000,
          up: [0, 0, -1],
          left: -(PREVIEW_W / 2 + PAD),
          right: PREVIEW_W / 2 + PAD,
          top: PREVIEW_H / 2 + PAD,
          bottom: -(PREVIEW_H / 2 + PAD),
          zoom: 1,
        }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 1.5]}
        style={{ background: 'transparent' }}
        onCreated={({ camera }) => {
          camera.lookAt(0, 0, 0);
        }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[200, 500, -100]} intensity={1.0} />
        <DragTapeFBX tape={tape} />
      </Canvas>
    </div>
  );
}
