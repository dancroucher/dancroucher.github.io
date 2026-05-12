import { useState, useEffect } from 'react';

/**
 * Dismiss-on-interaction callout logic. Callouts are shown on first inspect;
 * a single pointer-down anywhere on the page dismisses them.
 *
 * Returns [dismissed, setDismissed] so callers that inline the reset logic
 * (e.g. TapesTable.tsx) can call setDismissed directly.
 */
export function useCalloutsDismissed(
  showable: boolean,
): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!showable) { setDismissed(false); return; }
    setDismissed(false);
    const onDown = () => setDismissed(true);
    const t = window.setTimeout(() => {
      window.addEventListener('pointerdown', onDown, true);
    }, 150);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [showable]);

  return [dismissed, setDismissed];
}
