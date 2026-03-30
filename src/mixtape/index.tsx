import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MixtapeCreator } from './Creator';
import { MixtapePlayback } from './Playback';
import type { Track } from './TrackList';

type Screen = 'loading' | 'creator' | 'playback';

interface MixtapeData {
  name: string;
  description: string;
  tracks: Track[];
}

// Mount into a dedicated DOM node
function mount(root: HTMLDivElement) {
  const appRoot = createRoot(root);

  function App() {
    const [screen, setScreen] = useState<Screen>('loading');
    const [tapeData, setTapeData] = useState<MixtapeData | null>(null);

    useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const mixtapeMode = params.get('mixtape');
      const tapeId = params.get('tape');

      if (mixtapeMode === '1') {
        setScreen('creator');
      } else if (tapeId) {
        // Load saved mixtape
        fetch(`/api/mixtape/${tapeId}`)
          .then(r => r.json())
          .then(data => {
            if (data.error || !data.tracks) {
              alert('Tape not found or expired');
              setScreen('creator');
              return;
            }
            setTapeData({ name: data.name, description: data.description || '', tracks: data.tracks });
            setScreen('playback');
          })
          .catch(() => {
            alert('Failed to load tape');
            setScreen('creator');
          });
      } else {
        setScreen('creator');
      }
    }, []);

    const handleBack = () => {
      // Clear URL params and go to main site
      window.history.replaceState({}, '', window.location.pathname);
      window.location.reload();
    };

    const handlePlay = (tape: MixtapeData) => {
      setTapeData(tape);
      setScreen('playback');
    };

    if (screen === 'loading') return null;

    if (screen === 'playback' && tapeData) {
      return <MixtapePlayback {...tapeData} onBack={handleBack} />;
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
