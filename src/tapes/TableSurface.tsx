import React, { useMemo } from 'react';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { TABLE_W, TABLE_H, VISUAL_W, VISUAL_H, TILE_W, TILE_H, ACTIVE_W, ACTIVE_H, DRAG_BOUND_X, DRAG_BOUND_Z, TAPE_W, TAPE_H } from './coords';

const WALL_HEIGHT = 4;
const WALL_THICKNESS = 0.5;

// Extra-wide surface to cover ultrawide viewports (cosmetic only)
const SURFACE_W = VISUAL_W * 3;
const SURFACE_H = VISUAL_H * 2;

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
  const woodTexture = useLoader(THREE.TextureLoader, '/wood-table-alt.jpg');

  const material = useMemo(() => {
    woodTexture.wrapS = woodTexture.wrapT = THREE.RepeatWrapping;
    // 1 tile = 1 texture repeat, matching wood texture aspect ratio
    woodTexture.repeat.set(SURFACE_W / TILE_W, SURFACE_H / TILE_H);
    woodTexture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({
      map: woodTexture,
      roughness: 1.0,
      metalness: 0.0,
      color: '#ffffff',
    });
  }, [woodTexture]);

  return (
    <group>
      {/* Table surface — static rigid body */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[SURFACE_W / 2, 0.5, SURFACE_H / 2]} position={[0, -0.5, 0]} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[SURFACE_W, SURFACE_H]} />
          <primitive object={material} attach="material" />
        </mesh>
      </RigidBody>

      {/* Edge walls — invisible colliders inside active area */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[ACTIVE_W / 2, WALL_HEIGHT / 2, WALL_THICKNESS / 2]} position={[0, WALL_HEIGHT / 2, -(ACTIVE_H / 2)]} />
        <CuboidCollider args={[ACTIVE_W / 2, WALL_HEIGHT / 2, WALL_THICKNESS / 2]} position={[0, WALL_HEIGHT / 2, (ACTIVE_H / 2 + TILE_H / 2)]} />
        <CuboidCollider args={[WALL_THICKNESS / 2, WALL_HEIGHT / 2, ACTIVE_H / 2 + TILE_H]} position={[-(ACTIVE_W / 2 + TILE_W / 2), WALL_HEIGHT / 2, 0]} />
        <CuboidCollider args={[WALL_THICKNESS / 2, WALL_HEIGHT / 2, ACTIVE_H / 2 + TILE_H]} position={[(ACTIVE_W / 2 + TILE_W / 2), WALL_HEIGHT / 2, 0]} />
      </RigidBody>

      {/* Dark overlay covering the full surface — uses Standard material so it receives shadows */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <planeGeometry args={[SURFACE_W, SURFACE_H]} />
        <meshStandardMaterial color="#000000" transparent opacity={0.45} roughness={1} metalness={0} />
      </mesh>

      {/* <DebugGrid /> */}
    </group>
  );
}
