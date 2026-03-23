import React, { useMemo } from 'react';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { TABLE_W, TABLE_H, VISUAL_W, VISUAL_H, TILE_W, TILE_H, ACTIVE_W, ACTIVE_H, DRAG_BOUND_X, DRAG_BOUND_Z } from './coords';

const WALL_HEIGHT = 4;
const WALL_THICKNESS = 0.5;

// Debug grid: draw lines at tile boundaries
function DebugGrid() {
  const lines = useMemo(() => {
    const pts: [THREE.Vector3, THREE.Vector3, string][] = [];
    const hw = TABLE_W / 2;
    const hh = TABLE_H / 2;
    const ahw = ACTIVE_W / 2;
    const ahh = ACTIVE_H / 2;
    const dhw = DRAG_BOUND_X;
    const dhh = DRAG_BOUND_Z;
    const y = 0.01;

    // Tile grid lines (yellow)
    for (let x = -hw; x <= hw + 0.01; x += TILE_W) {
      pts.push([new THREE.Vector3(x, y, -hh), new THREE.Vector3(x, y, hh), '#ffff00']);
    }
    for (let z = -hh; z <= hh + 0.01; z += TILE_H) {
      pts.push([new THREE.Vector3(-hw, y, z), new THREE.Vector3(hw, y, z), '#ffff00']);
    }

    // Active area outline (green)
    pts.push([new THREE.Vector3(-ahw, y + 0.01, -ahh), new THREE.Vector3(ahw, y + 0.01, -ahh), '#00ff00']);
    pts.push([new THREE.Vector3(ahw, y + 0.01, -ahh), new THREE.Vector3(ahw, y + 0.01, ahh), '#00ff00']);
    pts.push([new THREE.Vector3(ahw, y + 0.01, ahh), new THREE.Vector3(-ahw, y + 0.01, ahh), '#00ff00']);
    pts.push([new THREE.Vector3(-ahw, y + 0.01, ahh), new THREE.Vector3(-ahw, y + 0.01, -ahh), '#00ff00']);

    // Drag bounds (cyan)
    pts.push([new THREE.Vector3(-dhw, y + 0.02, -dhh), new THREE.Vector3(dhw, y + 0.02, -dhh), '#00ffff']);
    pts.push([new THREE.Vector3(dhw, y + 0.02, -dhh), new THREE.Vector3(dhw, y + 0.02, dhh), '#00ffff']);
    pts.push([new THREE.Vector3(dhw, y + 0.02, dhh), new THREE.Vector3(-dhw, y + 0.02, dhh), '#00ffff']);
    pts.push([new THREE.Vector3(-dhw, y + 0.02, dhh), new THREE.Vector3(-dhw, y + 0.02, -dhh), '#00ffff']);

    return pts;
  }, []);

  return (
    <>
      {lines.map(([a, b, color], i) => {
        const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
        return (
          <lineSegments key={i} geometry={geo}>
            <lineBasicMaterial color={color} />
          </lineSegments>
        );
      })}
    </>
  );
}

export function TableSurface() {
  const woodTexture = useLoader(THREE.TextureLoader, '/table-wood.jpg');

  const material = useMemo(() => {
    woodTexture.wrapS = woodTexture.wrapT = THREE.RepeatWrapping;
    // 1 tile = 1 texture repeat, matching wood texture aspect ratio
    woodTexture.repeat.set(VISUAL_W / TILE_W, VISUAL_H / TILE_H);
    woodTexture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({
      map: woodTexture,
      roughness: 0.85,
      metalness: 0.0,
      color: '#ffffff',
    });
  }, [woodTexture]);

  return (
    <group>
      {/* Table surface — static rigid body */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[VISUAL_W / 2, 0.5, VISUAL_H / 2]} position={[0, -0.5, 0]} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[VISUAL_W, VISUAL_H]} />
          <primitive object={material} attach="material" />
        </mesh>
      </RigidBody>

      {/* Edge walls — invisible colliders */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[TABLE_W / 2, WALL_HEIGHT / 2, WALL_THICKNESS / 2]} position={[0, WALL_HEIGHT / 2, -TABLE_H / 2 - WALL_THICKNESS / 2]} />
        <CuboidCollider args={[TABLE_W / 2, WALL_HEIGHT / 2, WALL_THICKNESS / 2]} position={[0, WALL_HEIGHT / 2, TABLE_H / 2 + WALL_THICKNESS / 2]} />
        <CuboidCollider args={[WALL_THICKNESS / 2, WALL_HEIGHT / 2, TABLE_H / 2]} position={[-TABLE_W / 2 - WALL_THICKNESS / 2, WALL_HEIGHT / 2, 0]} />
        <CuboidCollider args={[WALL_THICKNESS / 2, WALL_HEIGHT / 2, TABLE_H / 2]} position={[TABLE_W / 2 + WALL_THICKNESS / 2, WALL_HEIGHT / 2, 0]} />
      </RigidBody>

      {/* Light overlay on active 3×3 area */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <planeGeometry args={[ACTIVE_W, ACTIVE_H]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.4} />
      </mesh>
      {/* Darker border — 1 tile around active area (left) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-(ACTIVE_W / 2 + TILE_W / 2), 0.002, 0]}>
        <planeGeometry args={[TILE_W, TABLE_H]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.7} />
      </mesh>
      {/* Right */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(ACTIVE_W / 2 + TILE_W / 2), 0.002, 0]}>
        <planeGeometry args={[TILE_W, TABLE_H]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.7} />
      </mesh>
      {/* Top (between left/right borders) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, -(ACTIVE_H / 2 + TILE_H / 2)]}>
        <planeGeometry args={[ACTIVE_W, TILE_H]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.7} />
      </mesh>
      {/* Bottom */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, (ACTIVE_H / 2 + TILE_H / 2)]}>
        <planeGeometry args={[ACTIVE_W, TILE_H]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.7} />
      </mesh>

      {/* <DebugGrid /> */}
    </group>
  );
}
