import React from 'react';
import { createRoot } from 'react-dom/client';
import { TapesTable } from './TapesTable';

// Mount the React tapes table into the DOM
const container = document.getElementById('tapes-root');
if (container) {
  const root = createRoot(container);
  root.render(<TapesTable />);
}
