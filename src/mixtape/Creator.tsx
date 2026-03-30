import React, { useState, useCallback } from 'react';
import { CassetteTape } from '../tapes/CassetteTape';
import type { Tape } from '../tapes/types';

interface Track {
  videoId: string;
  title: string;
  author: string;
  duration: number;
  durationText: string;
}

interface CreatorProps {
  onBack: () => void;
  onPlay: (tape: { name: string; description: string; tracks: Track[] }) => void;
}

// Fake mixtape tape for rendering the cassette in the creator panel
function makeMixtapeTape(name: string, tracks: Track[]): Tape {
  return {
    id: '__jeem_mixtape__',
    videoId: tracks[0]?.videoId || '',
    isPlaylist: false,
    isInfinite: true,
    title: name || 'Mixtape',
    author: 'mixtape',
    tapeStyle: 0,
    textureVariant: 'a',
    progress: 0,
    timestamp: Date.now(),
    x: 0,
    y: 0,
    angle: 0,
    infiniteHistory: tracks.map(t => ({ videoId: t.videoId, title: t.title, author: t.author })),
    infiniteIndex: 0,
    infiniteConfig: { source: 'youtube', type: 'artist', value: name } as any,
  };
}

export function MixtapeCreator({ onBack, onPlay }: CreatorProps) {
  const [url, setUrl] = useState('');
  const [keywords, setKeywords] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [seedTitle, setSeedTitle] = useState('');

  const handleGenerate = useCallback(async () => {
    if (!url.trim() && !keywords.trim()) {
      setError('Enter a YouTube URL or some keywords');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/mixtape/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), keywords: keywords.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setTracks(data.tracks || []);
      setSeedTitle(data.seedTitle || 'Mixtape');
    } catch (e: any) {
      setError(e.message || 'Failed to generate mixtape');
    } finally {
      setLoading(false);
    }
  }, [url, keywords]);

  const handleSave = useCallback(() => {
    const tape = { name: name.trim() || 'Mixtape', description: '', tracks };
    onPlay(tape);
  }, [name, tracks, onPlay]);

  const handleRegenerate = useCallback(() => {
    setTracks([]);
    setName('');
    setError('');
  }, []);

  const mixtapeTape = makeMixtapeTape(name || seedTitle || 'Mixtape', tracks);

  return (
    <div style={styles.overlay}>
      {/* ── Step 1: URL / Keywords input ── */}
      {!tracks.length && (
        <div style={styles.inputModal}>
          <p style={styles.modalSubtitle}>Enter a YouTube URL or keywords to generate a 16-track mixtape</p>
          <div style={styles.inputGroup}>
            <input
              style={styles.input}
              type="text"
              placeholder="YouTube URL"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGenerate()}
              disabled={loading}
            />
            <span style={styles.or}>or</span>
            <input
              style={styles.input}
              type="text"
              placeholder="Keywords (e.g. 80s synthwave)"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGenerate()}
              disabled={loading}
            />
          </div>
          {error && <p style={styles.error}>{error}</p>}
          <button
            style={{ ...styles.generateBtn, ...(loading ? styles.generateBtnDisabled : {}) }}
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? 'Generating...' : 'Generate Mixtape'}
          </button>
        </div>
      )}

      {/* ── Step 2: Tape + Tracklist ── */}
      {tracks.length > 0 && (
        <div style={styles.creator}>
          {/* Left: cassette tape with mixtape label */}
          <div style={styles.tapeSide}>
            <CassetteTape tape={mixtapeTape} playing={false} big />
          </div>

          {/* Right: name + tracks + actions */}
          <div style={styles.trackSide}>
            {/* Name input — blank until saved */}
            <input
              style={styles.nameInput}
              type="text"
              placeholder="Mixtape name..."
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={60}
            />

            {/* Track count */}
            <p style={styles.trackCount}>{tracks.length} tracks — generated from "{seedTitle}"</p>

            {/* Track list — show all 16 */}
            <div style={styles.trackList}>
              {tracks.map((track, i) => (
                <div key={i} style={styles.trackRow}>
                  <span style={styles.trackNum}>{String(i + 1).padStart(2, '0')}.</span>
                  <span style={styles.trackTitle}>{track.title || 'Untitled'}</span>
                  <span style={styles.trackAuthor}>{track.author}</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            {error && <p style={styles.error}>{error}</p>}
            <div style={styles.actions}>
              <button style={styles.regenerateBtn} onClick={handleRegenerate} disabled={loading}>
                ← Back
              </button>
              <button
                style={{ ...styles.saveBtn, ...(loading ? styles.saveBtnDisabled : {}) }}
                onClick={handleSave}
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 200,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(10,8,5,0.5)',
    backdropFilter: 'blur(2px)',
    fontFamily: "'04b03', monospace",
    color: '#e8d5b0',
  },
  // Step 1: centered input modal
  inputModal: {
    background: 'rgba(14,10,6,0.95)',
    border: '1px solid rgba(201,168,76,0.3)',
    borderRadius: 12,
    padding: '32px 40px',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 16, width: 520,
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
  },
  modalSubtitle: {
    fontFamily: "'04b03', monospace",
    fontSize: 14, color: 'rgba(232,213,176,0.55)',
    textAlign: 'center', margin: 0,
  },
  inputGroup: {
    width: '100%', display: 'flex', flexDirection: 'column', gap: 10,
  },
  input: {
    width: '100%', padding: '12px 16px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(201,168,76,0.3)',
    borderRadius: 6, color: '#e8d5b0', fontSize: 15,
    fontFamily: "'04b03', monospace",
    outline: 'none', boxSizing: 'border-box',
  },
  or: {
    textAlign: 'center', color: 'rgba(201,168,76,0.4)', fontSize: 12,
    fontFamily: "'04b03', monospace",
  },
  error: {
    fontFamily: "'04b03', monospace",
    color: '#ff6b6b', fontSize: 13, margin: 0,
  },
  generateBtn: {
    padding: '12px 32px',
    background: 'linear-gradient(135deg, #8a5a20, #c9a84c)',
    border: 'none', borderRadius: 6, color: '#0a0805',
    fontFamily: "'04b03', monospace", fontSize: 16, letterSpacing: 1,
    cursor: 'pointer',
  },
  generateBtnDisabled: {
    opacity: 0.6, cursor: 'not-allowed',
  },
  // Step 2: side-by-side tape + tracklist
  creator: {
    display: 'flex', gap: 0,
    alignItems: 'stretch',
    background: 'rgba(14,10,6,0.92)',
    border: '1px solid rgba(201,168,76,0.3)',
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
    width: 780,
    maxHeight: '90vh',
  },
  tapeSide: {
    width: 234,
    flexShrink: 0,
    background: 'rgba(0,0,0,0.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '24px 20px',
    borderRight: '1px solid rgba(201,168,76,0.15)',
  },
  trackSide: {
    flex: 1,
    padding: '24px 24px 20px',
    display: 'flex', flexDirection: 'column', gap: 0,
    overflow: 'hidden',
    minWidth: 0,
  },
  nameInput: {
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(201,168,76,0.4)',
    borderRadius: 6, color: '#e8d5b0', fontSize: 15,
    fontFamily: "'04b03', monospace", letterSpacing: 0.5,
    outline: 'none', width: '100%', boxSizing: 'border-box', marginBottom: 12,
  },
  trackCount: {
    fontFamily: "'04b03', monospace",
    fontSize: 11, color: 'rgba(201,168,76,0.4)', margin: '0 0 8px',
    letterSpacing: '0.05em',
  },
  trackList: {
    flex: 1,
    overflowY: 'auto' as const,
    background: 'rgba(255,255,255,0.02)',
    borderRadius: 6,
    padding: '8px 12px',
    minHeight: 0,
  },
  trackRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '7px 0',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    fontSize: 14,
  },
  trackNum: {
    fontFamily: "'04b03', monospace",
    color: 'rgba(201,168,76,0.4)', width: 28, flexShrink: 0,
    textAlign: 'right',
  },
  trackTitle: {
    fontFamily: "'04b03', monospace",
    flex: 1, color: '#e8d5b0', overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    minWidth: 0,
  },
  trackAuthor: {
    fontFamily: "'04b03', monospace",
    color: 'rgba(232,213,176,0.4)', flexShrink: 0,
    maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  actions: {
    display: 'flex', gap: 10, justifyContent: 'space-between',
    marginTop: 14,
  },
  regenerateBtn: {
    padding: '10px 20px',
    background: 'transparent',
    border: '1px solid rgba(201,168,76,0.4)',
    borderRadius: 6, color: '#c9a84c',
    fontFamily: "'04b03', monospace", fontSize: 14,
    cursor: 'pointer',
  },
  saveBtn: {
    padding: '10px 28px',
    background: 'linear-gradient(135deg, #8a5a20, #c9a84c)',
    border: 'none', borderRadius: 6, color: '#0a0805',
    fontFamily: "'04b03', monospace", fontSize: 15, letterSpacing: 1,
    cursor: 'pointer',
    flex: 1,
  },
  saveBtnDisabled: {
    opacity: 0.6, cursor: 'not-allowed',
  },
};
