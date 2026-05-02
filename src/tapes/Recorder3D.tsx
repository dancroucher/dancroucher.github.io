import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { TAPE_W } from './coords';

// Fit the recorder's longest horizontal axis to this many world units.
const DEFAULT_TARGET_WIDTH = TAPE_W * 2.5;

// Small rest buffer so the recorder sits above TableSurface's dark overlay (y=0.02).
const REST_LIFT = 0.05;

const RECORDER_URL = '/assets/recorder/gltf/cassetterecorder.glb';

// ── Shared cache ──
let recorderCache: Promise<THREE.Group> | null = null;
function loadRecorderCached(): Promise<THREE.Group> {
  if (recorderCache) return recorderCache;
  recorderCache = new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.load(
      RECORDER_URL,
      (gltf) => {
        console.log('[Recorder3D] GLB loaded');
        resolve(gltf.scene);
      },
      (evt) => {
        if (evt.lengthComputable) {
          console.log('[Recorder3D] loading', Math.round((evt.loaded / evt.total) * 100) + '%');
        }
      },
      (err) => {
        console.error('[Recorder3D] load error:', err);
        reject(err);
      },
    );
  });
  return recorderCache;
}

export interface Recorder3DProps {
  /** World position (3D units). Default origin — centre of the table. */
  position?: [number, number, number];
  /** Rotation around X axis, radians (tilt forward/back). */
  rotationX?: number;
  /** Rotation around Y axis, radians. */
  rotationY?: number;
  /** Target world-unit width. Default = 2.5 × TAPE_W. */
  targetWidth?: number;
  /** Whether the cassette lid is flipped open. Defaults to true for now. */
  lidOpen?: boolean;
  /** Fully-open lid angle in radians. Negative = lifts toward the viewer. */
  lidOpenAngle?: number;
  /** When true, fade recorder + shadows out — matches TapeBody's UI-hide fade. */
  hidden?: boolean;
  /** Fires once the GLB has loaded and the recorder is mounted in the scene. */
  onReady?: () => void;
}

interface LoadedRecorder {
  group: THREE.Group;
  size: THREE.Vector3; // scaled bbox size, used for the collider
  lidPivot: THREE.Object3D | null;
  materials: THREE.Material[];
}

export function Recorder3D({
  position = [0, 0, 0],
  rotationX = 0,
  rotationY = 0,
  targetWidth = DEFAULT_TARGET_WIDTH,
  lidOpen: lidOpenProp = false,
  lidOpenAngle = -Math.PI / 4,
  hidden = false,
  onReady,
}: Recorder3DProps) {
  const [loaded, setLoaded] = useState<LoadedRecorder | null>(null);
  const opacityRef = useRef(1);
  const groupRef = useRef<THREE.Group | null>(null);
  // Local state so a click on the recorder can toggle the lid for diagnosis.
  const [lidOpen, setLidOpen] = useState(lidOpenProp);

  // Sync prop → state so parent can drive the lid (e.g. open while a tape hovers).
  useEffect(() => {
    setLidOpen(lidOpenProp);
  }, [lidOpenProp]);

  useEffect(() => {
    let cancelled = false;
    loadRecorderCached()
      .then((scene) => {
        if (cancelled) return;
        const clone = scene.clone(true);

        // Debug: raw bbox + mesh names.
        const rawBox = new THREE.Box3().setFromObject(clone);
        const rawSize = rawBox.getSize(new THREE.Vector3());
        const rawCenter = rawBox.getCenter(new THREE.Vector3());
        console.log(
          '[Recorder3D] raw bbox size:',
          rawSize.x.toFixed(2), rawSize.y.toFixed(2), rawSize.z.toFixed(2),
          'center:', rawCenter.x.toFixed(2), rawCenter.y.toFixed(2), rawCenter.z.toFixed(2),
        );

        const meshNames: string[] = [];
        clone.traverse((c) => {
          if ((c as THREE.Mesh).isMesh) meshNames.push(c.name);
        });
        console.log('[Recorder3D] mesh parts:', meshNames);

        const materials: THREE.Material[] = [];
        clone.traverse((child) => {
          const m = child as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
            // Clone materials so per-instance opacity tweens don't leak across
            // other uses of the cached GLTF scene.
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            const cloned = mats.map((mat) => {
              const c = mat.clone();
              c.transparent = true;
              c.opacity = 1;
              return c;
            });
            m.material = cloned.length === 1 ? cloned[0] : cloned;
            materials.push(...cloned);
          }
        });

        // Scale so the LONGER horizontal axis matches targetWidth.
        const horizontalMax = Math.max(rawSize.x, rawSize.z);
        const scale = targetWidth / horizontalMax;
        clone.scale.setScalar(scale);

        // Centre the model horizontally (X,Z) on local origin and set its base
        // at y = REST_LIFT, so the collider half-extents line up cleanly.
        clone.updateMatrixWorld(true);
        const scaledBox = new THREE.Box3().setFromObject(clone);
        const scaledSize = scaledBox.getSize(new THREE.Vector3());
        const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
        clone.position.x -= scaledCenter.x;
        clone.position.z -= scaledCenter.z;
        clone.position.y += REST_LIFT - scaledBox.min.y;

        // Refresh world matrices after the reposition so child bboxes are correct.
        clone.updateMatrixWorld(true);

        // Wrap the cassette lid in a pivot group at its hinge edge so we can animate
        // it opening. Hinge is along the -Z edge of the lid (opposite the +Z button
        // face); making the pivot a direct child of `clone` keeps its local X axis
        // aligned with world X, so rotation.x rotates around the hinge.
        let lidPivot: THREE.Object3D | null = null;
        const lidMesh = clone.getObjectByName('tapelid_low');
        if (lidMesh) {
          const lidBox = new THREE.Box3().setFromObject(lidMesh);
          const hingeWorld = new THREE.Vector3(
            (lidBox.min.x + lidBox.max.x) / 2,
            lidBox.min.y,
            lidBox.min.z,
          );
          const pivot = new THREE.Group();
          pivot.name = '__lidPivot';
          pivot.position.copy(clone.worldToLocal(hingeWorld.clone()));
          clone.add(pivot);
          pivot.attach(lidMesh); // preserves the lid's current world transform
          lidPivot = pivot;
          console.log(
            '[Recorder3D] lid pivot wrapped — hinge world:',
            hingeWorld.x.toFixed(2), hingeWorld.y.toFixed(2), hingeWorld.z.toFixed(2),
            'local:', pivot.position.x.toFixed(2), pivot.position.y.toFixed(2), pivot.position.z.toFixed(2),
          );
        } else {
          console.warn('[Recorder3D] tapelid_low not found — lid animation disabled');
        }

        console.log(
          '[Recorder3D] scale:', scale.toFixed(4),
          'scaled size:', scaledSize.x.toFixed(2), scaledSize.y.toFixed(2), scaledSize.z.toFixed(2),
          'centred at:', clone.position.x.toFixed(2), clone.position.y.toFixed(2), clone.position.z.toFixed(2),
        );

        setLoaded({ group: clone as unknown as THREE.Group, size: scaledSize, lidPivot, materials });
        onReady?.();
      })
      .catch(() => {/* already logged */});
    return () => { cancelled = true; };
  }, [targetWidth]);

  // Smoothly ease the lid toward its target angle each frame. Rate 8 gives a
  // ~0.4s tween — snaps open crisply while a tape is dragged over.
  useFrame((_, dt) => {
    const pivot = loaded?.lidPivot;
    if (pivot) {
      const target = lidOpen ? lidOpenAngle : 0;
      const k = 1 - Math.exp(-dt * 8);
      pivot.rotation.x += (target - pivot.rotation.x) * k;
    }

    // UI fade — tween opacity, drop shadow-casting early so shadows lead the
    // body transition, hide the group entirely once effectively clear.
    const mats = loaded?.materials;
    if (mats && mats.length) {
      const target = hidden ? 0 : 1;
      const k = 1 - Math.exp(-dt * 4.5);
      opacityRef.current += (target - opacityRef.current) * k;
      for (const m of mats) m.opacity = opacityRef.current;
      // Keep cast-shadow on almost until the mesh is gone so the shadow tracks
      // the body's fade; threshold is only to kill the orphan shadow at the end.
      const castOn = opacityRef.current > 0.05;
      loaded?.group.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh) mesh.castShadow = castOn;
      });
      const g = groupRef.current;
      if (g) g.visible = opacityRef.current > 0.02;
    }
  });

  if (!loaded) return null;

  const { group, size } = loaded;
  // Collider sits at the model's centre in the body's local frame.
  const colliderY = REST_LIFT + size.y / 2;

  return (
    <RigidBody
      type="fixed"
      position={position}
      rotation={[rotationX, rotationY, 0]}
      colliders={false}
    >
      <CuboidCollider
        args={[size.x / 2, size.y / 2, size.z / 2]}
        position={[0, colliderY, 0]}
      />
      <group ref={groupRef}>
        <primitive object={group} />
      </group>
    </RigidBody>
  );
}
