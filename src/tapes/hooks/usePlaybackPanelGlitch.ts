import { useState, useEffect, useRef } from 'react';

/**
 * Brief glitch-in flicker on the playback info panel each time `isPlaying`
 * transitions from false → true.
 */
export function usePlaybackPanelGlitch(isPlaying: boolean): boolean {
  const [glitching, setGlitching] = useState(false);
  const wasPlayingRef = useRef(false);

  useEffect(() => {
    if (isPlaying && !wasPlayingRef.current) {
      setGlitching(true);
      const t = setTimeout(() => setGlitching(false), 500);
      wasPlayingRef.current = true;
      return () => clearTimeout(t);
    }
    if (!isPlaying) wasPlayingRef.current = false;
  }, [isPlaying]);

  return glitching;
}
