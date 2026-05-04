import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import type { RapierRigidBody } from '@react-three/rapier';
import { Tape } from './types';
import { to3D } from './coords';
import { TableSurface } from './TableSurface';

export const VARIANTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n'] as const;
// Single cassette mesh used for every tape — only the textures vary per
// variant (a-n). The FBX does contain alternate mesh copies
// (prop_cassette_tape_01001/01003) but they're geometrically identical, so
// we always render the same one.
export const TAPE_MESH_NAME = 'prop_cassette_tape_01002';
const TEX_BASE = '/assets/cassette/';

// ── Per-variant texture cache ──
// Textures are shared across every tape that uses the same variant. 14
// variants max, never disposed. This also stops GPU memory from growing
// each time a tape mounts/unmounts.
export interface VariantTextures {
  baseColor: THREE.Texture;
  metallic: THREE.Texture;
  roughness: THREE.Texture;
  normal: THREE.Texture;
}
const variantTexCache = new Map<string, Promise<VariantTextures>>();

function loadVariantTextures(variant: string): Promise<VariantTextures> {
  const cached = variantTexCache.get(variant);
  if (cached) return cached;
  const loader = new THREE.TextureLoader();
  const basePrefix = `${TEX_BASE}audio_cassette_${variant}_`;
  // Variant 'd' and beyond only have BaseColor — use 'a' for other PBR maps.
  const pbrFallback = !['a', 'b', 'c'].includes(variant);
  const pbrPrefix = pbrFallback ? `${TEX_BASE}audio_cassette_a_` : basePrefix;
  const p = Promise.all([
    loader.loadAsync(`${basePrefix}BaseColor.png`),
    loader.loadAsync(`${pbrPrefix}Metallic.png`),
    loader.loadAsync(`${pbrPrefix}Roughness.png`),
    loader.loadAsync(`${pbrPrefix}Normal.png`),
  ]).then(([baseColor, metallic, roughness, normal]) => {
    baseColor.colorSpace = THREE.SRGBColorSpace;
    metallic.colorSpace = THREE.NoColorSpace;
    roughness.colorSpace = THREE.NoColorSpace;
    normal.colorSpace = THREE.NoColorSpace;
    [baseColor, metallic, roughness, normal].forEach(t => { t.needsUpdate = true; });
    return { baseColor, metallic, roughness, normal };
  });
  variantTexCache.set(variant, p);
  // On error, evict so a later mount can retry.
  p.catch(e => { console.error('Failed to load cassette textures:', e); variantTexCache.delete(variant); });
  return p;
}

// Load PBR textures for a variant. Cached per-variant so all tapes sharing
// the same variant reuse the same GPU textures.
export function useVariantTextures(variant: string) {
  const [textures, setTextures] = useState<VariantTextures | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadVariantTextures(variant).then(tex => {
      if (!cancelled) setTextures(tex);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [variant]);

  return textures;
}

// 3D cassette from FBX
function TapeFBX({ tape, variantOverride }: { tape: Tape; variantOverride?: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const [scene, setScene] = useState<THREE.Group | null>(null);

  // Pick variant based on tape seed, or use override
  const seed = tape.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const variantIdx = variantOverride !== undefined ? variantOverride : seed % VARIANTS.length;
  const variant = VARIANTS[variantIdx];
  const meshName = TAPE_MESH_NAME;

  const textures = useVariantTextures(variant);

  // Load FBX manually
  useEffect(() => {
    const loader = new FBXLoader();
    loader.load(
      `${TEX_BASE}audio_cassettes.fbx`,
      (fbx) => {
        setScene(fbx);
      },
      undefined,
      (err) => console.error('[FBX] Load error:', err),
    );
  }, []);

  // Apply PBR materials when textures load
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
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        } else {
          mesh.visible = false;
        }
      }
    });
  }, [scene, textures, meshName]);

  // Hide non-matching meshes before textures load
  useEffect(() => {
    if (!scene) return;
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).visible = (child as THREE.Mesh).name === meshName;
      }
    });
  }, [scene, meshName]);

  // Subtle idle wobble
  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.x = -0.3 + Math.sin(state.clock.elapsedTime * 0.5) * 0.02;
    groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.3) * 0.01;
  });

  if (!scene) return null;

  // Model is ~27 units wide, scale up a bit from before
  const s = 0.12;

  return (
    <group ref={groupRef} rotation={[-0.3, 0.15, 0]} scale={[s, s, s]} position={[0, -0.1, 0.16]}>
      <primitive object={scene} />
    </group>
  );
}

// ── Shared FBX cache ──
let fbxCache: THREE.Group | null = null;
let fbxLoading: Promise<THREE.Group> | null = null;

export function loadFBXCached(): Promise<THREE.Group> {
  if (fbxCache) return Promise.resolve(fbxCache);
  if (fbxLoading) return fbxLoading;
  fbxLoading = new Promise((resolve, reject) => {
    const loader = new FBXLoader();
    loader.load(
      `${TEX_BASE}audio_cassettes.fbx`,
      (fbx) => { fbxCache = fbx; resolve(fbx); },
      undefined,
      reject,
    );
  });
  return fbxLoading;
}

// ── Physics tape body using FBX ──

function TapeFBXBody({ tape, position, rotation }: {
  tape: Tape;
  position: [number, number, number];
  rotation: number;
}) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const [scene, setScene] = useState<THREE.Group | null>(null);

  const seed = tape.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const variant = VARIANTS[seed % VARIANTS.length];
  const meshName = TAPE_MESH_NAME;
  const textures = useVariantTextures(variant);

  // Load and clone FBX
  useEffect(() => {
    loadFBXCached().then(fbx => setScene(fbx.clone()));
  }, []);

  // Apply materials
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
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        } else {
          mesh.visible = false;
        }
      }
    });
  }, [scene, textures, meshName]);

  // Hide non-matching on first load
  useEffect(() => {
    if (!scene) return;
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).visible = (child as THREE.Mesh).name === meshName;
      }
    });
  }, [scene, meshName]);

  if (!scene) return null;

  const s = 0.3;
  const angleRad = (rotation * Math.PI) / 180 + Math.PI;

  return (
    <RigidBody
      ref={bodyRef}
      position={position}
      rotation={[0, angleRad, 0]}
      type="dynamic"
      colliders={false}
      linearDamping={1.5}
      angularDamping={2}
      mass={0.5}
      restitution={0.15}
      friction={0.6}
    >
      <CuboidCollider args={[1.17, 0.13, 0.72]} />
      <group scale={[s, s, s]}>
        <primitive object={scene} />
      </group>
    </RigidBody>
  );
}

// ── 3D overlay scene for 2D table ──

function OverlayCamera() {
  const { camera, gl } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = camera as THREE.PerspectiveCamera;
      cam.position.y = THREE.MathUtils.clamp(cam.position.y + e.deltaY * 0.02, 5, 40);
      cam.updateProjectionMatrix();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [camera, gl]);
  return null;
}

function OverlayScene({ tapes }: { tapes: Tape[] }) {
  return (
    <>
      <OverlayCamera />
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 15, -2]} intensity={1.0} />

      <Physics gravity={[0, -30, 0]} timeStep={1 / 60}>
        <TableSurface />

        {/* Tape bodies */}
        {tapes.map(tape => {
          const [x3d, z3d] = to3D(tape.x ?? 500, tape.y ?? 500);
          return (
            <TapeFBXBody
              key={tape.id}
              tape={tape}
              position={[x3d, 3, z3d]}
              rotation={tape.angle ?? 0}
            />
          );
        })}
      </Physics>
    </>
  );
}

const NEW_TEX_BASE = '/assets/cassette_new/Textures/';

function loadPBR(prefix: string, hasOpacity = false) {
  const loader = new THREE.TextureLoader();
  const maps = {
    map: loader.load(`${prefix}BaseColor.png`),
    metalnessMap: loader.load(`${prefix}Metallic.png`),
    roughnessMap: loader.load(`${prefix}Roughness.png`),
    normalMap: loader.load(`${prefix}Normal.png`),
    alphaMap: hasOpacity ? loader.load(`${prefix}opacity.png`) : undefined,
  };
  maps.map.colorSpace = THREE.SRGBColorSpace;
  return maps;
}

export function NewTapeFBXTest({ position = [0, 0, 0] as [number, number, number], variant = '01', targetWidth = 7 }: {
  position?: [number, number, number];
  variant?: string;
  targetWidth?: number;
}) {
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const [autoScale, setAutoScale] = useState(1);

  useEffect(() => {
    const loader = new FBXLoader();
    loader.load('/assets/cassette_new/tape.FBX', (fbx) => {
      const bodyMaps = loadPBR(`${NEW_TEX_BASE}${variant}/${variant}_`);
      const lineMaps = loadPBR(`${NEW_TEX_BASE}LINE03_`);
      const glassMaps = loadPBR(`${NEW_TEX_BASE}glass_`, true);

      const bodyMat = new THREE.MeshStandardMaterial({ ...bodyMaps, metalness: 0.2, roughness: 0.7 });
      const lineMat = new THREE.MeshStandardMaterial({ ...lineMaps, metalness: 0.1, roughness: 0.8 });
      const glassMat = new THREE.MeshStandardMaterial({
        ...glassMaps,
        metalness: 0.1,
        roughness: 0.15,
        transparent: true,
        depthWrite: false,
      });

      const box = new THREE.Box3().setFromObject(fbx);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      // Recenter: translate every mesh so the bbox center sits at the FBX origin.
      fbx.position.sub(center);
      const longest = Math.max(size.x, size.y, size.z);
      const s = longest > 0 ? targetWidth / longest : 1;
      setAutoScale(s);

      fbx.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const lname = mesh.name.toLowerCase();
        if (lname.includes('glass')) mesh.material = glassMat;
        else if (lname.includes('line')) mesh.material = lineMat;
        else mesh.material = bodyMat;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      });
      setScene(fbx);
    }, undefined, (err) => console.error('[NewTapeFBXTest] load error', err));
  }, [variant, targetWidth]);

  if (!scene) return null;
  return (
    <group position={position} scale={[autoScale, autoScale, autoScale]}>
      <primitive object={scene} />
      {/* Debug: red wireframe box at origin so we can spot the slot even if model is invisible */}
      <mesh>
        <boxGeometry args={[1 / autoScale, 1 / autoScale, 1 / autoScale]} />
        <meshBasicMaterial color="red" wireframe />
      </mesh>
    </group>
  );
}


