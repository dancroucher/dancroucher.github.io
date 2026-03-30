import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MixtapeCreator } from './Creator';
import { MixtapePlayback } from './Playback';
import type { Track } from './TrackList';

type Screen = 'loading' | 'creator' | 'playback';

interface MixtapeData {
  id?: string;
  name: string;
  description: string;
  tracks: Track[];
}

const MIXTAPE_STORAGE_KEY = 'jeem_mixtape';

// Mount into a dedicated DOM node
function mount(root: HTMLDivElement) {
  const appRoot = createRoot(root);

  function App() {
    const [screen, setScreen] = useState<Screen>('loading');
    const [playbackData, setPlaybackData] = useState<MixtapeData | null>(null);

    useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const createMode = params.get('create_mixtape');
      const tapeId = params.get('tape');

      if (createMode === '1') {
        setScreen('creator');
      } else if (tapeId) {
        // Load saved mixtape from API, show Playback UI
        fetch(`/api/mixtape/${tapeId}`)
          .then(r => r.json())
          .then(data => {
            if (data.error || !data.tracks) { window.location.href = '/'; return; }
            const mixtape: MixtapeData = {
              id: tapeId,
              name: data.name,
              description: data.description || '',
              tracks: data.tracks,
            };
            setPlaybackData(mixtape);
            setScreen('playback');
          })
          .catch(() => { window.location.href = '/'; });
      } else {
        // No mixtape param — go to main site
        window.location.href = '/';
      }
    }, []);

    const handleBack = () => {
      window.history.replaceState({}, '', window.location.pathname);
      window.location.href = '/';
    };

    const handlePlay = (tape: MixtapeData) => {
      // tape.id is the UUID from the save API response
      if (tape.id) {
        window.location.href = `/?tape=${tape.id}`;
      } else {
        // Fallback: store and go to main table
        try { sessionStorage.setItem(MIXTAPE_STORAGE_KEY, JSON.stringify(tape)); } catch {}
        window.location.href = '/?mixtape=1';
      }
    };

    if (screen === 'loading') return null;
    if (screen === 'playback' && playbackData) {
      return <MixtapePlayback name={playbackData.name} description={playbackData.description} tracks={playbackData.tracks} autoplay />;
    }

    return <MixtapeCreator onBack={handleBack} onPlay={handlePlay} />;
  }

  appRoot.render(<App />);
}

// Auto-mount when script loads (after DOM ready)
function init() {
  const existing = document.getElementById('mixtape-root');
  if (existing) existing.remove();

  const root = document.createElement('div');
  root.id = 'mixtape-root';
  document.body.appendChild(root);
  mount(root);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
