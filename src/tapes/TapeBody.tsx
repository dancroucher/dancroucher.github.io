import React, { useRef, useState, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import {
  RigidBody,
  CuboidCollider,
  RapierRigidBody,
} from "@react-three/rapier";
import * as THREE from "three";
import { Tape } from "./types";
import { TAPE_W, TAPE_H, TAPE_D, DRAG_HEIGHT, to3D, DragState, SnapState } from "./coords";
import {
  loadFBXCached,
  useVariantTextures,
  VARIANTS,
  TAPE_MESH_NAME,
} from "./Tape3D";
import { SpoolDisc } from "./DeckTape3D";

// Seconds to tween from release pose into the loaded-in-recorder pose.
const SNAP_DURATION = 0.4;

// Height new tapes spawn at before falling. Higher = more dramatic drop and
// gives nearby resting tapes time to settle before the new one lands.
const SPAWN_HEIGHT = 22;

interface TapeBodyProps {
  tape: Tape;
  drag: DragState; // shared mutable object — read in useFrame, no re-renders
  snap: SnapState; // shared mutable snap target — owned by one tape at a time
  menuOpen?: boolean;
  onMenuAction?: (tapeId: string, action: "link" | "rewind" | "remove") => void;
  isNew?: boolean;
  bounceTapeId?: React.MutableRefObject<string | null>;
  hidden?: boolean;
  onReady?: (tapeId: string) => void;
  spawnAllowed?: boolean;
  // While true: pin the tape kinematically and tween its rotation flat
  // (parallel to the table) so the inspect view shows it cleanly.
  inspecting?: boolean;
  // Shared playing ref — when true and tape is loaded in recorder, spools spin.
  isPlayingRef?: React.MutableRefObject<boolean>;
}

// Per-variant cached: isolated mesh centered at origin + measured half-extents
interface VariantGeo {
  halfX: number;
  halfY: number;
  halfZ: number;
  scale: number;
}
const variantMeta = new Map<string, VariantGeo>();

// Extract a single mesh from the FBX, bake its world transform into geometry,
// center it at origin, and scale to TAPE_W. Returns a clean group + collider dims.
function extractVariant(
  fbx: THREE.Group,
  meshName: string,
): { group: THREE.Group; geo: VariantGeo } {
  const clone = fbx.clone();

  // Find target mesh
  let targetMesh: THREE.Mesh | null = null;
  clone.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && child.name === meshName) {
      targetMesh = child as THREE.Mesh;
    }
  });

  const group = new THREE.Group();
  if (!targetMesh) {
    console.warn("[TapeBody] mesh not found:", meshName);
    return { group, geo: { halfX: 7, halfY: 0.8, halfZ: 3.6, scale: 1 } };
  }

  const m = targetMesh as THREE.Mesh;
  // Bake all parent transforms into geometry so mesh sits at origin with no rotation
  m.updateWorldMatrix(true, false);
  const geo = m.geometry.clone();
  geo.applyMatrix4(m.matrixWorld);

  // Measure and center
  const box = new THREE.Box3().setFromBufferAttribute(
    geo.attributes.position as THREE.BufferAttribute,
  );
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
    halfX: ((size.x * scale) / 2) * shrink,
    halfY: ((size.y * scale) / 2) * shrink,
    halfZ: ((size.z * scale) / 2) * shrink,
    scale,
  };
  variantMeta.set(meshName, result);

  return { group, geo: result };
}

// Stamp title text onto the BaseColor texture using Canvas2D
// UV layout: 2048px texture, upper-right quadrant has two cassette faces side by side
//   Face 1 (front): label writable area ~x:1050-1470, y:50-180, center ~(1260, 115)
//   Face 2 (back):  label writable area ~x:1550-1960, y:50-180, center ~(1755, 115)
// Cache stamped textures by variant+title to avoid re-creating canvases.
// Evict oldest entries when cache exceeds MAX_STAMP_CACHE entries to prevent unbounded growth.
const MAX_STAMP_CACHE = 100;
const stampCache = new Map<string, THREE.CanvasTexture>();
const stampCacheOrder: string[] = [];

// Permanent Marker is loaded async via Google Fonts. Until it's ready
// stampTitle falls back to the next font in the stack ('Courier New'),
// which would get cached and never refresh. Kick off a load + once ready,
// flush the cache and ping every TapeBody to re-stamp with the real font.
if (typeof document !== 'undefined' && (document as any).fonts) {
  (document as any).fonts.load("64px 'Permanent Marker'").then(() => {
    for (const tex of stampCache.values()) tex.dispose();
    stampCache.clear();
    stampCacheOrder.length = 0;
    window.dispatchEvent(new CustomEvent('jeem-fonts-ready'));
  }).catch(() => { /* font failed; keep fallback */ });
}

// Set to true to draw debug rectangles showing label regions
const STAMP_DEBUG = false;

export function stampTitle(
  baseColor: THREE.Texture,
  title: string,
  variant: string,
  tape?: Tape,
): THREE.CanvasTexture {
  const isInfinite = tape?.isInfinite ?? false;
  const isPlaylist = tape?.isPlaylist ?? false;
  const isMixtape = tape?.author === "mixtape" && !!tape?.isInfinite;
  const caretIdx = tape?._caretIndex;
  const caretField = tape?._caretField ?? 'title';
  const authorTag = (tape?.authorTag ?? '').slice(0, 8);
  const isPendingMix = tape?.isPendingMixtape ?? false;
  const caretKey = caretIdx !== undefined ? `:c${caretField}${caretIdx}` : '';
  const cacheKey = `${variant}:${title}:${authorTag}:${isInfinite ? "inf" : ""}${isPlaylist ? "pl" : ""}${isMixtape ? "mx" : ""}${isPendingMix ? "pm" : ""}${caretKey}`;
  const cached = stampCache.get(cacheKey);
  if (cached) {
    // Move to end (most recently used)
    const idx = stampCacheOrder.indexOf(cacheKey);
    if (idx !== -1) stampCacheOrder.splice(idx, 1);
    stampCacheOrder.push(cacheKey);
    return cached;
  }

  const src = baseColor.image as HTMLImageElement | HTMLCanvasElement;
  const w = 2048;
  const h = 2048;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(src, 0, 0, w, h);

  // Label regions for both faces (front and back of cassette)
  // UV is rotated 90° CCW on the model, so we draw rotated 90° CW to compensate
  // cx/cy = center in texture space, labelLen = length along the label (becomes vertical after rotation)
  const labels = [
    { cx: 1310, cy: 480, labelLen: 840 }, // Face 1 (front)
  ];

  if (STAMP_DEBUG) {
    // Draw debug outlines rotated 90° CW to match UV orientation
    for (const label of labels) {
      ctx.save();
      ctx.translate(label.cx, label.cy);
      ctx.rotate(Math.PI / 2); // 90° CW
      ctx.strokeStyle = "red";
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
      ctx.fillStyle = "red";
      ctx.font = "24px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`(${label.cx}, ${label.cy})`, 0, 45);
      ctx.restore();
    }
  }

  ctx.fillStyle = "#222";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const label of labels) {
    const labelW = label.labelLen;
    const fontSize = 64;
    ctx.font = `${fontSize}px 'Permanent Marker', 'Courier New', monospace`;

    // Word-wrap into lines that fit labelW. Track each line's start index
    // in the original title so we can position the blinking caret without
    // injecting a `|` into the laid-out text (which would shift letters as
    // the caret toggles).
    const words = title.split(" ");
    let runningIdx = 0;
    const wordStarts = words.map((w) => {
      const start = runningIdx;
      runningIdx += w.length + 1; // +1 for the space separator
      return start;
    });
    type LineMeta = { text: string; startIdx: number; endIdx: number };
    const lineMetas: LineMeta[] = [];
    let currentLine = "";
    let currentStart = 0;
    let currentEnd = 0;
    for (let wi = 0; wi < words.length; wi++) {
      const word = words[wi];
      const test = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(test).width > labelW && currentLine) {
        lineMetas.push({ text: currentLine, startIdx: currentStart, endIdx: currentEnd });
        currentLine = word;
        currentStart = wordStarts[wi];
        currentEnd = currentStart + word.length;
      } else {
        if (!currentLine) currentStart = wordStarts[wi];
        currentLine = test;
        currentEnd = wordStarts[wi] + word.length;
      }
    }
    if (currentLine) lineMetas.push({ text: currentLine, startIdx: currentStart, endIdx: currentEnd });
    // Ensure there's always at least one line — needed for empty/whitespace
    // titles so the blinking caret has somewhere to anchor.
    if (lineMetas.length === 0) lineMetas.push({ text: "", startIdx: 0, endIdx: 0 });

    // Cap at 2 lines, truncate second line if needed
    if (lineMetas.length > 2) {
      lineMetas.length = 2;
      let line2 = lineMetas[1].text;
      while (ctx.measureText(line2 + "…").width > labelW && line2.length > 1) {
        line2 = line2.slice(0, -1);
      }
      lineMetas[1] = { ...lineMetas[1], text: line2 + "…" };
    }

    // Draw rotated 90° CW around label center
    const lineHeight = fontSize * 1.0;
    const totalHeight = lineMetas.length * lineHeight;
    const startY = -totalHeight / 2 + lineHeight / 2;

    ctx.save();
    ctx.translate(label.cx, label.cy);
    ctx.rotate(Math.PI / 2);
    for (let i = 0; i < lineMetas.length; i++) {
      ctx.fillText(lineMetas[i].text, 0, startY + i * lineHeight);
    }
    // Caret overlay — terminal-style inverted block. Draws a filled
    // rectangle over the caret position and re-renders the underlying
    // character in the inverse colour. textAlign=center maps each line
    // to be centred around x=0, so block x = prefixWidth - lineW/2.
    if (caretIdx !== undefined && caretField === 'title' && lineMetas.length > 0) {
      let lineIdx = 0;
      for (let i = lineMetas.length - 1; i >= 0; i--) {
        if (caretIdx >= lineMetas[i].startIdx) { lineIdx = i; break; }
      }
      const meta = lineMetas[lineIdx];
      const offset = Math.max(0, Math.min(meta.text.length, caretIdx - meta.startIdx));
      const lineW = ctx.measureText(meta.text).width;
      const prefixW = ctx.measureText(meta.text.slice(0, offset)).width;
      const charAtCaret = meta.text.charAt(offset); // empty if caret at end
      // End-of-line / empty title: match the width of the previous character
      // so the cursor doesn't suddenly balloon. Fall back to a typical
      // letter ("a") when there's nothing before it either.
      const fallbackChar = meta.text.charAt(Math.max(0, offset - 1)) || "a";
      const blockChar = charAtCaret || fallbackChar;
      const blockW = ctx.measureText(blockChar).width;
      const blockH = fontSize * 1.05;
      const blockX = prefixW - lineW / 2;
      const blockY = startY + lineIdx * lineHeight;
      ctx.save();
      ctx.fillStyle = "#222";
      ctx.fillRect(blockX - 1, blockY - blockH / 2, blockW + 2, blockH);
      if (charAtCaret) {
        ctx.fillStyle = "#f5f1e0";
        ctx.textAlign = "left";
        ctx.fillText(charAtCaret, blockX, blockY);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // Draw yellow infinity sticker for infinite tapes
  if (isInfinite && !isMixtape) {
    const label = labels[0];
    ctx.save();
    ctx.translate(label.cx, label.cy);
    ctx.rotate(Math.PI / 2);
    // Position sticker below the title text area
    const stickerX = 0;
    const stickerY = 280;
    const stickerW = 200;
    const stickerH = 140;
    // Yellow sticker background
    const grad = ctx.createLinearGradient(
      stickerX - stickerW / 2,
      stickerY,
      stickerX + stickerW / 2,
      stickerY + stickerH,
    );
    grad.addColorStop(0, "#f0d848");
    grad.addColorStop(1, "#e8c830");
    ctx.fillStyle = grad;
    ctx.beginPath();
    const r = 12;
    ctx.roundRect(
      stickerX - stickerW / 2,
      stickerY - stickerH / 2,
      stickerW,
      stickerH,
      r,
    );
    ctx.fill();
    // Border
    ctx.strokeStyle = "rgba(180,150,30,0.4)";
    ctx.lineWidth = 2;
    ctx.stroke();
    // Large ∞ symbol — nudge down slightly to visually center the glyph
    ctx.fillStyle = "#5a4a10";
    ctx.font = "bold 120px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("∞", stickerX, stickerY + 8);
    ctx.restore();
  }

  // Draw red "Playlist" sticker for playlist tapes
  if (isPlaylist) {
    const label = labels[0];
    ctx.save();
    ctx.translate(label.cx, label.cy);
    ctx.rotate(Math.PI / 2);
    const stickerX = 0;
    const stickerY = 280;
    const stickerW = 280;
    const stickerH = 100;
    // Red sticker background
    const grad = ctx.createLinearGradient(
      stickerX - stickerW / 2,
      stickerY,
      stickerX + stickerW / 2,
      stickerY,
    );
    grad.addColorStop(0, "#d42020");
    grad.addColorStop(1, "#b81818");
    ctx.fillStyle = grad;
    ctx.beginPath();
    const r = 12;
    ctx.roundRect(
      stickerX - stickerW / 2,
      stickerY - stickerH / 2,
      stickerW,
      stickerH,
      r,
    );
    ctx.fill();
    // Border
    ctx.strokeStyle = "rgba(120,20,20,0.4)";
    ctx.lineWidth = 2;
    ctx.stroke();
    // "Playlist" text
    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 52px "Courier New", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Playlist", stickerX, stickerY);
    ctx.restore();
  }

  // Draw white-on-blue "Mixtape" badge for mixtape tapes
  if (isMixtape) {
    const label = labels[0];
    ctx.save();
    ctx.translate(label.cx, label.cy);
    ctx.rotate(Math.PI / 2);
    const stickerX = 0;
    const stickerY = 280; // same position as the ∞ sticker
    const stickerW = 300;
    const stickerH = 110;
    // Blue sticker background
    const grad = ctx.createLinearGradient(
      stickerX - stickerW / 2,
      stickerY,
      stickerX + stickerW / 2,
      stickerY,
    );
    grad.addColorStop(0, "#1a4a8a");
    grad.addColorStop(1, "#0f3580");
    ctx.fillStyle = grad;
    ctx.beginPath();
    const r = 12;
    ctx.roundRect(
      stickerX - stickerW / 2,
      stickerY - stickerH / 2,
      stickerW,
      stickerH,
      r,
    );
    ctx.fill();
    // Border
    ctx.strokeStyle = "rgba(30,80,160,0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();
    // "Mixtape" text
    ctx.fillStyle = "#ffffff";
    ctx.font = 'bold 52px "Courier New", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Mixtape", stickerX, stickerY);
    ctx.restore();
  }

  // Yellow author-tag sticker on the right corner of the cassette label.
  // Always rendered when the user is editing it (caretField === 'author')
  // even if empty, so the cursor has somewhere to sit. Otherwise drawn
  // only when there's text to show.
  const showAuthorSticker = !!authorTag || isPendingMix || (caretField === 'author' && caretIdx !== undefined);
  if (showAuthorSticker) {
    const label = labels[0];
    ctx.save();
    ctx.translate(label.cx, label.cy);
    ctx.rotate(Math.PI / 2);
    // Translate to sticker centre, then rotate 45° in the label plane so
    // the tag sits diagonally on the cassette.
    ctx.translate(360, 220);
    ctx.rotate(-Math.PI / 4);
    const stickerW = 260;
    const stickerH = 120;
    const grad = ctx.createLinearGradient(
      -stickerW / 2,
      0,
      stickerW / 2,
      stickerH,
    );
    grad.addColorStop(0, "#ffe000");
    grad.addColorStop(1, "#f5c800");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(-stickerW / 2, -stickerH / 2, stickerW, stickerH, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(180,150,30,0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();
    // "Made by:" header on the top edge of the sticker, small sans-serif
    // for legibility against the yellow.
    ctx.fillStyle = "#3a2a08";
    ctx.font = '600 18px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Made by:", 0, -stickerH / 2 + 16);

    // Author text — matches the "Mixtape" badge font for consistency.
    const authorFontSize = 52;
    ctx.fillStyle = "#3a2a08";
    ctx.font = `bold ${authorFontSize}px "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const authorTextY = 16; // shift text down to clear the "Made by:" header
    if (authorTag) {
      ctx.fillText(authorTag, 0, authorTextY);
    } else if (isPendingMix && caretField !== 'author') {
      // Faint placeholder so the empty yellow sticker is discoverable as
      // an editable area before the user has clicked it.
      ctx.save();
      ctx.fillStyle = "rgba(58, 42, 8, 0.45)";
      ctx.fillText("…", 0, authorTextY);
      ctx.restore();
    }
    // Caret overlay for the author field — mirrors the title-caret logic
    // but operates on a single-line string drawn at sticker centre.
    if (caretIdx !== undefined && caretField === 'author') {
      const offset = Math.max(0, Math.min(authorTag.length, caretIdx));
      const lineW = ctx.measureText(authorTag).width;
      const prefixW = ctx.measureText(authorTag.slice(0, offset)).width;
      const charAtCaret = authorTag.charAt(offset);
      const fallbackChar = authorTag.charAt(Math.max(0, offset - 1)) || "a";
      const blockChar = charAtCaret || fallbackChar;
      const blockW = ctx.measureText(blockChar).width;
      const blockH = authorFontSize * 1.05;
      const blockX = prefixW - lineW / 2;
      const blockY = authorTextY;
      ctx.save();
      ctx.fillStyle = "#3a2a08";
      ctx.fillRect(blockX - 1, blockY - blockH / 2, blockW + 2, blockH);
      if (charAtCaret) {
        ctx.fillStyle = "#ffe000";
        ctx.textAlign = "left";
        ctx.fillText(charAtCaret, blockX, blockY);
      }
      ctx.restore();
    }
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = baseColor.flipY;
  tex.needsUpdate = true;
  // Evict oldest entry if cache is full
  if (stampCacheOrder.length >= MAX_STAMP_CACHE) {
    const oldest = stampCacheOrder.shift()!;
    const oldTex = stampCache.get(oldest);
    if (oldTex) oldTex.dispose();
    stampCache.delete(oldest);
  }
  stampCache.set(cacheKey, tex);
  stampCacheOrder.push(cacheKey);
  return tex;
}

export function TapeBody({
  tape,
  drag,
  snap,
  menuOpen,
  onMenuAction,
  isNew,
  bounceTapeId,
  hidden = false,
  onReady,
  spawnAllowed = true,
  inspecting = false,
  isPlayingRef,
}: TapeBodyProps) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const groupRef = useRef<THREE.Group>(null);
  // Bumped when Permanent Marker finishes loading so the texture-stamp
  // useEffect re-runs and replaces the fallback-font cache entry.
  const [fontsTick, setFontsTick] = useState(0);
  useEffect(() => {
    function bump() { setFontsTick(t => t + 1); }
    window.addEventListener('jeem-fonts-ready', bump);
    return () => window.removeEventListener('jeem-fonts-ready', bump);
  }, []);
  const [sceneData, setSceneData] = useState<{
    group: THREE.Group;
    geo: VariantGeo;
  } | null>(null);
  const wasDragging = useRef(false);
  const falling = useRef(isNew ? true : false);
  const needsSpawnDrop = useRef(isNew ? true : false);
  const smoothPos = useRef({ x: 0, z: 0 });
  const velocity = useRef({ x: 0, z: 0 });
  const savedYRot = useRef(0);
  // Smoothed yaw used while dragging — tweens between savedYRot and drag.targetYaw.
  const currentYaw = useRef(0);
  // Smoothed pitch around body X — tweens to drag.targetPitch (e.g. lid angle over recorder).
  const currentPitch = useRef(0);
  // Smoothed drag hover height — tweens to drag.targetY so the tape lifts over
  // the open recorder lid instead of clipping through it.
  const currentDragY = useRef(DRAG_HEIGHT);
  // Snap-into-recorder state (post-drop tween + pinning).
  const isSnapping = useRef(false);
  const isLoaded = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const spinRef = useRef(false);
  const snapElapsed = useRef(0);
  const snapStart = useRef({ x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1 });
  const snapTarget = useRef({ x: 0, y: 0, z: 0, yaw: 0 });
  // Inactivity fade — eased toward 1 (visible) or 0 (hidden) each frame.
  const opacityRef = useRef(1);
  const materialsRef = useRef<THREE.Material[]>([]);
  const materialsReady = useRef(false);
  // Inspect-mode pin: when entering inspect we capture the tape's current
  // x/z/y so we can hold it there while flattening rotation. wasInspecting
  // tracks the prev-frame value so we can detect transitions.
  const wasInspecting = useRef(false);
  const inspectPin = useRef({ x: 0, y: 0, z: 0, yaw: 0 });

  // Pick texture variant — use stored field if available, fall back to seed-based for legacy tapes
  const seed = tape.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const variant =
    (tape.textureVariant as (typeof VARIANTS)[number]) ||
    VARIANTS[seed % VARIANTS.length];
  const meshName = TAPE_MESH_NAME;
  const textures = useVariantTextures(variant); // swap textures for visual variety

  // Load FBX, extract single variant mesh centered at origin. On unmount
  // (or meshName change) dispose the cloned geometry so tape remove/respawn
  // cycles don't leak GPU memory. The FBX itself is cached at module scope
  // so we don't touch its buffers.
  useEffect(() => {
    let cancelled = false;
    let result: { group: THREE.Group; geo: VariantGeo } | null = null;
    loadFBXCached().then((fbx) => {
      if (cancelled) return;
      result = extractVariant(fbx, meshName);
      setSceneData(result);
    });
    return () => {
      cancelled = true;
      if (result) {
        result.group.traverse((child) => {
          const m = child as THREE.Mesh;
          if (m.isMesh && m.geometry) m.geometry.dispose();
        });
      }
    };
  }, [meshName]);

  // Apply PBR materials with title stamped onto texture. Each tape owns its
  // own MeshStandardMaterial instances so per-instance opacity fades don't
  // leak into other tapes. Dispose the old materials when the effect re-runs
  // (title/textures change) or on unmount.
  useEffect(() => {
    if (!sceneData || !textures) return;
    // Always run stampTitle for tapes that have a sticker (infinite/playlist/
    // mixtape) so the sticker stays visible even when the title is empty —
    // e.g. while the pending-mixtape name is still blank. Plain tapes with
    // an empty title can keep the bare baseColor.
    const hasSticker = tape.isInfinite || tape.isPlaylist || !!tape.authorTag || !!tape.isPendingMixtape;
    const colorMap = (tape.title || hasSticker)
      ? stampTitle(textures.baseColor, tape.title, variant, tape)
      : textures.baseColor;
    const mats: THREE.Material[] = [];
    sceneData.group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const mat = new THREE.MeshStandardMaterial({
          map: colorMap,
          metalness: 0.0,
          roughness: 0.75,
          normalMap: textures.normal,
          normalScale: new THREE.Vector2(0.5, 0.5),
          envMapIntensity: 0.3,
          transparent: true,
          opacity: opacityRef.current,
        });
        mesh.material = mat;
        mesh.castShadow = true;
        mats.push(mat);
      }
    });
    materialsRef.current = mats;
    if (mats.length > 0) {
      materialsReady.current = true;
      onReady?.(tape.id);
    }
    return () => {
      for (const m of mats) m.dispose();
    };
  }, [sceneData, textures, tape.title, tape.id, onReady, fontsTick, tape._caretIndex, tape._caretField, tape.authorTag, tape.isPendingMixtape]);

  // Initial position from 2D coords — only used on first mount, not on prop updates
  // (drag-end updates tape.x/y in React state but the physics body is already positioned)
  const initialPos = useRef<{
    x3d: number;
    z3d: number;
    spawnY: number;
  } | null>(null);
  const halfY = sceneData?.geo.halfY ?? 0.8;
  if (!initialPos.current) {
    const [ix, iz] = to3D(tape.x ?? 500, tape.y ?? 500);
    initialPos.current = {
      x3d: ix,
      z3d: iz,
      spawnY: isNew ? SPAWN_HEIGHT : halfY + 0.01,
    };
  }
  const { x3d, z3d, spawnY } = initialPos.current;
  // 180° base rotation so label faces camera, plus random yaw
  const angleRad = ((tape.angle ?? 0) * Math.PI) / 180 + Math.PI;

  // Handle drag state transitions and kinematic movement with momentum
  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body) return;

    // New tape spawn: hold the body frozen at spawn height until textures and
    // materials are applied, then release into a gentle fall. This avoids
    // dropping a placeholder mesh and keeps the visual fade-in lined up with
    // the start of the drop.
    if (needsSpawnDrop.current) {
      if (!materialsReady.current || !spawnAllowed) {
        body.setGravityScale(0, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        body.setTranslation({ x: x3d, y: spawnY, z: z3d }, true);
      } else {
        needsSpawnDrop.current = false;
        falling.current = true;
        body.setGravityScale(0.25, true);
        body.setLinvel({ x: 0, y: -1, z: 0 }, true);
      }
    }

    // Bounce on double-tap
    if (bounceTapeId?.current === tape.id) {
      bounceTapeId.current = null;
      body.applyImpulse({ x: 0, y: 3, z: 0 }, true);
      body.applyTorqueImpulse(
        {
          x: (Math.random() - 0.5) * 0.5,
          y: 0,
          z: (Math.random() - 0.5) * 0.5,
        },
        true,
      );
    }

    const isDragged = drag.tapeId === tape.id;

    // Inspect-mode pin: capture pose on entry, hold position + tween rotation
    // toward flat (parallel to the table). Skip if loaded/snapping/dragged —
    // those states own the body. Restored to dynamic on exit.
    if (inspecting && !isDragged && !isLoaded.current && !isSnapping.current) {
      if (!wasInspecting.current) {
        wasInspecting.current = true;
        const t = body.translation();
        const r = body.rotation();
        const q = new THREE.Quaternion(r.x, r.y, r.z, r.w);
        const euler = new THREE.Euler().setFromQuaternion(q, "YXZ");
        // Face-down detection: rotate local +Y into world space and check
        // its Y component. If negative, the label is currently facing the
        // table — flatten-to-Y(yaw) would leave it upside-down. Add π
        // to yaw so the label ends up facing the camera right-way-up.
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
        let yaw = euler.y;
        if (up.y < 0) yaw += Math.PI;
        inspectPin.current = { x: t.x, y: t.y, z: t.z, yaw };
        body.setBodyType(2, true); // kinematic
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      const pin = inspectPin.current;
      // Tween rotation toward flat (only Y rotation kept).
      const r = body.rotation();
      const cur = new THREE.Quaternion(r.x, r.y, r.z, r.w);
      const target = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, pin.yaw, 0),
      );
      const k = 1 - Math.exp(-delta * 6); // ~0.17s ease, matches drag-yaw rate
      cur.slerp(target, k);
      body.setTranslation({ x: pin.x, y: pin.y, z: pin.z }, true);
      body.setRotation({ x: cur.x, y: cur.y, z: cur.z, w: cur.w }, true);
      return;
    } else if (wasInspecting.current && !inspecting) {
      wasInspecting.current = false;
      // Restore dynamic only if we still own the body (not loaded/snapping/dragged).
      if (!isLoaded.current && !isSnapping.current && !isDragged) {
        body.setBodyType(0, true);
      }
    }

    if (isDragged) {
      if (!wasDragging.current) {
        wasDragging.current = true;
        // Picking up a loaded/snapping tape releases the snap slot.
        const wasInRecorder = isLoaded.current || isSnapping.current;
        if (wasInRecorder) {
          if (isLoaded.current) body.setBodyType(0, true);
          isLoaded.current = false;
          setLoaded(false);
          isSnapping.current = false;
          if (snap.tapeId === tape.id) snap.tapeId = null;
        }
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
          body.setTranslation(
            { x: drag.targetX, y: DRAG_HEIGHT, z: drag.targetZ },
            true,
          );
        } else {
          smoothPos.current.x = t.x;
          smoothPos.current.z = t.z;
        }
        velocity.current.x = 0;
        velocity.current.z = 0;
        currentDragY.current = DRAG_HEIGHT;
        // Capture current Y rotation to preserve during drag
        const r = body.rotation();
        const euler = new THREE.Euler().setFromQuaternion(
          new THREE.Quaternion(r.x, r.y, r.z, r.w),
          "YXZ",
        );
        // If picked up from the recorder, target the tape's original yaw so
        // leaving the trigger zone tweens back to its pre-load rotation.
        // Otherwise preserve the tape's current table-rest yaw, but clamp to
        // angleRad ± 20° so heavily-tilted resting tapes straighten up on
        // pickup. Tapes already within ±20° keep their exact yaw.
        if (wasInRecorder) {
          savedYRot.current = angleRad;
        } else {
          const TILT_LIMIT = (20 * Math.PI) / 180;
          let diff = euler.y - angleRad;
          while (diff > Math.PI) diff -= 2 * Math.PI;
          while (diff < -Math.PI) diff += 2 * Math.PI;
          const clamped = Math.max(-TILT_LIMIT, Math.min(TILT_LIMIT, diff));
          savedYRot.current = angleRad + clamped;
        }
        currentYaw.current = euler.y;
        currentPitch.current = 0;
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
      const tiltX = Math.max(
        -maxTilt,
        Math.min(maxTilt, velocity.current.z * 0.03),
      );
      const tiltZ = Math.max(
        -maxTilt,
        Math.min(maxTilt, -velocity.current.x * 0.03),
      );

      // Tween yaw toward snap target (or to the saved drag yaw).
      const yawTarget = drag.targetYaw ?? savedYRot.current;
      let yawDiff = yawTarget - currentYaw.current;
      // Take the short way around the circle.
      while (yawDiff > Math.PI) yawDiff -= 2 * Math.PI;
      while (yawDiff < -Math.PI) yawDiff += 2 * Math.PI;
      const rotK = 1 - Math.exp(-delta * 6); // ~0.17s ease
      currentYaw.current += yawDiff * rotK;

      // Tween pitch toward snap target (0 means flat).
      const pitchTarget = drag.targetPitch ?? 0;
      currentPitch.current += (pitchTarget - currentPitch.current) * rotK;

      // Tween hover Y toward target (lifts over open lid).
      const yTarget = drag.targetY ?? DRAG_HEIGHT;
      currentDragY.current += (yTarget - currentDragY.current) * rotK;

      body.setTranslation(
        {
          x: smoothPos.current.x,
          y: currentDragY.current,
          z: smoothPos.current.z,
        },
        true,
      );

      const q = new THREE.Quaternion();
      q.setFromEuler(new THREE.Euler(tiltX, currentYaw.current, tiltZ));
      if (currentPitch.current !== 0) {
        // Post-multiply: rotation applied in the body's pre-yaw local X frame,
        // so after yaw+π, the tape's leading edge (facing the slot) tips down.
        const pitchQ = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(1, 0, 0),
          currentPitch.current,
        );
        q.multiply(pitchQ);
      }
      body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    } else if (wasDragging.current) {
      wasDragging.current = false;
      if (snap.tapeId === tape.id) {
        // Dropped over the recorder — tween into the loaded pose instead of falling.
        isSnapping.current = true;
        snapElapsed.current = 0;
        const t = body.translation();
        const r = body.rotation();
        snapStart.current = {
          x: t.x,
          y: t.y,
          z: t.z,
          qx: r.x,
          qy: r.y,
          qz: r.z,
          qw: r.w,
        };
        snapTarget.current = { x: snap.x, y: snap.y, z: snap.z, yaw: snap.yaw };
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        body.setGravityScale(0, true);
      } else {
        // Release: start a gentle fall instead of snapping
        falling.current = true;
        body.setTranslation(
          {
            x: smoothPos.current.x,
            y: currentDragY.current,
            z: smoothPos.current.z,
          },
          true,
        );
        body.setGravityScale(0.15, true);
        const vx = velocity.current.x * 0.4;
        const vz = velocity.current.z * 0.4;
        body.setLinvel({ x: vx, y: -2, z: vz }, true);
        body.setAngvel({ x: vz * 0.3, y: 0, z: -vx * 0.3 }, true);
      }
    }

    // Snap-into-recorder tween. Eases translation + rotation from release pose
    // to the loaded pose, then pins via the isLoaded branch below.
    if (isSnapping.current && !isDragged) {
      snapElapsed.current += delta;
      const t01 = Math.min(1, snapElapsed.current / SNAP_DURATION);
      const e = 1 - Math.pow(1 - t01, 3); // ease-out cubic
      const s = snapStart.current;
      const g = snapTarget.current;
      body.setTranslation(
        {
          x: s.x + (g.x - s.x) * e,
          y: s.y + (g.y - s.y) * e,
          z: s.z + (g.z - s.z) * e,
        },
        true,
      );
      const startQ = new THREE.Quaternion(s.qx, s.qy, s.qz, s.qw);
      const endQ = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, g.yaw, 0),
      );
      const q = startQ.clone().slerp(endQ, e);
      body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      if (t01 >= 1) {
        isSnapping.current = false;
        isLoaded.current = true;
        setLoaded(true);
        // Switch to kinematic while loaded — no physics contacts, no jitter.
        body.setBodyType(2, true);
      }
    }

    // Loaded: pin to snap pose, or release if another tape has taken the slot.
    if (isLoaded.current && !isDragged && !isSnapping.current) {
      if (snap.tapeId !== tape.id) {
        // Another tape took the recorder slot — fall.
        isLoaded.current = false;
        setLoaded(false);
        body.setBodyType(0, true);
        falling.current = true;
        body.setGravityScale(1, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      } else {
        body.setTranslation({ x: snap.x, y: snap.y, z: snap.z }, true);
        const q = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, snap.yaw, 0),
        );
        body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
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

    // Spool spin only while loaded in recorder AND YouTube is playing.
    spinRef.current = isLoaded.current && !!isPlayingRef?.current;

    // Inactivity fade. Shadow drops at opacity > 0.85 so it leads rather than
    // lags the body transition; group is hidden entirely once effectively clear.
    if (materialsRef.current.length) {
      const opTarget = hidden ? 0 : 1;
      const k = 1 - Math.exp(-delta * 4.5);
      opacityRef.current += (opTarget - opacityRef.current) * k;
      const castOn = opacityRef.current > 0.85;
      sceneData?.group.traverse((child) => {
        const m = child as THREE.Mesh;
        if (m.isMesh) m.castShadow = castOn;
      });
      // Disable depthWrite while fading so sub-meshes (body shell vs. spools)
      // don't z-fight and produce stencil-like cutouts at low opacity.
      const writeDepth = opacityRef.current > 0.995;
      for (const mat of materialsRef.current) {
        mat.opacity = opacityRef.current;
        mat.depthWrite = writeDepth;
      }
      const g = groupRef.current;
      if (g) g.visible = opacityRef.current > 0.02;
    }
  });

  if (!sceneData || !textures) return null;

  const { geo } = sceneData;

  return (
    <RigidBody
      ref={bodyRef}
      position={[x3d, spawnY, z3d]}
      rotation={[0, angleRad, 0]}
      type="dynamic"
      colliders={false}
      linearDamping={2.5}
      angularDamping={5}
      mass={0.5}
      restitution={0.05}
      friction={0.9}
      ccd={true}
    >
      <CuboidCollider args={[geo.halfX, geo.halfY, geo.halfZ]} />
      <group name={`tape-${tape.id}`} ref={groupRef}>
        <primitive object={sceneData.group} />
        {loaded && (
          <>
            <SpoolDisc
              x={-2.2 * geo.scale}
              z={0.3 * geo.scale}
              halfY={geo.halfY}
              spinningRef={spinRef}
              opacityRef={opacityRef}
              rpm={15}
              radius={0.765 * geo.scale}
              yOffset={-0.04}
            />
            <SpoolDisc
              x={1.9 * geo.scale}
              z={0.3 * geo.scale}
              halfY={geo.halfY}
              spinningRef={spinRef}
              opacityRef={opacityRef}
              rpm={30}
              radius={0.765 * geo.scale}
              yOffset={-0.04}
            />
          </>
        )}
      </group>
    </RigidBody>
  );
}
