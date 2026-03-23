import * as THREE from 'three';
import { createRoot } from 'react-dom/client';
import React from 'react';
import html2canvas from 'html2canvas';
import { CassetteTape } from './CassetteTape';
import { Tape } from './types';

interface TapeTextures {
  color: THREE.Texture;
  normal: THREE.Texture;
  heightMapCanvas: HTMLCanvasElement;
  normalMapCanvas: HTMLCanvasElement;
}

const cache = new Map<string, TapeTextures>();
const pending = new Map<string, Promise<TapeTextures>>();
let active = 0;
const MAX_CONCURRENT = 1;
const queue: (() => void)[] = [];

function cacheKey(tape: Tape): string {
  return `${tape.id}:${tape.tapeStyle}`;
}

function runNext() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const next = queue.shift()!;
    next();
  }
}

// ── Normal map from custom height map image ──
// Loads the hand-edited height map PNG and converts to normals via Sobel.

let heightMapImage: HTMLImageElement | null = null;
let heightMapLoading: Promise<HTMLImageElement> | null = null;

function loadHeightMapImage(): Promise<HTMLImageElement> {
  if (heightMapImage) return Promise.resolve(heightMapImage);
  if (heightMapLoading) return heightMapLoading;
  heightMapLoading = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { heightMapImage = img; resolve(img); };
    img.onerror = () => { console.error('Failed to load tape-heightmap.png'); resolve(img); };
    img.src = '/assets/tape-heightmap.png';
  });
  return heightMapLoading;
}

function generateNormalMap(_tape: Tape, w: number, h: number): Promise<{ heightMap: HTMLCanvasElement; normalMap: HTMLCanvasElement }> {
  return loadHeightMapImage().then((img) => {
    const scale = 2;
    const cw = w * scale, ch = h * scale;

    // Draw height map image to canvas
    const hCanvas = document.createElement('canvas');
    hCanvas.width = cw;
    hCanvas.height = ch;
    const ctx = hCanvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, cw, ch);

    // Save a copy for debug display
    const heightMap = document.createElement('canvas');
    heightMap.width = cw;
    heightMap.height = ch;
    heightMap.getContext('2d')!.drawImage(hCanvas, 0, 0);

    // Convert height map to normal map via Sobel
    const imgData = ctx.getImageData(0, 0, cw, ch);
    const pixels = imgData.data;
    const heights = new Float32Array(cw * ch);
    for (let i = 0; i < cw * ch; i++) {
      heights[i] = pixels[i * 4] / 255;
    }

    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = cw;
    normalCanvas.height = ch;
    const nCtx = normalCanvas.getContext('2d')!;
    const outData = nCtx.createImageData(cw, ch);
    const out = outData.data;
    const strength = 4.0;

    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const idx = y * cw + x;
        const l = x > 0 ? heights[idx - 1] : heights[idx];
        const r = x < cw - 1 ? heights[idx + 1] : heights[idx];
        const t = y > 0 ? heights[idx - cw] : heights[idx];
        const b = y < ch - 1 ? heights[idx + cw] : heights[idx];

        let nx = (l - r) * strength;
        let ny = (b - t) * strength;
        let nz = 1.0;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx /= len; ny /= len; nz /= len;
        const pi = idx * 4;
        out[pi] = Math.round((nx * 0.5 + 0.5) * 255);
        out[pi + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        out[pi + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        out[pi + 3] = 255;
      }
    }

    nCtx.putImageData(outData, 0, 0);
    return { heightMap, normalMap: normalCanvas };
  });
}

function renderTapeTexture(tape: Tape): Promise<TapeTextures> {
  const key = cacheKey(tape);
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);
  const inflight = pending.get(key);
  if (inflight) return inflight;

  const promise = new Promise<TapeTextures>((resolve) => {
    function start() {
      active++;
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '-9999px';
      container.style.fontFamily = "'04b03', monospace";
      document.body.appendChild(container);

      const root = createRoot(container);
      root.render(React.createElement(CassetteTape, { tape }));

      setTimeout(async () => {
        try {
          const canvas = await html2canvas(container, {
            backgroundColor: null,
            scale: 2,
            useCORS: true,
            ignoreElements: (el: Element) => {
              // Skip WebGL canvases to prevent context loss
              return el.tagName === 'CANVAS';
            },
          });
          const colorTex = new THREE.CanvasTexture(canvas);
          colorTex.colorSpace = THREE.SRGBColorSpace;
          colorTex.needsUpdate = true;

          // Generate normal map from custom height map image
          const { heightMap, normalMap } = await generateNormalMap(tape, 234, 143);
          const normalTex = new THREE.CanvasTexture(normalMap);
          normalTex.colorSpace = THREE.NoColorSpace;
          normalTex.generateMipmaps = true;
          normalTex.minFilter = THREE.LinearMipmapLinearFilter;
          normalTex.magFilter = THREE.LinearFilter;
          normalTex.needsUpdate = true;

          const textures: TapeTextures = { color: colorTex, normal: normalTex, heightMapCanvas: heightMap, normalMapCanvas: normalMap };
          cache.set(key, textures);
          resolve(textures);
        } catch (e) {
          console.error('Tape texture render failed:', e);
          const c = document.createElement('canvas');
          c.width = 468; c.height = 286;
          const ctx = c.getContext('2d')!;
          ctx.fillStyle = '#333';
          ctx.fillRect(0, 0, 468, 286);
          const colorTex = new THREE.CanvasTexture(c);
          colorTex.colorSpace = THREE.SRGBColorSpace;
          // Flat normal map fallback
          const nc = document.createElement('canvas');
          nc.width = 4; nc.height = 4;
          const nctx = nc.getContext('2d')!;
          nctx.fillStyle = 'rgb(128,128,255)';
          nctx.fillRect(0, 0, 4, 4);
          const normalTex = new THREE.CanvasTexture(nc);
          normalTex.colorSpace = THREE.NoColorSpace;
          resolve({ color: colorTex, normal: normalTex, heightMapCanvas: nc, normalMapCanvas: nc });
        } finally {
          try { root.unmount(); } catch {}
          try { document.body.removeChild(container); } catch {}
          active--;
          pending.delete(key);
          setTimeout(() => runNext(), 100);
        }
      }, 300);
    }

    if (active < MAX_CONCURRENT) {
      start();
    } else {
      queue.push(start);
    }
  });

  pending.set(key, promise);
  return promise;
}

export { renderTapeTexture, cache as textureCache };
export type { TapeTextures };
