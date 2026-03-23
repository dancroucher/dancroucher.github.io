import React from 'react';

export function Spool({ spinning, size = 32, rpm = 30, color = '#e8dcc4' }: { spinning?: boolean; size?: number; rpm?: number; color?: string }) {
  // Ring: r=12 (20% larger than 10), strokeWidth=2.8, inner edge at r=10.6
  const ringR = 12;
  const strokeW = 2.8;
  const innerR = ringR - strokeW / 2;
  const toothW = 2.7;
  const toothL = 3.24;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width={size} height={size} style={{ animation: spinning ? `tape-spin-fast ${60 / rpm}s linear infinite` : 'none', display: 'block' }}>
      {/* Cream outer ring */}
      <circle cx="16" cy="16" r={ringR} fill="none" stroke={color} strokeWidth={strokeW} />
      {/* 6 teeth on inner edge pointing inward */}
      {[0, 60, 120, 180, 240, 300].map(a => (
        <rect key={a} x={16 - toothW / 2} y={16 - innerR} width={toothW} height={toothL} rx={0.3} fill={color} transform={`rotate(${a} 16 16)`} />
      ))}
    </svg>
  );
}
