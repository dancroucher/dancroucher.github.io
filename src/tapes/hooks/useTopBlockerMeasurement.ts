import { useState, useEffect, useRef } from 'react';

/**
 * Tracks the bottom edge of the visible song/title text so the playback
 * tracklist panel can anchor below it on thin screens. Replaces a 500 ms
 * polling interval with ResizeObserver + MutationObserver — fires only
 * when the DOM actually changes.
 */
export function useTopBlockerMeasurement(): number {
  const [topBlockerBottom, setTopBlockerBottom] = useState(0);

  useEffect(() => {
    const measure = () => {
      let maxBottom = 0;
      for (const [innerId, outerId] of [
        ['song-author', 'song-container'],
        ['title', 'title-container'],
      ]) {
        const outer = document.getElementById(outerId);
        if (!outer || getComputedStyle(outer).display === 'none') continue;
        const inner = document.getElementById(innerId);
        const el = inner && inner.offsetParent !== null ? inner : outer;
        const b = el.getBoundingClientRect().bottom;
        if (b > maxBottom) maxBottom = b;
      }
      setTopBlockerBottom(prev => (prev === maxBottom ? prev : maxBottom));
    };

    measure();

    const ro = new ResizeObserver(measure);
    const mo = new MutationObserver(measure);
    const targets = ['song-container', 'song-author', 'title-container', 'title']
      .map(id => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);

    targets.forEach(el => {
      ro.observe(el);
      mo.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
    });

    window.addEventListener('resize', measure);

    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  return topBlockerBottom;
}
