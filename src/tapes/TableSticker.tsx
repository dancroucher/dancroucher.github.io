import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

/**
 * Square sticker placed on the table surface.
 * Sits just above the wood (y=0.03) so it picks up shadows from tapes
 * and the recorder, and appears under tapes that overlap it.
 *
 * Supports hover glow and click dispatching a custom event.
 */
export function TableSticker({
  position,
  size = 5,
  textureUrl,
  label,
  clickEvent,
  enabled = true,
  visible = true,
}: {
  position: [number, number, number];
  size?: number;
  textureUrl?: string;
  label?: string;
  clickEvent?: string;
  enabled?: boolean;
  visible?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  // If `enabled` flips off mid-hover (e.g. user starts dragging a tape
  // while the cursor sits over the sticker), drop the hover state so
  // the glow fades out and the body cursor resets.
  useEffect(() => {
    if (!enabled && hovered) {
      setHovered(false);
      document.body.style.cursor = 'default';
    }
  }, [enabled, hovered]);
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);

  const texture = useMemo(() => {
    if (textureUrl) {
      const tex = new THREE.TextureLoader().load(textureUrl);
      tex.colorSpace = THREE.SRGBColorSpace;
      // PNGs are stored non-premultiplied; without this, anti-aliased
      // edge pixels (white-ish RGB at low alpha) bleed through as a
      // light halo around the disc when composited on the dark wood.
      tex.premultiplyAlpha = true;
      return tex;
    }
    return null;
  }, [textureUrl]);

  // Generate a canvas texture for the placeholder
  const placeholderTexture = useMemo(() => {
    if (texture) return null;
    const res = 512;
    const canvas = document.createElement('canvas');
    canvas.width = res;
    canvas.height = res;
    const ctx = canvas.getContext('2d')!;

    // Square background
    ctx.fillStyle = '#e8d4a2';
    ctx.fillRect(0, 0, res, res);
    ctx.strokeStyle = '#b8956a';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, res - 4, res - 4);

    // Label text
    if (label) {
      ctx.fillStyle = '#3a2a1a';
      ctx.font = 'bold 48px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, res / 2, res / 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [texture, label]);

  const tex = texture || placeholderTexture;

  // Animate emissive intensity on hover
  useFrame(() => {
    if (!materialRef.current) return;
    const target = hovered ? 0.12 : 0;
    const current = materialRef.current.emissiveIntensity;
    materialRef.current.emissiveIntensity += (target - current) * 0.15;
  });

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={position}
      visible={visible}
      receiveShadow
      onPointerOver={(e) => {
        if (!enabled) return;
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        if (!enabled) return;
        setHovered(false);
        document.body.style.cursor = 'default';
      }}
      onClick={(e) => {
        if (!enabled) return;
        e.stopPropagation();
        setHovered(false);
        document.body.style.cursor = 'default';
        if (clickEvent) {
          window.dispatchEvent(new CustomEvent(clickEvent));
        }
      }}
    >
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial
        ref={materialRef}
        map={tex || undefined}
        color={tex ? '#ffffff' : '#e8d4a2'}
        transparent={true}
        alphaTest={0.1}
        premultipliedAlpha={true}
        roughness={0.8}
        metalness={0}
        depthWrite={true}
        emissive="#ffffff"
        emissiveIntensity={0}
      />
    </mesh>
  );
}
