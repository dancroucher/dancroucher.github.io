import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Tape } from './types';
import { loadFBXCached, useVariantTextures, VARIANTS, VARIANT_TO_MESH } from './Tape3D';

// Reuse stampTitle from TapeBody
import { stampTitle } from './TapeBody';

// Render the 2D spool SVG to a canvas texture (cached)
let spoolTexture: THREE.CanvasTexture | null = null;

function getSpoolTexture(color = '#e8dcc4'): THREE.CanvasTexture {
  if (spoolTexture) return spoolTexture;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Scale from 32x32 SVG viewBox to 128x128
  const s = size / 32;
  const cx = 16 * s;
  const cy = 16 * s;
  const ringR = 12 * s;
  const strokeW = 2.8 * s;
  const innerR = (12 - 2.8 / 2) * s;
  const toothW = 2.7 * s;
  const toothL = 3.24 * s;

  // Transparent background
  ctx.clearRect(0, 0, size, size);

  // Outer ring
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeW;
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.stroke();

  // 6 teeth
  ctx.fillStyle = color;
  for (const angle of [0, 60, 120, 180, 240, 300]) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((angle * Math.PI) / 180);
    const rx = -toothW / 2;
    const ry = -innerR;
    ctx.fillRect(rx, ry, toothW, toothL);
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  spoolTexture = tex;
  return tex;
}

// Spool disc — a textured cylinder sitting in the cassette hub hole
function SpoolDisc({ x, z, halfY, spinning, rpm, color }: { x: number; z: number; halfY: number; spinning?: boolean; rpm?: number; color?: string }) {
  const ref = useRef<THREE.Mesh>(null);
  const radius = 0.605;
  const thickness = 0.08;
  const tex = getSpoolTexture(color);

  useFrame((_, delta) => {
    if (ref.current && spinning) {
      ref.current.rotation.z += (rpm || 10) * Math.PI * 2 * delta / 60;
    }
  });

  return (
    <mesh ref={ref} position={[x, halfY + thickness / 2 + 0.01, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[radius, 32]} />
      <meshStandardMaterial
        map={tex}
        transparent
        alphaTest={0.1}
        metalness={0.1}
        roughness={0.5}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function DeckTapeMesh({ tape, playing }: { tape: Tape; playing?: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const [halfY, setHalfY] = useState(0.8);

  const seed = tape.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const variant = (tape.textureVariant as typeof VARIANTS[number]) || VARIANTS[seed % VARIANTS.length];
  const meshName = VARIANT_TO_MESH['a'];
  const textures = useVariantTextures(variant);

  useEffect(() => {
    loadFBXCached().then(fbx => {
      const clone = fbx.clone();
      // Find target mesh, hide others
      let target: THREE.Mesh | null = null;
      clone.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const m = child as THREE.Mesh;
          if (m.name === meshName) {
            m.visible = true;
            target = m;
          } else {
            m.visible = false;
          }
        }
      });
      // Bake world transform and center
      if (target) {
        const m = target as THREE.Mesh;
        m.updateWorldMatrix(true, false);
        const geo = m.geometry.clone();
        geo.applyMatrix4(m.matrixWorld);
        const box = new THREE.Box3().setFromBufferAttribute(geo.attributes.position as THREE.BufferAttribute);
        const center = box.getCenter(new THREE.Vector3());
        geo.translate(-center.x, -center.y, -center.z);
        const size = box.getSize(new THREE.Vector3());
        const newMesh = new THREE.Mesh(geo, m.material);
        newMesh.name = meshName;
        const group = new THREE.Group();
        group.add(newMesh);
        setHalfY(size.y / 2);
        setScene(group);
      }
    });
  }, [meshName]);

  // Apply PBR materials with title
  useEffect(() => {
    if (!scene || !textures) return;
    const colorMap = tape.title ? stampTitle(textures.baseColor, tape.title, variant) : textures.baseColor;
    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).material = new THREE.MeshStandardMaterial({
          map: colorMap,
          metalness: 0.0,
          roughness: 0.75,
          normalMap: textures.normal,
          normalScale: new THREE.Vector2(0.5, 0.5),
          envMapIntensity: 0.3,
        });
      }
    });
  }, [scene, textures, tape.title]);

  if (!scene) return null;

  // Scale to fill the view — model is ~27 units wide, we want it to fit in the orthographic frustum
  const s = 1;

  return (
    <group ref={groupRef} rotation={[0, Math.PI, 0]} scale={[s, s, s]}>
      <primitive object={scene} />
      <SpoolDisc x={-2.1} z={0.3} halfY={halfY} spinning={playing} rpm={15} />
      <SpoolDisc x={2.1} z={0.3} halfY={halfY} spinning={playing} rpm={30} />
    </group>
  );
}

export function DeckTape3D({ tape, playing, loading }: { tape: Tape; playing?: boolean; loading?: boolean }) {
  return (
    <div style={{ width: 234, height: 143, position: 'relative' }}>
      <Canvas
        orthographic
        camera={{
          position: [0, 50, 0],
          near: 0.1,
          far: 200,
          up: [0, 0, -1],
          zoom: 1,
        }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
        style={{ background: 'transparent' }}
        onCreated={({ camera }) => {
          const cam = camera as THREE.OrthographicCamera;
          // Model is ~27 units wide, ~17 units deep — fit into 234x143 viewport
          // Set frustum so 27 units fills the width
          const aspect = 234 / 143;
          const halfW = 5.25;
          const halfH = halfW / aspect;
          cam.left = -halfW;
          cam.right = halfW;
          cam.top = halfH;
          cam.bottom = -halfH;
          cam.updateProjectionMatrix();
          cam.lookAt(0, 0, 0);
        }}
      >
        <ambientLight intensity={0.9} color="#fffaf6" />
        <directionalLight position={[4, 20, -3]} intensity={1.5} color="#fff0e6" />
        <pointLight position={[-4, 5, -2]} intensity={0.3} color="#ffe8d6" />
        <DeckTapeMesh tape={tape} playing={playing} />
      </Canvas>
      {/* Loading spinner overlay */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 4,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10,
        }}>
          <div style={{
            width: 24, height: 24,
            border: '3px solid rgba(255,255,255,0.2)',
            borderTopColor: '#e8c840',
            borderRadius: '50%',
            animation: 'tape-loading-spin 0.8s linear infinite',
          }} />
        </div>
      )}
    </div>
  );
}
