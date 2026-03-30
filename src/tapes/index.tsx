import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TapesTable, MixtapeData } from './TapesTable';

const MIXTAPE_STORAGE_KEY = 'jeem_mixtape';

function getMixtapeFromStorage(): MixtapeData | undefined {
  try {
    const raw = sessionStorage.getItem(MIXTAPE_STORAGE_KEY);
    if (!raw) return undefined;
    const data = JSON.parse(raw) as MixtapeData;
    if (!data?.name || !Array.isArray(data.tracks)) return undefined;
    return data;
  } catch { return undefined; }
}

const params = new URLSearchParams(window.location.search);
const showMixtape = params.get('mixtape') === '1';
const initialMixtape = showMixtape ? getMixtapeFromStorage() : undefined;

// Mount the React tapes table into the DOM
const container = document.getElementById('tapes-root');
if (container) {
  const root = createRoot(container);
  root.render(<TapesTable mixtape={initialMixtape} />);
}
