import { useEffect, useRef, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';

// Match the video plane in TableSurface.tsx (5:3 aspect, ~50×30 world units).
const VIDEO_H = 30;
const VIDEO_W = VIDEO_H * (4000 / 2400);

// Pixel size we hand to the iframe — higher = sharper text in the embed but
// bigger DOM scale-down. CSS3DRenderer maps 1px → 1 world unit, so we scale the
// CSS3DObject by VIDEO_W / IFRAME_PX_W to fit the world plane.
const IFRAME_PX_W = 1600;
const IFRAME_PX_H = Math.round(IFRAME_PX_W * (VIDEO_H / VIDEO_W));

// Renders the existing #demo_iframe (YouTube embed) on the table surface in
// "original" background mode (bgTypeIndex===3). Reparents the iframe ONCE into
// a CSS3DObject layered BEHIND the WebGL canvas, and uses a NoBlending alpha-0
// "hole punch" quad in the WebGL scene to clear the canvas color where the
// iframe should show — without writing depth, so the recorder/tapes still
// occlude the iframe normally.
export function YouTubeSurface() {
  // Surface YouTube iframe disabled — playback reverts to the vanilla 2D iframe.
  return null;
  // eslint-disable-next-line no-unreachable
  const { camera, gl } = useThree();
  const [active, setActive] = useState(() => {
    const bg = (window as any).Backgrounds;
    return bg ? bg.bgTypeIndex === 3 : false;
  });
  const cssRendererRef = useRef<CSS3DRenderer | null>(null);
  const cssSceneRef = useRef<THREE.Scene | null>(null);
  const rendererElRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent).detail as { bgTypeIndex?: number } | undefined;
      setActive(detail?.bgTypeIndex === 3);
    }
    window.addEventListener('jeem-bg-change', onChange);
    return () => window.removeEventListener('jeem-bg-change', onChange);
  }, []);

  // One-time setup: reparent iframe into CSS3D, mount CSS3DRenderer. Never
  // tear down on bg-mode toggle — that would reload the iframe and restart
  // playback. Toggle visibility via display:none on the renderer DOM instead.
  useEffect(() => {
    const canvas = gl.domElement;
    const parent = canvas.parentElement;
    if (!parent) return;

    let cleanup: (() => void) | null = null;
    let cancelled = false;

    const init = (iframe: HTMLIFrameElement) => {
      const originalParent = iframe.parentElement;
      const savedStyles = {
        position: iframe.style.position,
        top: iframe.style.top,
        left: iframe.style.left,
        width: iframe.style.width,
        height: iframe.style.height,
        zIndex: iframe.style.zIndex,
        pointerEvents: iframe.style.pointerEvents,
        objectFit: iframe.style.objectFit,
      };
      iframe.style.position = 'static';
      iframe.style.top = 'auto';
      iframe.style.left = 'auto';
      iframe.style.width = IFRAME_PX_W + 'px';
      iframe.style.height = IFRAME_PX_H + 'px';
      iframe.style.zIndex = 'auto';
      iframe.style.pointerEvents = 'none';
      iframe.style.objectFit = 'unset';

      const cssRenderer = new CSS3DRenderer();
      cssRenderer.setSize(canvas.clientWidth, canvas.clientHeight);
      const el = cssRenderer.domElement;
      el.style.position = 'absolute';
      el.style.top = '0';
      el.style.left = '0';
      el.style.width = '100%';
      el.style.height = '100%';
      el.style.pointerEvents = 'none';
      // BEHIND the canvas — canvas (alpha-transparent in the hole) sits on top.
      el.style.zIndex = '-1';
      el.style.display = 'none';
      parent.insertBefore(el, canvas);

      const css3d = new CSS3DObject(iframe);
      const scale = VIDEO_W / IFRAME_PX_W;
      css3d.scale.set(scale, scale, scale);
      css3d.position.set(0, 0.1, 0);
      css3d.rotation.set(-Math.PI / 2, 0, 0);

      const cssScene = new THREE.Scene();
      cssScene.add(css3d);

      cssRendererRef.current = cssRenderer;
      cssSceneRef.current = cssScene;
      rendererElRef.current = el;

      const onResize = () => cssRenderer.setSize(canvas.clientWidth, canvas.clientHeight);
      window.addEventListener('resize', onResize);

      return () => {
        window.removeEventListener('resize', onResize);
        cssRendererRef.current = null;
        cssSceneRef.current = null;
        rendererElRef.current = null;
        if (el.parentElement) el.parentElement.removeChild(el);
        if (originalParent && iframe.parentElement !== originalParent) {
          originalParent.appendChild(iframe);
        }
        Object.assign(iframe.style, savedStyles);
      };
    };

    const tryInit = () => {
      if (cancelled) return;
      const iframe = document.getElementById('demo_iframe') as HTMLIFrameElement | null;
      if (!iframe) {
        setTimeout(tryInit, 250);
        return;
      }
      cleanup = init(iframe);
    };
    tryInit();

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [gl]);

  // Toggle CSS3DRenderer DOM + canvas transparency on bg-mode change.
  useEffect(() => {
    const el = rendererElRef.current;
    if (el) el.style.display = active ? 'block' : 'none';
    const canvas = gl.domElement;
    canvas.style.background = active ? 'transparent' : '';
  }, [active, gl]);

  useFrame(() => {
    const r = cssRendererRef.current;
    const s = cssSceneRef.current;
    if (r && s && active) r.render(s, camera);
  });

  if (!active) return null;
  // Hole punch: writes (0,0,0,0) directly into the framebuffer (NoBlending),
  // depth-test enabled but depth-write disabled. Recorder/tapes already wrote
  // their colors + depth at lower depth values (closer to camera), so this
  // plane fails the depth test where they sit and only clears pixels that
  // would otherwise show the wood/overlay underneath. renderOrder pushes it
  // after every other opaque draw in the scene.
  return (
    <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={999}>
      <planeGeometry args={[VIDEO_W, VIDEO_H]} />
      <meshBasicMaterial
        color={0x000000}
        transparent
        opacity={0}
        blending={THREE.NoBlending}
        depthWrite={false}
      />
    </mesh>
  );
}
