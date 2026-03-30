import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import type { Track } from './TrackList';

// Render mixtape label to canvas, return as THREE.CanvasTexture
function buildLabelTexture(name: string, trackCount: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Background — dark cassette label
  ctx.fillStyle = '#1a1208';
  ctx.fillRect(0, 0, 512, 256);

  // Sides — lighter
  ctx.fillStyle = '#2a1e0e';
  ctx.fillRect(0, 0, 30, 256);
  ctx.fillRect(482, 0, 30, 256);

  // Top/bottom bars
  ctx.fillStyle = '#1a1208';
  ctx.fillRect(30, 0, 452, 20);
  ctx.fillRect(30, 236, 452, 20);

  // Border
  ctx.strokeStyle = '#c9a84c';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(1, 1, 510, 254);

  // Header
  ctx.fillStyle = '#c9a84c';
  ctx.font = "bold 14px 'Courier New'";
  ctx.textAlign = 'center';
  ctx.fillText('M I X T A P E', 256, 40);

  // Divider
  ctx.strokeStyle = 'rgba(201,168,76,0.4)';
  ctx.beginPath();
  ctx.moveTo(40, 52);
  ctx.lineTo(472, 52);
  ctx.stroke();

  // Name
  ctx.fillStyle = '#e8d5b0';
  ctx.font = "bold 20px 'Courier New'";
  const maxName = 28;
  const displayName = name.length > maxName ? name.slice(0, maxName - 1) + '…' : name;
  ctx.fillText(displayName, 256, 85);

  // Track count
  ctx.fillStyle = 'rgba(201,168,76,0.7)';
  ctx.font = "12px 'Courier New'";
  ctx.fillText(`${trackCount} tracks`, 256, 110);

  // Spindle holes
  const holeY = 180;
  const holeRadius = 22;
  ctx.fillStyle = '#0a0805';
  ctx.strokeStyle = '#c9a84c';
  ctx.lineWidth = 1.5;
  [[130, holeY], [382, holeY]].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, holeRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, holeRadius - 6, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Bottom text
  ctx.fillStyle = 'rgba(201,168,76,0.4)';
  ctx.font = "10px 'Courier New'";
  ctx.fillText('jeem-fm', 256, 230);

  return new THREE.CanvasTexture(canvas);
}

// A simple 3D cassette box
function CassetteBody({ texture }: { texture: THREE.CanvasTexture }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.25) * 0.08;
  });

  return (
    <mesh ref={meshRef} castShadow receiveShadow>
      <boxGeometry args={[3.2, 0.25, 2.0]} />
      <meshStandardMaterial
        map={texture}
        metalness={0.0}
        roughness={0.6}
      />
    </mesh>
  );
}

// Spools — two toothed circles
function Spool({ x }: { x: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.z += delta * 1.5;
  });
  return (
    <group position={[x, 0.15, 0]}>
      <group ref={ref}>
        <mesh>
          <ringGeometry args={[0.1, 0.28, 16]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.8} />
        </mesh>
        {[0, 60, 120, 180, 240, 300].map((deg, i) => (
          <mesh key={i} rotation={[0, 0, (deg * Math.PI) / 180]} position={[0.19 * Math.cos((deg * Math.PI) / 180), 0.19 * Math.sin((deg * Math.PI) / 180), 0]}>
            <boxGeometry args={[0.04, 0.18, 0.02]} />
            <meshStandardMaterial color="#2a2a2a" roughness={0.7} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function MixtapeTape3D({ name, trackCount }: { name: string; trackCount: number }) {
  const [texture] = useState(() => buildLabelTexture(name, trackCount));

  return (
    <Canvas
      camera={{ position: [0, 2.5, 4.5], fov: 40 }}
      gl={{ antialias: true, alpha: true }}
      shadows
      style={{ width: '100%', height: '100%', background: 'transparent' }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 6, 4]} intensity={1.2} castShadow />
      <pointLight position={[-2, 2, 2]} intensity={0.4} color="#ffeedd" />
      <Environment preset="studio" />

      <group rotation={[-0.3, 0.2, 0]}>
        <CassetteBody texture={texture} />
        <Spool x={-0.9} />
        <Spool x={0.9} />
      </group>
    </Canvas>
  );
}
