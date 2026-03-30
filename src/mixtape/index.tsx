import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MixtapeCreator } from './Creator';
import type { Track } from './TrackList';

type Screen = 'loading' | 'creator';

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

    useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const createMode = params.get('create_mixtape');
      const tapeId = params.get('tape');

      if (createMode === '1') {
        setScreen('creator');
      } else if (tapeId) {
        // Load saved mixtape from API, store in sessionStorage, redirect to main table
        fetch(`/api/mixtape/${tapeId}`)
          .then(r => r.json())
          .then(data => {
            if (data.error || !data.tracks) { window.location.href = '/'; return; }
            try {
              sessionStorage.setItem(MIXTAPE_STORAGE_KEY, JSON.stringify({
                id: tapeId,
                name: data.name,
                description: data.description || '',
                tracks: data.tracks,
              }));
            } catch {}
            window.location.href = '/?mixtape=1';
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
      // Save UUID so /?tape={uuid} can reload it from sessionStorage
      try { sessionStorage.setItem(MIXTAPE_STORAGE_KEY, JSON.stringify(tape)); } catch {}
      window.location.href = '/?mixtape=1';
    };

    const handlePreview = (tape: { name: string; description: string; tracks: Track[] }) => {
      // Preview on table without saving — no UUID needed
      try { sessionStorage.setItem(MIXTAPE_STORAGE_KEY, JSON.stringify(tape)); } catch {}
      window.location.href = '/?mixtape=1';
    };

    if (screen === 'loading') return null;

    return <MixtapeCreator onBack={handleBack} onPlay={handlePlay} onPreview={handlePreview} />;
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
