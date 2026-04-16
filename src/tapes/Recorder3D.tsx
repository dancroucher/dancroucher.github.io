import React, { useEffect, useState } from 'react';
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
}

interface LoadedRecorder {
  group: THREE.Group;
  size: THREE.Vector3; // scaled bbox size, used for the collider
}

export function Recorder3D({
  position = [0, 0, 0],
  rotationX = 0,
  rotationY = 0,
  targetWidth = DEFAULT_TARGET_WIDTH,
}: Recorder3DProps) {
  const [loaded, setLoaded] = useState<LoadedRecorder | null>(null);

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

        clone.traverse((child) => {
          const m = child as THREE.Mesh;
          if (m.isMesh) {
            m.castShadow = true;
            m.receiveShadow = true;
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

        console.log(
          '[Recorder3D] scale:', scale.toFixed(4),
          'scaled size:', scaledSize.x.toFixed(2), scaledSize.y.toFixed(2), scaledSize.z.toFixed(2),
          'centred at:', clone.position.x.toFixed(2), clone.position.y.toFixed(2), clone.position.z.toFixed(2),
        );

        setLoaded({ group: clone as unknown as THREE.Group, size: scaledSize });
      })
      .catch(() => {/* already logged */});
    return () => { cancelled = true; };
  }, [targetWidth]);

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
      <primitive object={group} />
    </RigidBody>
  );
}
