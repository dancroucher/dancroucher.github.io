import React from 'react';
import { Tape, TAPE_STYLES } from './types';
import { Spool } from './Spool';

interface CassetteTapeProps {
  tape: Tape;
  playing?: boolean;
  scale?: number;
}

export function CassetteTape({ tape, playing = false, scale = 1 }: CassetteTapeProps) {
  const style = TAPE_STYLES[tape.tapeStyle % TAPE_STYLES.length];
  const progress = tape.progress || 0;

  // Base dimensions (at scale 1 = 234x143)
  const W = 234;
  const H = 143;
  const R = (v: number) => v * scale;

  const labelH = H * 0.38;
  const labelY = H * 0.08;
  const labelX = W * 0.08;
  const labelW = W * 0.84;

  const windowY = labelY + labelH + R(4);
  const windowH = H * 0.22;
  const windowX = W * 0.12;
  const windowW = W * 0.76;

  const spoolR = windowH * 0.42;
  const spoolLX = windowX + windowW * 0.27;
  const spoolRX = windowX + windowW * 0.73;
  const spoolY = windowY + windowH * 0.5;

  const botH = H * 0.14;
  const botProtrW = W * 0.64;
  const botProtrH = botH * 0.75;

  // Label shape variant based on tape style
  const labelVariant = tape.tapeStyle % 6;

  // Truncate title to fit label
  const maxChars = 28;
  const displayTitle = tape.title.length > maxChars
    ? tape.title.slice(0, maxChars - 1) + '...'
    : tape.title;

  const displayAuthor = tape.author.length > 18
    ? tape.author.slice(0, 17) + '...'
    : tape.author;

  return (
    <div style={{
      width: W, height: H,
      position: 'relative',
      borderRadius: R(5),
      background: `linear-gradient(160deg, ${style.housing} 0%, ${style.housingAlt} 100%)`,
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.15)`,
      overflow: 'hidden',
      userSelect: 'none',
    }}>
      {/* Housing texture — subtle noise */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: R(5),
        background: 'repeating-linear-gradient(90deg, transparent 0px, transparent 2px, rgba(0,0,0,0.02) 2px, rgba(0,0,0,0.02) 4px)',
        pointerEvents: 'none',
      }} />

      {/* Wear marks */}
      <div style={{
        position: 'absolute', left: '10%', top: '15%', width: '30%', height: '8%',
        background: 'rgba(255,255,255,0.06)', borderRadius: '50%',
        transform: 'rotate(-5deg)', pointerEvents: 'none',
      }} />

      {/* Screw holes */}
      {[[R(8), R(8)], [W - R(8), R(8)], [R(8), H - R(8)], [W - R(8), H - R(8)]].map(([x, y], i) => (
        <div key={i} style={{
          position: 'absolute', left: x - R(3), top: y - R(3),
          width: R(6), height: R(6), borderRadius: '50%',
          background: 'rgba(0,0,0,0.15)',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.3), 0 0.5px 0 rgba(255,255,255,0.1)',
        }} />
      ))}

      {/* Label */}
      <div style={{
        position: 'absolute', left: labelX, top: labelY,
        width: labelW, height: labelH,
        background: `linear-gradient(170deg, ${style.label} 0%, ${style.labelAlt} 100%)`,
        borderRadius: labelVariant === 0 ? R(3)
          : labelVariant === 1 ? `${R(3)}px ${R(3)}px ${R(8)}px ${R(8)}px`
          : labelVariant === 2 ? `${R(8)}px ${R(8)}px ${R(3)}px ${R(3)}px`
          : labelVariant === 3 ? R(1)
          : labelVariant === 4 ? `${R(6)}px`
          : R(2),
        overflow: 'hidden',
        border: '0.5px solid rgba(0,0,0,0.1)',
      }}>
        {/* Label lines */}
        {[0.35, 0.5, 0.65, 0.8].map((pct, i) => (
          <div key={i} style={{
            position: 'absolute', left: '8%', right: '8%',
            top: `${pct * 100}%`, height: 0.5,
            background: i === 0 ? style.accent : 'rgba(0,0,0,0.08)',
            opacity: i === 0 ? 0.6 : 1,
          }} />
        ))}

        {/* Title text */}
        <div style={{
          position: 'absolute', left: '10%', right: '10%', top: '12%',
          fontSize: R(11), fontWeight: 700,
          color: style.textColor,
          fontFamily: "'Courier New', monospace",
          letterSpacing: -0.3,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {displayTitle}
        </div>

        {/* Author text */}
        <div style={{
          position: 'absolute', left: '10%', right: '10%', top: '50%',
          fontSize: R(8.5), fontWeight: 400,
          color: style.textColor,
          fontFamily: "'Courier New', monospace",
          opacity: 0.7,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {displayAuthor}
        </div>

        {/* Type indicator */}
        <div style={{
          position: 'absolute', right: '8%', top: '10%',
          fontSize: R(7), fontWeight: 600,
          color: style.accent,
          fontFamily: "sans-serif",
          opacity: 0.8,
        }}>
          {tape.isPlaylist ? 'PL' : ''}
        </div>

        {/* Decorative accent stripe */}
        <div style={{
          position: 'absolute', left: 0, top: 0,
          width: R(3), height: '100%',
          background: style.accent, opacity: 0.4,
        }} />
      </div>

      {/* Tape window with CSS mask for spool holes */}
      <div style={{
        position: 'absolute', left: windowX, top: windowY,
        width: windowW, height: windowH,
        background: style.windowTint,
        borderRadius: `${R(3)}px ${R(3)}px ${R(6)}px ${R(6)}px`,
        border: '0.5px solid rgba(0,0,0,0.2)',
        overflow: 'hidden',
      }}>
        {/* Inner shadow */}
        <div style={{
          position: 'absolute', inset: 0,
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)',
          borderRadius: 'inherit',
          pointerEvents: 'none',
          zIndex: 2,
        }} />

        {/* SVG spools */}
        <svg width={windowW} height={windowH} style={{ position: 'absolute', left: 0, top: 0 }}>
          <Spool
            cx={windowW * 0.27} cy={windowH * 0.5} r={spoolR}
            color={style.spoolColor} tapeColor={style.tapeColor}
            progress={progress} playing={playing} side="L"
          />
          <Spool
            cx={windowW * 0.73} cy={windowH * 0.5} r={spoolR}
            color={style.spoolColor} tapeColor={style.tapeColor}
            progress={progress} playing={playing} side="R"
          />
          {/* Tape path between spools */}
          <path
            d={`M ${windowW * 0.27} ${windowH * 0.5 + spoolR}
                Q ${windowW * 0.5} ${windowH * 0.95}
                  ${windowW * 0.73} ${windowH * 0.5 + spoolR}`}
            fill="none"
            stroke={style.tapeColor}
            strokeWidth={1.5}
            opacity={0.6}
          />
        </svg>

        {/* Mid-section guide posts */}
        <div style={{
          position: 'absolute', left: '46%', top: '70%', width: R(3), height: R(6),
          background: 'rgba(0,0,0,0.25)', borderRadius: R(1),
        }} />
        <div style={{
          position: 'absolute', left: '52%', top: '70%', width: R(3), height: R(6),
          background: 'rgba(0,0,0,0.25)', borderRadius: R(1),
        }} />
      </div>

      {/* Bottom protruding section — trapezoid */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: botH,
      }}>
        <div style={{
          position: 'absolute', bottom: R(2),
          left: W / 2 - botProtrW / 2,
          width: botProtrW, height: botProtrH,
          background: 'rgba(0,0,0,0.25)',
          border: '1px solid rgba(0,0,0,0.15)',
          clipPath: `polygon(${R(6)}px 0, ${botProtrW - R(6)}px 0, 100% 100%, 0 100%)`,
        }}>
          {/* 4 holes */}
          {[[R(22), '70%'], [R(42), '55%'], [botProtrW - R(42) - R(10), '55%'], [botProtrW - R(22) - R(10), '70%']].map(([left, top], i) => (
            <div key={i} style={{
              position: 'absolute', left: left as number, top: top as string,
              transform: 'translateY(-50%)',
              width: R(10), height: R(10),
              background: 'rgba(0,0,0,0.5)', borderRadius: '50%',
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}
