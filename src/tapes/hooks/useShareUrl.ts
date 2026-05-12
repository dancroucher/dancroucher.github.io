import { useEffect, useRef } from 'react';
import { fetchShareById, decodeTapeShare, type SharePayload } from '../share';
import { randomTextureVariant } from '../textureVariants';
import type { Tape } from '../types';
import { TAPE_STYLES } from '../types';

/**
 * Parses `?t=<id>` or `?tape=<encoded>` from the URL on mount, strips the params,
 * writes the resolved Tape into `promiseRef`, and shows the table view if needed.
 * `init()` in the component awaits `promiseRef.current` before IndexedDB loads
 * so the shared tape prepends the list even if the network request is slow.
 *
 * @param spawnX  X position for the spawned tape (from cameraTargetRef)
 * @param spawnY  Y position for the spawned tape (from cameraTargetRef)
 * @param promiseRef  Ref that receives the async Tape result
 */
export function useShareUrl(
  spawnX: number,
  spawnY: number,
  promiseRef: React.MutableRefObject<Promise<Tape | null>>,
): void {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shortId = params.get('t');
    const encoded = params.get('tape');
    if (!shortId && !encoded) return;

    params.delete('t');
    params.delete('tape');
    window.history.replaceState(
      {},
      '',
      window.location.pathname + (params.toString() ? '?' + params.toString() : '') +
      window.location.hash,
    );

    const root = document.getElementById('tapes-root') as HTMLElement | null;
    if (root && root.style.display === 'none') {
      const fn = (window as Record<string, unknown>).toggleTableView as (() => void) | undefined;
      fn?.();
    }

    promiseRef.current = (async (): Promise<Tape | null> => {
      let p: SharePayload | null = null;
      if (shortId) { try { p = await fetchShareById(shortId); } catch { /* fall through */ } }
      if (!p && encoded) p = decodeTapeShare(encoded);
      if (!p) return null;

      return {
        id: crypto.randomUUID?.() ?? `${Date.now()}`,
        videoId: p.videoId,
        playlistId: p.playlistId,
        isPlaylist: !!p.isPlaylist,
        isInfinite: p.isInfinite,
        infiniteConfig: p.infiniteConfig,
        infiniteHistory: p.infiniteHistory,
        infiniteIndex: p.infiniteIndex,
        title: p.title,
        author: p.author,
        tapeStyle: typeof p.tapeStyle === 'number'
          ? p.tapeStyle
          : Math.floor(Math.random() * TAPE_STYLES.length),
        textureVariant: p.textureVariant ?? randomTextureVariant(),
        progress: 0,
        timestamp: Date.now(),
        x: spawnX,
        y: spawnY,
        angle: Math.round((Math.random() * 40 - 20) * 10) / 10,
      } as Tape;
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
