import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { RigidBody, CuboidCollider, RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { Tape } from './types';
import { TAPE_W, TAPE_H, TAPE_D, DRAG_HEIGHT, to3D } from './coords';
import { loadFBXCached, useVariantTextures, VARIANTS, VARIANT_TO_MESH } from './Tape3D';

// Matches DragState in coords.ts — inlined to avoid bundler issues
interface DragState {
  tapeId: string | null;
  targetX: number;
  targetZ: number;
}

interface TapeBodyProps {
  tape: Tape;
  drag: DragState; // shared mutable object — read in useFrame, no re-renders
  menuOpen?: boolean;
  onMenuAction?: (tapeId: string, action: 'link' | 'rewind' | 'remove') => void;
  isNew?: boolean;
  bounceTapeId?: React.MutableRefObject<string | null>;
}

// Per-variant cached: isolated mesh centered at origin + measured half-extents
interface VariantGeo {
  halfX: number;
  halfY: number;
  halfZ: number;
}
const variantMeta = new Map<string, VariantGeo>();
let fbxDumped = false;

// Extract a single mesh from the FBX, bake its world transform into geometry,
// center it at origin, and scale to TAPE_W. Returns a clean group + collider dims.
function extractVariant(fbx: THREE.Group, meshName: string): { group: THREE.Group; geo: VariantGeo } {
  const clone = fbx.clone();

  // Dump full scene hierarchy once for debugging
  if (!fbxDumped) {
    fbxDumped = true;
    const dumpNode = (node: THREE.Object3D, depth = 0) => {
      const indent = '  '.repeat(depth);
      const mesh = node as THREE.Mesh;
      let info = `${indent}[${node.type}] "${node.name}"`;
      if (mesh.isMesh) {
        node.updateWorldMatrix(true, false);
        const box = new THREE.Box3().setFromObject(node);
        const size = box.getSize(new THREE.Vector3());
        info += ` verts:${mesh.geometry?.attributes?.position?.count} size:(${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)})`;
      }
      info += ` children:${node.children.length}`;
      console.log(info);
      for (const child of node.children) dumpNode(child, depth + 1);
    };
    dumpNode(clone);
  }

  // Find target mesh
  let targetMesh: THREE.Mesh | null = null;
  clone.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && child.name === meshName) {
      targetMesh = child as THREE.Mesh;
    }
  });

  const group = new THREE.Group();
  if (!targetMesh) {
    console.warn('[TapeBody] mesh not found:', meshName);
    return { group, geo: { halfX: 7, halfY: 0.8, halfZ: 3.6 } };
  }

  const m = targetMesh as THREE.Mesh;
  // Bake all parent transforms into geometry so mesh sits at origin with no rotation
  m.updateWorldMatrix(true, false);
  const geo = m.geometry.clone();
  geo.applyMatrix4(m.matrixWorld);

  // Measure and center
  const box = new THREE.Box3().setFromBufferAttribute(geo.attributes.position as THREE.BufferAttribute);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  geo.translate(-center.x, -center.y, -center.z);

  const newMesh = new THREE.Mesh(geo, m.material);
  newMesh.name = meshName;
  newMesh.castShadow = true;
  newMesh.receiveShadow = true;
  group.add(newMesh);

  // Scale so width = TAPE_W
  const scale = TAPE_W / size.x;
  group.scale.set(scale, scale, scale);

  // Shrink collider a few percent so it sits inside the mesh
  const shrink = 0.95;
  const result: VariantGeo = {
    halfX: (size.x * scale) / 2 * shrink,
    halfY: (size.y * scale) / 2 * shrink,
    halfZ: (size.z * scale) / 2 * shrink,
  };
  variantMeta.set(meshName, result);

  console.log(`[TapeBody] ${meshName}: raw ${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)} → collider ${(result.halfX*2).toFixed(1)}x${(result.halfY*2).toFixed(1)}x${(result.halfZ*2).toFixed(1)}`);

  return { group, geo: result };
}

// Stamp title text onto the BaseColor texture using Canvas2D
// UV layout: 2048px texture, upper-right quadrant has two cassette faces side by side
//   Face 1 (front): label writable area ~x:1050-1470, y:50-180, center ~(1260, 115)
//   Face 2 (back):  label writable area ~x:1550-1960, y:50-180, center ~(1755, 115)
// Cache stamped textures by variant+title to avoid re-creating canvases
const stampCache = new Map<string, THREE.CanvasTexture>();

// Set to true to draw debug rectangles showing label regions
const STAMP_DEBUG = false;

export function stampTitle(baseColor: THREE.Texture, title: string, variant: string): THREE.CanvasTexture {
  const cacheKey = `${variant}:${title}`;
  const cached = stampCache.get(cacheKey);
  if (cached) return cached;

  const src = baseColor.image as HTMLImageElement | HTMLCanvasElement;
  const w = 2048;
  const h = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(src, 0, 0, w, h);

  // Label regions for both faces (front and back of cassette)
  // UV is rotated 90° CCW on the model, so we draw rotated 90° CW to compensate
  // cx/cy = center in texture space, labelLen = length along the label (becomes vertical after rotation)
  const labels = [
    { cx: 1310, cy: 480, labelLen: 840 },  // Face 1 (front)
  ];

  if (STAMP_DEBUG) {
    // Draw debug outlines rotated 90° CW to match UV orientation
    for (const label of labels) {
      ctx.save();
      ctx.translate(label.cx, label.cy);
      ctx.rotate(Math.PI / 2); // 90° CW
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 3;
      ctx.strokeRect(-label.labelLen / 2, -80, label.labelLen, 160);
      // Crosshair at center
      ctx.beginPath();
      ctx.moveTo(-20, 0);
      ctx.lineTo(20, 0);
      ctx.moveTo(0, -20);
      ctx.lineTo(0, 20);
      ctx.stroke();
      // Coordinate label
      ctx.fillStyle = 'red';
      ctx.font = '24px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`(${label.cx}, ${label.cy})`, 0, 45);
      ctx.restore();
    }
  }

  ctx.fillStyle = '#222';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const label of labels) {
    const labelW = label.labelLen;
    const fontSize = 55;
    ctx.font = `bold ${fontSize}px 'Courier New', monospace`;

    // Word-wrap into lines that fit labelW
    const words = title.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    for (const word of words) {
      const test = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(test).width > labelW && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = test;
      }
    }
    if (currentLine) lines.push(currentLine);

    // Cap at 2 lines, truncate second line if needed
    if (lines.length > 2) {
      lines.length = 2;
      let line2 = lines[1];
      while (ctx.measureText(line2 + '…').width > labelW && line2.length > 1) {
        line2 = line2.slice(0, -1);
      }
      lines[1] = line2 + '…';
    }

    // Draw rotated 90° CW around label center
    const lineHeight = fontSize * 1.15;
    const totalHeight = lines.length * lineHeight;
    const startY = -totalHeight / 2 + lineHeight / 2;

    ctx.save();
    ctx.translate(label.cx, label.cy);
    ctx.rotate(Math.PI / 2);
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 0, startY + i * lineHeight);
    }
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = baseColor.flipY;
  tex.needsUpdate = true;
  stampCache.set(cacheKey, tex);
  return tex;
}

export function TapeBody({
  tape, drag, menuOpen, onMenuAction, isNew, bounceTapeId,
}: TapeBodyProps) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const groupRef = useRef<THREE.Group>(null);
  const [sceneData, setSceneData] = useState<{ group: THREE.Group; geo: VariantGeo } | null>(null);
  const wasDragging = useRef(false);
  const falling = useRef(false);
  const smoothPos = useRef({ x: 0, z: 0 });
  const velocity = useRef({ x: 0, z: 0 });
  const savedYRot = useRef(0);

  // Pick texture variant — use stored field if available, fall back to seed-based for legacy tapes
  const seed = tape.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const variant = (tape.textureVariant as typeof VARIANTS[number]) || VARIANTS[seed % VARIANTS.length];
  const meshName = VARIANT_TO_MESH['a']; // always use variant a's mesh
  const textures = useVariantTextures(variant); // swap textures for visual variety

  // Load FBX, extract single variant mesh centered at origin
  useEffect(() => {
    loadFBXCached().then(fbx => {
      const result = extractVariant(fbx, meshName);
      setSceneData(result);
    });
  }, [meshName]);

  // Apply PBR materials with title stamped onto texture
  useEffect(() => {
    if (!sceneData || !textures) return;
    const colorMap = tape.title ? stampTitle(textures.baseColor, tape.title, variant) : textures.baseColor;
    sceneData.group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.material = new THREE.MeshStandardMaterial({
          map: colorMap,
          metalness: 0.0,
          roughness: 0.75,
          normalMap: textures.normal,
          normalScale: new THREE.Vector2(0.5, 0.5),
          envMapIntensity: 0.3,
        });
        mesh.castShadow = true;
      }
    });
  }, [sceneData, textures, tape.title]);

  // Initial position from 2D coords — only used on first mount, not on prop updates
  // (drag-end updates tape.x/y in React state but the physics body is already positioned)
  const initialPos = useRef<{ x3d: number; z3d: number } | null>(null);
  if (!initialPos.current) {
    const [ix, iz] = to3D(tape.x ?? 500, tape.y ?? 500);
    initialPos.current = { x3d: ix, z3d: iz };
  }
  const { x3d, z3d } = initialPos.current;
  const halfY = sceneData?.geo.halfY ?? 0.8;
  const spawnY = isNew ? DRAG_HEIGHT : halfY + 0.01;
  // 180° base rotation so label faces camera, plus random yaw
  const angleRad = ((tape.angle ?? 0) * Math.PI) / 180 + Math.PI;

  // Handle drag state transitions and kinematic movement with momentum
  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body) return;

    // Bounce on double-tap
    if (bounceTapeId?.current === tape.id) {
      bounceTapeId.current = null;
      body.applyImpulse({ x: 0, y: 3, z: 0 }, true);
      body.applyTorqueImpulse({ x: (Math.random() - 0.5) * 0.5, y: 0, z: (Math.random() - 0.5) * 0.5 }, true);
    }

    const isDragged = drag.tapeId === tape.id;

    if (isDragged) {
      if (!wasDragging.current) {
        wasDragging.current = true;
        // If the body is far from the drag target (e.g. just ejected from deck),
        // teleport directly to the target instead of lerping from spawn position
        const t = body.translation();
        const dx = drag.targetX - t.x;
        const dz = drag.targetZ - t.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 5) {
          // Teleport — body just spawned far from pointer
          smoothPos.current.x = drag.targetX;
          smoothPos.current.z = drag.targetZ;
          body.setTranslation({ x: drag.targetX, y: DRAG_HEIGHT, z: drag.targetZ }, true);
        } else {
          smoothPos.current.x = t.x;
          smoothPos.current.z = t.z;
        }
        velocity.current.x = 0;
        velocity.current.z = 0;
        // Capture current Y rotation to preserve during drag
        const r = body.rotation();
        const euler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w), 'YXZ');
        savedYRot.current = euler.y;
      }

      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.setGravityScale(0, true);

      const lerp = 1 - Math.pow(0.00001, delta);
      const prevX = smoothPos.current.x;
      const prevZ = smoothPos.current.z;
      smoothPos.current.x += (drag.targetX - smoothPos.current.x) * lerp;
      smoothPos.current.z += (drag.targetZ - smoothPos.current.z) * lerp;

      if (delta > 0) {
        velocity.current.x = (smoothPos.current.x - prevX) / delta;
        velocity.current.z = (smoothPos.current.z - prevZ) / delta;
      }

      const maxTilt = 0.25;
      const tiltX = Math.max(-maxTilt, Math.min(maxTilt, velocity.current.z * 0.03));
      const tiltZ = Math.max(-maxTilt, Math.min(maxTilt, -velocity.current.x * 0.03));

      body.setTranslation({
        x: smoothPos.current.x,
        y: DRAG_HEIGHT,
        z: smoothPos.current.z,
      }, true);

      const q = new THREE.Quaternion();
      q.setFromEuler(new THREE.Euler(tiltX, savedYRot.current, tiltZ));
      body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    } else if (wasDragging.current) {
      // Release: start a gentle fall instead of snapping
      wasDragging.current = false;
      falling.current = true;
      body.setTranslation({
        x: smoothPos.current.x,
        y: DRAG_HEIGHT,
        z: smoothPos.current.z,
      }, true);
      body.setGravityScale(0.15, true);
      const vx = velocity.current.x * 0.4;
      const vz = velocity.current.z * 0.4;
      body.setLinvel({ x: vx, y: -2, z: vz }, true);
      body.setAngvel({ x: vz * 0.3, y: 0, z: -vx * 0.3 }, true);
    }

    // Gradually restore gravity as the tape falls
    if (falling.current && !isDragged) {
      const t = body.translation();
      const gs = body.gravityScale();
      if (t.y <= halfY + 0.1) {
        // Landed
        falling.current = false;
        body.setGravityScale(1, true);
      } else if (gs < 1) {
        body.setGravityScale(Math.min(1, gs + delta * 0.8), true);
      }
    }
  });

  if (!sceneData) return null;

  const { geo } = sceneData;

  return (
    <RigidBody
      ref={bodyRef}
      position={[x3d, spawnY, z3d]}
      rotation={[0, angleRad, 0]}
      type="dynamic"
      colliders={false}
      linearDamping={1.5}
      angularDamping={2}
      mass={0.5}
      restitution={0.15}
      friction={0.6}
      ccd={true}
    >
      <CuboidCollider args={[geo.halfX, geo.halfY, geo.halfZ]} />
      <group name={`tape-${tape.id}`} ref={groupRef}>
        <primitive object={sceneData.group} />
      </group>

      {/* Context menu */}
      {menuOpen && (
        <Html center position={[0, 0.5, geo.halfZ + 0.3]} style={{ pointerEvents: 'auto' }}>
          <div style={{
            display: 'flex', gap: 6, whiteSpace: 'nowrap',
            transform: 'translateX(-50%)',
          }} onPointerDown={(e) => e.stopPropagation()}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const id = tape.isPlaylist ? tape.playlistId : tape.videoId;
                const url = `${window.location.origin}${window.location.pathname}?v=${id}&t=${tape.playlistIndex ?? 0}`;
                navigator.clipboard.writeText(url).then(() => {
                  (e.target as HTMLButtonElement).textContent = 'Copied!';
                  setTimeout(() => { (e.target as HTMLButtonElement).textContent = 'Link'; }, 1500);
                }).catch(() => { prompt('Copy this link:', url); });
              }}
              style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: "'Courier New', monospace" }}
            >Link</button>
            <button
              onClick={(e) => { e.stopPropagation(); onMenuAction?.(tape.id, 'rewind'); }}
              style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#333', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: "'Courier New', monospace" }}
            >Rewind</button>
            <button
              onClick={(e) => { e.stopPropagation(); onMenuAction?.(tape.id, 'remove'); }}
              style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: "'Courier New', monospace" }}
            >Remove</button>
          </div>
        </Html>
      )}
    </RigidBody>
  );
}
