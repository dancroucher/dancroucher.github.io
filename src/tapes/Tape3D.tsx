import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { createRoot } from 'react-dom/client';
import { CassetteTape } from './CassetteTape';
import { Tape } from './types';
import html2canvas from 'html2canvas';

// Render a CassetteTape component offscreen and return a texture
function useTapeTexture(tape: Tape) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    document.body.appendChild(container);

    const root = createRoot(container);
    root.render(<CassetteTape tape={tape} />);

    // Wait for render + fonts
    setTimeout(async () => {
      try {
        const canvas = await html2canvas(container, {
          backgroundColor: null,
          scale: 2,
          useCORS: true,
        });
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        setTexture(tex);
      } catch (e) {
        console.error('Tape texture render failed:', e);
      } finally {
        root.unmount();
        document.body.removeChild(container);
      }
    }, 300);

    return () => {
      try { root.unmount(); } catch {}
      try { document.body.removeChild(container); } catch {}
    };
  }, [tape.id, tape.tapeStyle]);

  return texture;
}

// 3D cassette box
function TapeBox({ tape }: { tape: Tape }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const texture = useTapeTexture(tape);

  // Cassette proportions: 234x143px → scale to 3D units, with ~8px depth
  const width = 2.34;
  const height = 1.43;
  const depth = 0.12;

  // Subtle idle wobble
  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.x = -0.3 + Math.sin(state.clock.elapsedTime * 0.5) * 0.02;
    meshRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.3) * 0.01;
  });

  const materials = useMemo(() => {
    const side = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.8 });
    if (!texture) {
      const placeholder = new THREE.MeshStandardMaterial({ color: '#333' });
      return [side, side, side, side, placeholder, side]; // +x,-x,+y,-y,+z,-z
    }
    const front = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6, metalness: 0.05 });
    const back = new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.9 });
    // Box faces: +x, -x, +y, -y, +z (front), -z (back)
    return [side, side, side, side, front, back];
  }, [texture]);

  return (
    <mesh ref={meshRef} rotation={[-0.3, 0.15, 0]} castShadow receiveShadow>
      <boxGeometry args={[width, height, depth]} />
      {materials.map((mat, i) => (
        <primitive key={i} object={mat} attach={`material-${i}`} />
      ))}
    </mesh>
  );
}

// Demo scene with one tape
export function Tape3DDemo({ tape }: { tape: Tape }) {
  return (
    <div style={{
      width: 400,
      height: 300,
      borderRadius: 8,
      overflow: 'hidden',
      background: '#0a0a0a',
    }}>
      <Canvas
        shadows
        camera={{ position: [0, 0, 3.5], fov: 45 }}
        gl={{ antialias: true }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[2, 3, 4]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <pointLight position={[-2, 1, 2]} intensity={0.3} color="#ffeedd" />
        <TapeBox tape={tape} />
        <OrbitControls
          enablePan={false}
          enableZoom={true}
          minDistance={2}
          maxDistance={6}
          autoRotate
          autoRotateSpeed={1}
        />
      </Canvas>
    </div>
  );
}
