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

      if (createMode === '1') {
        setScreen('creator');
      } else {
        // No mixtape param — go to main site
        window.location.href = '/';
      }
    }, []);

    const handleBack = () => {
      window.history.replaceState({}, '', window.location.pathname);
      window.location.href = '/';
    };

    const handleSave = (tape: { name: string; description: string; tracks: Track[] }) => {
      // Save to sessionStorage and show on table (no UUID, no API call)
      try { sessionStorage.setItem(MIXTAPE_STORAGE_KEY, JSON.stringify(tape)); } catch {}
      window.location.href = '/?mixtape=1';
    };

    if (screen === 'loading') return null;

    return <MixtapeCreator onBack={handleBack} onPlay={handleSave} />;
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
