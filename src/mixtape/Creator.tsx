import React, { useState, useCallback } from 'react';

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

export function MixtapeCreator({ onBack, onPlay }: CreatorProps) {
  const [url, setUrl] = useState('');
  const [keywords, setKeywords] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
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
      if (!name) setName(`${data.seedTitle || 'My Mixtape'}`);
    } catch (e: any) {
      setError(e.message || 'Failed to generate mixtape');
    } finally {
      setLoading(false);
    }
  }, [url, keywords, name]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) { setError('Give your mixtape a name'); return; }
    if (tracks.length === 0) { setError('Generate tracks first'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/mixtape/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), tracks }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      const tape = { name: name.trim(), description: description.trim(), tracks };
      onPlay(tape);
    } catch (e: any) {
      setError(e.message || 'Failed to save mixtape');
    } finally {
      setLoading(false);
    }
  }, [name, description, tracks, onPlay]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack} disabled={loading}>
          ← Back
        </button>
        <h1 style={styles.title}>Mixtape Creator</h1>
        <div style={{ width: 60 }} />
      </div>

      <div style={styles.content}>
        {!tracks.length ? (
          <div style={styles.inputSection}>
            <p style={styles.subtitle}>
              Enter a YouTube URL or keywords to generate a 16-track mixtape
            </p>
            <div style={styles.inputGroup}>
              <input
                style={styles.input}
                type="text"
                placeholder="YouTube URL (e.g. https://youtube.com/watch?v=...)"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGenerate()}
                disabled={loading}
              />
              <span style={styles.or}>or</span>
              <input
                style={styles.input}
                type="text"
                placeholder="Keywords (e.g. 80s synthwave, 90s hip hop)"
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
        ) : (
          <div style={styles.reviewSection}>
            <div style={styles.metaFields}>
              <input
                style={styles.nameInput}
                type="text"
                placeholder="Mixtape name"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={60}
              />
              <input
                style={styles.descInput}
                type="text"
                placeholder="Description (optional)"
                value={description}
                onChange={e => setDescription(e.target.value)}
                maxLength={120}
              />
            </div>
            <div style={styles.trackList}>
              <p style={styles.trackCount}>{tracks.length} tracks — generated from "{seedTitle}"</p>
              {tracks.map((track, i) => (
                <div key={i} style={styles.trackRow}>
                  <span style={styles.trackNum}>{i + 1}</span>
                  <span style={styles.trackTitle}>{track.title || 'Untitled'}</span>
                  <span style={styles.trackAuthor}>{track.author}</span>
                  <span style={styles.trackDur}>{track.durationText}</span>
                </div>
              ))}
            </div>
            {error && <p style={styles.error}>{error}</p>}
            <div style={styles.actions}>
              <button style={styles.regenerateBtn} onClick={() => { setTracks([]); setName(''); }} disabled={loading}>
                Regenerate
              </button>
              <button
                style={{ ...styles.saveBtn, ...(loading ? styles.saveBtnDisabled : {}) }}
                onClick={handleSave}
                disabled={loading}
              >
                {loading ? 'Saving...' : 'Save & Get Link'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed', inset: 0, zIndex: 100,
    background: 'rgba(10,8,5,0.97)',
    display: 'flex', flexDirection: 'column',
    fontFamily: "'Patrick Hand', cursive",
    color: '#e8d5b0',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 24px',
    borderBottom: '1px solid rgba(201,168,76,0.2)',
  },
  backBtn: {
    background: 'transparent',
    border: '1px solid rgba(201,168,76,0.4)',
    color: '#c9a84c',
    padding: '6px 14px',
    borderRadius: 4,
    cursor: 'pointer',
    fontFamily: "'Patrick Hand', cursive",
    fontSize: 14,
  },
  title: {
    fontFamily: "'Lacquer', cursive",
    fontSize: 22,
    color: '#c9a84c',
    margin: 0,
    letterSpacing: 2,
  },
  content: {
    flex: 1, overflow: 'auto', padding: '32px 24px',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  subtitle: {
    fontSize: 15, color: 'rgba(232,213,176,0.6)', marginBottom: 24,
    textAlign: 'center',
  },
  inputSection: {
    width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  inputGroup: {
    width: '100%', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20,
  },
  or: {
    textAlign: 'center', color: 'rgba(201,168,76,0.4)', fontSize: 13,
  },
  input: {
    width: '100%', padding: '12px 16px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(201,168,76,0.3)',
    borderRadius: 6, color: '#e8d5b0', fontSize: 15,
    fontFamily: "'Patrick Hand', cursive",
    outline: 'none', boxSizing: 'border-box',
  },
  error: {
    color: '#ff6b6b', fontSize: 14, marginBottom: 12, textAlign: 'center',
  },
  generateBtn: {
    padding: '12px 32px',
    background: 'linear-gradient(135deg, #8a5a20, #c9a84c)',
    border: 'none', borderRadius: 6, color: '#0a0805',
    fontFamily: "'Lacquer', cursive", fontSize: 16, letterSpacing: 1,
    cursor: 'pointer',
  },
  generateBtnDisabled: {
    opacity: 0.6, cursor: 'not-allowed',
  },
  reviewSection: {
    width: '100%', maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16,
  },
  metaFields: {
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  nameInput: {
    padding: '12px 16px',
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(201,168,76,0.5)',
    borderRadius: 6, color: '#e8d5b0', fontSize: 18,
    fontFamily: "'Lacquer', cursive", letterSpacing: 1,
    outline: 'none', width: '100%', boxSizing: 'border-box',
  },
  descInput: {
    padding: '10px 16px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(201,168,76,0.25)',
    borderRadius: 6, color: '#e8d5b0', fontSize: 14,
    fontFamily: "'Patrick Hand', cursive",
    outline: 'none', width: '100%', boxSizing: 'border-box',
  },
  trackList: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(201,168,76,0.15)',
    borderRadius: 8, padding: '12px 16px',
    maxHeight: 360, overflowY: 'auto',
  },
  trackCount: {
    fontSize: 13, color: 'rgba(201,168,76,0.5)', marginBottom: 10,
    borderBottom: '1px solid rgba(201,168,76,0.1)', paddingBottom: 8,
  },
  trackRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
    fontSize: 13,
  },
  trackNum: {
    color: 'rgba(201,168,76,0.5)', width: 20, flexShrink: 0, textAlign: 'right',
  },
  trackTitle: {
    flex: 1, color: '#e8d5b0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  trackAuthor: {
    color: 'rgba(232,213,176,0.5)', flexShrink: 0, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  trackDur: {
    color: 'rgba(201,168,76,0.4)', flexShrink: 0, width: 36, textAlign: 'right',
  },
  actions: {
    display: 'flex', gap: 12, justifyContent: 'center',
  },
  regenerateBtn: {
    padding: '10px 24px',
    background: 'transparent',
    border: '1px solid rgba(201,168,76,0.4)',
    borderRadius: 6, color: '#c9a84c',
    fontFamily: "'Patrick Hand', cursive", fontSize: 15,
    cursor: 'pointer',
  },
  saveBtn: {
    padding: '10px 28px',
    background: 'linear-gradient(135deg, #8a5a20, #c9a84c)',
    border: 'none', borderRadius: 6, color: '#0a0805',
    fontFamily: "'Lacquer', cursive", fontSize: 16, letterSpacing: 1,
    cursor: 'pointer',
  },
  saveBtnDisabled: {
    opacity: 0.6, cursor: 'not-allowed',
  },
};
