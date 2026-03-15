import React from 'react';

interface SpoolProps {
  cx: number;
  cy: number;
  r: number;
  color: string;
  tapeColor: string;
  progress: number;
  playing?: boolean;
  side: 'L' | 'R';
}

export function Spool({ cx, cy, r, color, tapeColor, progress, playing, side }: SpoolProps) {
  const hub = r * 0.38;
  const tapeR = side === 'L'
    ? hub + (r - hub) * (1 - progress)
    : hub + (r - hub) * progress;

  return (
    <g>
      {/* Tape reel */}
      <circle cx={cx} cy={cy} r={tapeR} fill={tapeColor} />
      {/* Hub */}
      <circle cx={cx} cy={cy} r={hub} fill={color} stroke="rgba(0,0,0,0.2)" strokeWidth={0.5} />
      {/* Sprocket teeth */}
      <g style={{
        transformOrigin: `${cx}px ${cy}px`,
        animation: playing ? 'tape-spin-slow 4s linear infinite' : 'none',
      }}>
        {[0, 60, 120, 180, 240, 300].map((angle) => {
          const rad = (angle * Math.PI) / 180;
          const tooth = hub * 0.65;
          return (
            <rect
              key={angle}
              x={cx + Math.cos(rad) * tooth - 1.5}
              y={cy + Math.sin(rad) * tooth - 1.5}
              width={3}
              height={3}
              rx={0.5}
              fill="rgba(0,0,0,0.35)"
              transform={`rotate(${angle}, ${cx + Math.cos(rad) * tooth}, ${cy + Math.sin(rad) * tooth})`}
            />
          );
        })}
      </g>
      {/* Center hole */}
      <circle cx={cx} cy={cy} r={hub * 0.2} fill="rgba(0,0,0,0.4)" />
    </g>
  );
}
