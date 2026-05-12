import { useState, useEffect } from 'react';

/**
 * Tracks whether the viewport is narrow (≤960 px) so layout can collapse
 * to a full-width bottom-anchored style on phones.
 */
export function useIsNarrow(): boolean {
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth <= 960,
  );

  useEffect(() => {
    const handler = () => setIsNarrow(window.innerWidth <= 960);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return isNarrow;
}
