import React from 'react';
import { Tape, TAPE_STYLES } from './types';
import { Spool } from './Spool';

export function CassetteTape({ tape, playing, big, loading }: { tape: Tape; playing?: boolean; big?: boolean; loading?: boolean }) {
  const st = TAPE_STYLES[(tape.tapeStyle ?? 0) % TAPE_STYLES.length];
  const s = big ? 1.35 : 1;
  const R = (v: number) => Math.round(v * s);
  const isMixtape = tape.author === 'mixtape' && !!tape.isInfinite;

  const w = R(234), h = R(143);
  const padT = R(16), padLR = R(16);
  const labelH = R(28);
  const spoolSz = R(28);
  const spoolY = R(68);
  const spoolSpread = R(52);
  const winW = R(66), winH = R(26);
  const screwSz = R(14);
  const botH = R(30);
  const botProtrW = R(150), botProtrH = R(28);
  const spoolAreaTop = padT + labelH + R(2);
  const spoolAreaBot = h - botH - R(14) - R(6) - R(2);

  // CSS mask: cut holes inside the teeth tips
  const holeR = spoolSz * (7.36 / 32);
  const hole1x = w / 2 - spoolSpread, hole2x = w / 2 + spoolSpread;
  const maskLayers = [
    `radial-gradient(circle ${holeR}px at ${hole1x}px ${spoolY}px, transparent ${holeR}px, black ${holeR + 0.5}px)`,
    `radial-gradient(circle ${holeR}px at ${hole2x}px ${spoolY}px, transparent ${holeR}px, black ${holeR + 0.5}px)`,
  ].join(', ');

  const seed = tape.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);

  return (
    <div style={{ width: w, height: h, borderRadius: R(4), position: 'relative', boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      WebkitMaskImage: maskLayers, WebkitMaskComposite: 'destination-in',
      maskImage: maskLayers, maskComposite: 'intersect',
    } as React.CSSProperties}>

      {/* Housing background — with spool holes cut */}
      {(() => {
        const ringInnerR = spoolSz * (10.6 / 32);
        const housingMask = [
          `radial-gradient(circle ${ringInnerR}px at ${hole1x}px ${spoolY}px, transparent ${ringInnerR}px, black ${ringInnerR + 0.5}px)`,
          `radial-gradient(circle ${ringInnerR}px at ${hole2x}px ${spoolY}px, transparent ${ringInnerR}px, black ${ringInnerR + 0.5}px)`,
        ].join(', ');
        return <div style={{ position: 'absolute', inset: 0, backgroundColor: st.housing, borderRadius: R(4),
          WebkitMaskImage: housingMask, WebkitMaskComposite: 'destination-in',
          maskImage: housingMask, maskComposite: 'intersect',
        } as React.CSSProperties} />;
      })()}

      {/* Ridged texture — varies per tape */}
      {(() => {
        const textureVariant = seed % 5;
        const textures = [
          `repeating-linear-gradient(90deg, transparent 0px, transparent 3px, rgba(255,255,255,0.04) 3px, rgba(255,255,255,0.04) 4px)`,
          `repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 3px)`,
          `repeating-linear-gradient(90deg, transparent 0px, transparent 4px, rgba(255,255,255,0.025) 4px, rgba(255,255,255,0.025) 5px), repeating-linear-gradient(0deg, transparent 0px, transparent 4px, rgba(255,255,255,0.025) 4px, rgba(255,255,255,0.025) 5px)`,
          `repeating-linear-gradient(135deg, transparent 0px, transparent 3px, rgba(255,255,255,0.03) 3px, rgba(255,255,255,0.03) 4px)`,
          'none',
        ];
        return <div style={{ position: 'absolute', inset: 0, background: textures[textureVariant], borderRadius: R(4), pointerEvents: 'none' }} />;
      })()}

      {/* Aged wear marks */}
      {(() => {
        const showScuff = (seed >> 4) % 3 === 0;
        const showCornerWear = (seed >> 5) % 4 === 0;
        const showEdgeHighlight = (seed >> 6) % 3 === 0;
        return <>
          {showScuff && <div style={{ position: 'absolute', top: R(30 + (seed % 20)), left: R(10 + (seed % 40)), width: R(30 + (seed % 50)), height: 1, background: 'rgba(255,255,255,0.06)', transform: `rotate(${(seed % 10) - 5}deg)`, pointerEvents: 'none' }} />}
          {showCornerWear && <div style={{ position: 'absolute', top: 0, right: 0, width: R(20), height: R(20), background: 'radial-gradient(circle at top right, rgba(255,255,255,0.05) 0%, transparent 70%)', borderRadius: `0 ${R(4)}px 0 0`, pointerEvents: 'none' }} />}
          {showEdgeHighlight && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.08)', borderRadius: `${R(4)}px ${R(4)}px 0 0`, pointerEvents: 'none' }} />}
        </>;
      })()}

      {/* Coloured mid-section between labels — with spool holes cut */}
      {(() => {
        const ringInnerR = spoolSz * (10.6 / 32);
        const mx1 = hole1x - padLR, mx2 = hole2x - padLR;
        const my = spoolY - spoolAreaTop;
        const midMask = [
          `radial-gradient(circle ${ringInnerR}px at ${mx1}px ${my}px, transparent ${ringInnerR}px, black ${ringInnerR + 0.5}px)`,
          `radial-gradient(circle ${ringInnerR}px at ${mx2}px ${my}px, transparent ${ringInnerR}px, black ${ringInnerR + 0.5}px)`,
        ].join(', ');
        return (
        <div style={{ position: 'absolute', top: spoolAreaTop, left: padLR, right: padLR, bottom: h - spoolAreaBot, background: st.midBg, borderRadius: R(2), overflow: 'hidden',
          WebkitMaskImage: midMask, WebkitMaskComposite: 'destination-in',
          maskImage: midMask, maskComposite: 'intersect',
        } as React.CSSProperties}>
          {/* Mid-section texture */}
          {(() => {
            const midVariant = (seed >> 2) % 6;
            const midTextures = [
              'repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 3px)',
              'repeating-linear-gradient(45deg, transparent 0px, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 4px)',
              'repeating-linear-gradient(90deg, transparent 0px, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 4px)',
              'radial-gradient(circle 0.5px at 2px 2px, rgba(0,0,0,0.08) 0.5px, transparent 0.5px)',
              'linear-gradient(180deg, rgba(0,0,0,0.08) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.08) 100%)',
              'none',
            ];
            return <div style={{ position: 'absolute', inset: 0, background: midTextures[midVariant], backgroundSize: midVariant === 3 ? '4px 4px' : undefined, pointerEvents: 'none' }} />;
          })()}
          {/* Brand-style text on mid-section */}
          {(() => {
            const showBrandText = (seed >> 3) % 3 === 0;
            const brandTexts = ['HIGH FIDELITY', 'SUPER AVILYN', 'EPITAXIAL', 'EXTRA SLIM CASE', 'PROFESSIONAL', 'ACOUSTIC DYNAMIC', 'PREMIUM', 'ULTRA', 'COBALT', 'DIGITAL READY', 'MULTI USE'];
            const brandText = brandTexts[seed % brandTexts.length];
            if (!showBrandText) return null;
            return <span style={{ position: 'absolute', bottom: R(1), right: R(4), fontSize: R(4), color: 'rgba(0,0,0,0.12)', fontFamily: "'04b03', monospace", fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', pointerEvents: 'none' }}>{brandText}</span>;
          })()}
        </div>
      ); })()}

      {/* Black sprocket/window area — with spool holes cut */}
      {(() => {
        const spoolBoxW = spoolSpread * 2 + spoolSz + R(10);
        const boxLeft = w / 2 - spoolBoxW / 2;
        const boxTop = spoolAreaTop + R(3);
        const s1x = hole1x - boxLeft, s2x = hole2x - boxLeft;
        const sy = spoolY - boxTop;
        const ringInnerR = spoolSz * (10.6 / 32);
        const boxMask = [
          `radial-gradient(circle ${ringInnerR}px at ${s1x}px ${sy}px, transparent ${ringInnerR}px, black ${ringInnerR + 0.5}px)`,
          `radial-gradient(circle ${ringInnerR}px at ${s2x}px ${sy}px, transparent ${ringInnerR}px, black ${ringInnerR + 0.5}px)`,
        ].join(', ');
        return (
        <div style={{ position: 'absolute', top: boxTop, bottom: h - spoolAreaBot + R(3), left: boxLeft, width: spoolBoxW, background: st.housing, borderRadius: R(3), border: '1px solid rgba(0,0,0,0.3)',
          WebkitMaskImage: boxMask, WebkitMaskComposite: 'destination-in',
          maskImage: boxMask, maskComposite: 'intersect',
        } as React.CSSProperties} />
      ); })()}

      {/* Corner screws */}
      {(() => {
        const screwVariant = (seed >> 4) % 5;
        if (screwVariant === 4) return null;
        const screwSymbol = ['+', '+', '\u2014', '\u2B21'][screwVariant];
        const screwRotation = screwVariant === 2 ? `rotate(${(seed % 180)}deg)` : screwVariant === 1 ? `rotate(${(seed % 45)}deg)` : 'none';
        return [{ top: R(2), left: R(2) }, { top: R(2), right: R(2) }, { bottom: R(2), left: R(2) }, { bottom: R(2), right: R(2) }].map((pos, i) => (
          <div key={i} style={{ position: 'absolute', ...pos, width: screwSz, height: screwSz, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: '0.5px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: R(screwVariant === 3 ? 6 : 8), color: 'rgba(255,255,255,0.2)', lineHeight: 1 }}>
            <span style={{ transform: screwRotation }}>{screwSymbol}</span>
          </div>
        ));
      })()}

      {/* Title label strip */}
      {isMixtape ? (
        // Mixtape: white text on blue background, no rotation
        <div style={{ position: 'absolute', top: padT, left: padLR, right: padLR, height: labelH, background: 'linear-gradient(135deg, #1a4a8a, #0f3580)', borderRadius: R(3), overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
            <span style={{ fontFamily: "'Lacquer', cursive", fontSize: R(9), color: '#ffffff', letterSpacing: 1, lineHeight: 1 }}>Mixtape</span>
            <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: R(7), color: 'rgba(255,255,255,0.75)', letterSpacing: 0.5, lineHeight: 1, maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>{tape.title}</span>
          </div>
        </div>
      ) : (() => {
        const side = seed % 3 === 0 ? 'B' : 'A';
        const cornerTexts = ['C-90', '90', 'IEC I', 'EQ', '120\u03BCs', 'TYPE I', 'HiFi', 'CR', 'Fe', 'NR', 'TYPE II', 'CrO\u2082', 'METAL', 'IEC IV', '70\u03BCs', 'TYPE IV'];
        const cornerText = cornerTexts[seed % cornerTexts.length];
        const showArrow = seed % 4 === 0;
        const arrowDir = seed % 2 === 0 ? '\u25B6' : '\u25C0';
        const showDot = seed % 5 === 0;
        const tinyTexts = ['STEREO', 'NORMAL', 'LOW NOISE', 'HIGH OUTPUT', 'LN', 'EHF', 'SF', 'CHROME', 'SUPER AVILYN', 'EPITAXIAL', 'EXTRA SLIM', 'GAMMA', 'HIGH FIDELITY'];
        const showTiny = seed % 3 === 1;
        const tinyText = tinyTexts[seed % tinyTexts.length];

        const labelVariant = seed % 6;
        const labelRadius = labelVariant === 1 ? R(8) : R(2);
        const labelBorder = labelVariant === 5 ? `1.5px solid ${st.midBg}` : 'none';
        const labelBg = labelVariant === 5 ? 'rgba(255,255,255,0.6)' : st.titleBg;

        const markerVariant = (seed >> 2) % 5;
        const markerIsPlainText = markerVariant === 2;

        const lineVariant = (seed >> 3) % 4;
        const lineStyle = lineVariant === 2 ? '1px dashed rgba(0,0,0,0.1)' : '0.5px solid rgba(0,0,0,0.15)';

        const showTopStripe = labelVariant === 3;
        const showNotch = labelVariant === 2;
        const showDoubleArrow = (seed >> 4) % 7 === 0;
        const showBarcode = (seed >> 5) % 8 === 0;
        const showSmallLogo = (seed >> 6) % 5 === 0;
        const logoChars = ['\u25C6', '\u25CF', '\u25A0', '\u2605', '\u25B2', '\u25CE', '\u2B21', '\u25C7'];
        const logoChar = logoChars[(seed >> 7) % logoChars.length];

        return (
          <div style={{ position: 'absolute', top: padT, left: padLR, right: padLR, height: labelH, background: labelBg, borderRadius: labelRadius, border: labelBorder, overflow: 'hidden', transform: `rotate(${((tape.id.charCodeAt(0) % 5) - 2) * 0.4}deg)` }}>
            {/* Notched corners */}
            {showNotch && <>
              <div style={{ position: 'absolute', top: 0, left: 0, width: R(4), height: R(4), background: st.housing }} />
              <div style={{ position: 'absolute', top: 0, right: 0, width: R(4), height: R(4), background: st.housing }} />
            </>}
            {/* Top accent stripe */}
            {showTopStripe && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: R(3), background: st.midBg, opacity: 0.6 }} />}
            {/* Split two-tone background */}
            {labelVariant === 4 && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: st.midBg, opacity: 0.15 }} />}
            {/* Writing lines */}
            {lineVariant !== 3 && <>
              <div style={{ position: 'absolute', top: R(7), left: R(6), right: R(6), borderBottom: lineStyle }} />
              <div style={{ position: 'absolute', top: R(16), left: R(6), right: R(6), borderBottom: lineStyle }} />
              {lineVariant === 1 && <div style={{ position: 'absolute', top: R(22), left: R(6), right: R(6), borderBottom: lineStyle }} />}
            </>}
            {/* Side marker */}
            {markerIsPlainText ? (
              <span style={{ position: 'absolute', top: '50%', left: R(5), transform: 'translateY(-50%)', fontSize: R(14), fontFamily: "'04b03', monospace", fontWeight: 900, color: '#111', lineHeight: 1 }}>{side}</span>
            ) : (() => {
              const markerRadius = markerVariant === 1 || markerVariant === 4 ? '50%' : markerVariant === 3 ? `${R(4)}px` : `${R(1.5)}px`;
              const markerSize = markerVariant === 4 ? R(12) : R(15);
              const markerFontSize = markerVariant === 4 ? R(8) : R(11);
              return (
                <div style={{ position: 'absolute', top: '50%', left: R(4), transform: 'translateY(-50%)', width: markerSize, height: markerSize, background: '#111', borderRadius: markerRadius, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: markerFontSize, fontFamily: "'04b03', monospace", fontWeight: 900, color: st.titleBg, lineHeight: 1 }}>{side}</span>
                </div>
              );
            })()}
            {/* Corner text — top right */}
            <span style={{ position: 'absolute', top: R(2), right: R(5), fontSize: R(5.5), color: 'rgba(0,0,0,0.3)', fontFamily: "'04b03', monospace", fontWeight: 700, letterSpacing: '0.03em' }}>{cornerText}</span>
            {/* Optional arrow indicator */}
            {showArrow && <span style={{ position: 'absolute', bottom: R(2), right: R(5), fontSize: R(5), color: 'rgba(0,0,0,0.25)' }}>{arrowDir}</span>}
            {/* Double arrow */}
            {showDoubleArrow && <span style={{ position: 'absolute', bottom: R(2), left: R(22), fontSize: R(4.5), color: 'rgba(0,0,0,0.15)', letterSpacing: -1 }}>{'\u25B6\u25B6'}</span>}
            {/* Optional dot */}
            {showDot && <div style={{ position: 'absolute', bottom: R(3), right: R(16), width: R(3), height: R(3), borderRadius: '50%', background: 'rgba(0,0,0,0.2)' }} />}
            {/* Optional tiny text */}
            {showTiny && <span style={{ position: 'absolute', bottom: R(1.5), left: R(22), fontSize: R(4.5), color: 'rgba(0,0,0,0.2)', fontFamily: "'04b03', monospace", fontWeight: 600, letterSpacing: '0.08em' }}>{tinyText}</span>}
            {/* Barcode */}
            {showBarcode && <div style={{ position: 'absolute', bottom: R(2), right: R(20), display: 'flex', gap: 0.5 }}>
              {[3,1,2,1,3,1,1,2,1,3,1,2].map((w2, i) => <div key={i} style={{ width: w2 * 0.5, height: R(5), background: `rgba(0,0,0,${i % 2 === 0 ? 0.2 : 0})` }} />)}
            </div>}
            {/* Small decorative logo mark */}
            {showSmallLogo && <span style={{ position: 'absolute', top: R(1), left: R(22), fontSize: R(5), color: 'rgba(0,0,0,0.12)' }}>{logoChar}</span>}
            {/* Title text */}
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: R(24), right: R(6), display: 'flex', alignItems: 'center' }}>
              <p style={{ fontFamily: "'Lacquer', cursive", fontSize: big ? 15 : 12, fontWeight: 400, color: '#333', lineHeight: 1.15, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', width: '100%' } as React.CSSProperties}>
                {tape.title}
              </p>
            </div>
          </div>
        );
      })()}

      {/* Spools — left (supply) faster, right (take-up) slower */}
      {(() => {
        const spoolColor = tape.isInfinite ? '#e8c840' : undefined;
        return <>
          <div style={{ position: 'absolute', left: w / 2 - spoolSpread - spoolSz / 2, top: spoolY - spoolSz / 2 }}>
            <Spool spinning={playing} size={spoolSz} rpm={15} color={spoolColor} />
          </div>
          <div style={{ position: 'absolute', left: w / 2 + spoolSpread - spoolSz / 2, top: spoolY - spoolSz / 2 }}>
            <Spool spinning={playing} size={spoolSz} rpm={30} color={spoolColor} />
          </div>
        </>;
      })()}

      {/* Tape window between spools — with reels sized by progress */}
      {(() => {
        const winLeft = w / 2 - winW / 2;
        const winTop = spoolY - winH / 2;
        const prog = tape.progress ?? 0;
        const leftCx = (w / 2 - spoolSpread) - winLeft;
        const rightCx = (w / 2 + spoolSpread) - winLeft;
        const reelCy = spoolY - winTop;
        const maxR = R(60);
        const minR = R(8);
        const leftReelR = maxR - (maxR - minR) * prog;
        const rightReelR = minR + (maxR - minR) * prog;

        return (
          <div style={{ position: 'absolute', left: winLeft, top: winTop, width: winW, height: winH, borderRadius: R(3), border: '1.5px solid rgba(0,0,0,0.4)', overflow: 'hidden', background: 'rgba(0,0,0,0.15)' }}>
            {/* Left reel */}
            <div style={{
              position: 'absolute',
              left: leftCx - leftReelR, top: reelCy - leftReelR,
              width: leftReelR * 2, height: leftReelR * 2,
              borderRadius: '50%',
              background: 'radial-gradient(circle, #6b3a1a 20%, #7a4422 40%, #8b4e28 60%, #6b3a1a 80%)',
              opacity: 0.85,
              transition: 'all 1s linear',
            }} />
            <div style={{
              position: 'absolute',
              left: leftCx - leftReelR, top: reelCy - leftReelR,
              width: leftReelR * 2, height: leftReelR * 2,
              borderRadius: '50%',
              background: 'repeating-radial-gradient(circle at center, transparent 0px, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 3px)',
              transition: 'all 1s linear',
            }} />
            {/* Right reel */}
            <div style={{
              position: 'absolute',
              left: rightCx - rightReelR, top: reelCy - rightReelR,
              width: rightReelR * 2, height: rightReelR * 2,
              borderRadius: '50%',
              background: 'radial-gradient(circle, #6b3a1a 20%, #7a4422 40%, #8b4e28 60%, #6b3a1a 80%)',
              opacity: 0.85,
              transition: 'all 1s linear',
            }} />
            <div style={{
              position: 'absolute',
              left: rightCx - rightReelR, top: reelCy - rightReelR,
              width: rightReelR * 2, height: rightReelR * 2,
              borderRadius: '50%',
              background: 'repeating-radial-gradient(circle at center, transparent 0px, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 3px)',
              transition: 'all 1s linear',
            }} />
            {/* Transparent plastic overlay */}
            <div style={{
              position: 'absolute', inset: 0,
              background: [
                'linear-gradient(160deg, rgba(255,255,255,0.12) 0%, transparent 40%)',
                'linear-gradient(200deg, rgba(255,255,255,0.06) 60%, transparent 80%)',
                'repeating-linear-gradient(95deg, transparent 0px, transparent 4px, rgba(255,255,255,0.03) 4px, rgba(255,255,255,0.03) 5px)',
              ].join(','),
              borderRadius: R(3),
            }} />
          </div>
        );
      })()}

      {/* Bottom info strip */}
      {(() => {
        const biasTexts = ['Normal Bias', 'Normal', 'IEC Type I', 'EQ 120\u03BCs', 'Low Noise', 'Chrome Bias', 'High Bias', 'IEC II / Type II', 'IEC Type IV', 'Metal Position', 'Ferro', 'Normal Position'];
        const biasText = biasTexts[seed % biasTexts.length];
        const typeTexts = ['C-90', 'C-60', 'C-46', 'AD 90', 'D 90', 'UR 90', 'HF 90', 'SA 90', 'C-120', 'C-30', 'FR 90', 'MA 90', 'XL-II 90', 'UX 90'];
        const typeText = typeTexts[(seed + 3) % typeTexts.length];

        const stripVariant = (seed >> 3) % 4;
        const stripBorderRadius = (seed >> 5) % 3 === 0 ? R(4) : R(1);

        return (
          <div style={{ position: 'absolute', bottom: botH + R(6), left: padLR, right: padLR, height: R(14), background: st.label, borderRadius: stripBorderRadius, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `0 ${R(6)}px`, overflow: 'hidden' }}>
            {stripVariant === 1 && <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '40%', background: 'rgba(0,0,0,0.15)' }} />}
            {stripVariant === 2 && <div style={{ position: 'absolute', left: '50%', top: R(2), bottom: R(2), width: 1, background: 'rgba(255,255,255,0.15)' }} />}
            {stripVariant === 3 && <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: R(4), height: R(4), borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: '0.5px solid rgba(255,255,255,0.15)' }} />}
            {isMixtape ? <>
              <span style={{ fontSize: R(5), color: 'rgba(255,255,255,0.4)', fontFamily: "'04b03', monospace", fontWeight: 500, wordSpacing: R(3), position: 'relative' }}>YOUTUBE</span>
              <span style={{ fontSize: R(6), color: '#4a8adf', fontFamily: "'04b03', monospace", fontWeight: 800, letterSpacing: '0.08em', wordSpacing: R(3), position: 'relative' }}>MIXTAPE</span>
            </> : tape.isInfinite ? <>
              <span style={{ fontSize: R(5), color: 'rgba(255,255,255,0.4)', fontFamily: "'04b03', monospace", fontWeight: 500, wordSpacing: R(3), position: 'relative' }}>{tape.infiniteConfig?.source?.toUpperCase() || 'IMVDB'}</span>
              <span style={{ fontSize: R(6), color: st.titleBg, fontFamily: "'04b03', monospace", fontWeight: 800, letterSpacing: '0.08em', wordSpacing: R(3), position: 'relative' }}>∞ INFINITE</span>
            </> : tape.isPlaylist ? <>
              <span style={{ fontSize: R(5), color: 'rgba(255,255,255,0.4)', fontFamily: "'04b03', monospace", fontWeight: 500, wordSpacing: R(3), position: 'relative' }}>{biasText}</span>
              <span style={{ fontSize: R(6), color: st.titleBg, fontFamily: "'04b03', monospace", fontWeight: 800, letterSpacing: '0.08em', wordSpacing: R(3), position: 'relative' }}>PLAYLIST</span>
            </> : <>
              <span style={{ fontSize: R(5), color: 'rgba(255,255,255,0.4)', fontFamily: "'04b03', monospace", fontWeight: 500, wordSpacing: R(3), position: 'relative' }}>{biasText}</span>
              <span style={{ fontSize: R(6), color: 'rgba(255,255,255,0.35)', fontFamily: "'04b03', monospace", fontWeight: 700, letterSpacing: '0.06em', wordSpacing: R(3), position: 'relative' }}>{typeText}</span>
            </>}
          </div>
        );
      })()}

      {/* Infinity sticker for infinite tapes / blue Mixtape sticker for mixtape */}
      {tape.isInfinite && (() => {
        const isMixtape = tape.author === 'mixtape' && !!tape.isInfinite;
        const stickerW = isMixtape ? R(50) : R(36), stickerH = R(26);
        return (
          <div style={{
            position: 'absolute', top: R(42), right: R(14),
            width: stickerW, height: stickerH,
            background: isMixtape
              ? 'linear-gradient(135deg, #1a4a8a 0%, #0f3580 100%)'
              : 'linear-gradient(135deg, #f0d848 0%, #e8c830 100%)',
            borderRadius: R(3),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transform: `rotate(${((seed >> 3) % 7) - 3}deg)`,
            boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
            border: isMixtape ? '0.5px solid rgba(30,80,160,0.5)' : '0.5px solid rgba(180,150,30,0.4)',
          }}>
            {isMixtape
              ? <span style={{ fontSize: R(10), fontWeight: 700, color: '#ffffff', lineHeight: 1, fontFamily: "'04b03', monospace", letterSpacing: '0.05em' }}>Mixtape</span>
              : <span style={{ fontSize: R(26), fontWeight: 700, color: '#5a4a10', lineHeight: 1 }}>∞</span>
            }
          </div>
        );
      })()}

      {/* Bottom protruding section — trapezoid via corner masks (html2canvas can't do clip-path or SVG well) */}
      {(() => {
        const inset = R(16);
        const trapLeft = w / 2 - botProtrW / 2;
        return (
        <div style={{ position: 'absolute', bottom: R(2), left: trapLeft, width: botProtrW, height: botProtrH, overflow: 'hidden' }}>
          {/* Background */}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(0,0,0,0.15)' }} />
          {/* Top-left corner mask — triangle in housing color */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0,
            borderTop: `${botProtrH}px solid ${st.housing}`,
            borderRight: `${inset}px solid transparent`,
          }} />
          {/* Top-right corner mask */}
          <div style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0,
            borderTop: `${botProtrH}px solid ${st.housing}`,
            borderLeft: `${inset}px solid transparent`,
          }} />
          {/* Holes */}
          <div style={{ position: 'absolute', left: R(22), top: '70%', transform: 'translateY(-50%)', width: R(10), height: R(10), background: '#000', borderRadius: '50%' }} />
          <div style={{ position: 'absolute', left: R(42), top: '55%', transform: 'translateY(-50%)', width: R(10), height: R(10), background: '#000', borderRadius: '50%' }} />
          <div style={{ position: 'absolute', right: R(42), top: '55%', transform: 'translateY(-50%)', width: R(10), height: R(10), background: '#000', borderRadius: '50%' }} />
          <div style={{ position: 'absolute', right: R(22), top: '70%', transform: 'translateY(-50%)', width: R(10), height: R(10), background: '#000', borderRadius: '50%' }} />
        </div>
        );
      })()}

      {/* Loading spinner overlay */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: R(4),
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10,
        }}>
          <div style={{
            width: R(24), height: R(24),
            border: `${R(3)}px solid rgba(255,255,255,0.2)`,
            borderTopColor: '#e8c840',
            borderRadius: '50%',
            animation: 'tape-loading-spin 0.8s linear infinite',
          }} />
        </div>
      )}
    </div>
  );
}
