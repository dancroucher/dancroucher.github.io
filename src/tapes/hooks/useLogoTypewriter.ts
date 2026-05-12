import { useEffect, useRef } from 'react';

/**
 * Replaces the "// jeem-fm" logo link with a back-arrow while in inspect mode,
 * with a typewriter peel-in / type-out animation. Cancels any in-flight
 * animation on rapid inspect on/off so the element never ends up mid-state.
 * Also migrates the timer from an untyped DOM property into a ref.
 */
export function useLogoTypewriter(inspectTapeId: string | null): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const links = document.querySelectorAll<HTMLAnchorElement>(
      '.start-title a, .title a',
    );
    links.forEach(a => {
      // Cancel any previous animation
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      if (!a.dataset.jfmInit) {
        const original = (a.textContent || '').trim();
        const m = original.match(/^(\/\/\s*)(.*)$/);
        const prefix = m ? m[1] : '// ';
        const suffix = m ? m[2] : original;
        a.dataset.jfmSuffix = suffix;
        a.dataset.jfmInit = '1';
        a.textContent = '';
        a.appendChild(document.createTextNode(prefix));
        const span = document.createElement('span');
        span.className = 'jfm-suffix';
        span.textContent = suffix;
        a.appendChild(span);
        return; // seeded on first run — no animation
      }

      const suffixEl = a.querySelector<HTMLElement>('.jfm-suffix');
      if (!suffixEl) return;
      const savedSuffix = a.dataset.jfmSuffix || 'jeem-fm';
      const arrowHtml = '<span class="jfm-back-arrow">&lt;</span>';

      if (inspectTapeId) {
        // Inspect mode: peel suffix right-to-left, then swap to arrow
        let pos = savedSuffix.length;
        const peel = () => {
          if (pos <= 0) {
            suffixEl.innerHTML = arrowHtml;
            return;
          }
          pos--;
          suffixEl.textContent = savedSuffix.slice(0, pos);
          timerRef.current = setTimeout(peel, 70);
        };
        peel();
      } else {
        // Back to table: clear arrow, type suffix left-to-right
        if (suffixEl.innerHTML === arrowHtml) suffixEl.innerHTML = '';
        let pos = 0;
        const type = () => {
          if (pos >= savedSuffix.length) return;
          pos++;
          suffixEl.textContent = savedSuffix.slice(0, pos);
          timerRef.current = setTimeout(type, 70);
        };
        type();
      }
    });

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [inspectTapeId]);
}
