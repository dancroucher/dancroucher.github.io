import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface MixtapeBuilderTrack {
  videoId: string;
  title: string;
  author: string;
  durationText?: string;
}

interface SearchResult {
  videoId: string;
  title: string;
  author?: string;
  durationText?: string;
  year?: string;
}

interface Props {
  className?: string;
  name: string;
  tracks: MixtapeBuilderTrack[];
  onAddTrack: (track: MixtapeBuilderTrack) => void;
  onCreate: () => void;
}

// Strip URL → videoId. Returns null for non-URL or unrecognised links.
function parseVideoId(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  const isUrl = /^https?:\/\//i.test(v);
  if (!isUrl) return null;
  try {
    const u = new URL(v);
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.replace(/^\//, '').split(/[?#]/)[0] || null;
    }
    const idParam = u.searchParams.get('v');
    if (idParam) return idParam;
    // shorts / embed / playlist forms
    const m = u.pathname.match(/\/(?:embed|shorts)\/([^/?#]+)/);
    if (m) return m[1];
  } catch {
    return null;
  }
  return null;
}

async function resolveOembedTitle(videoId: string): Promise<{ title: string; author: string }> {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (!r.ok) return { title: videoId, author: '' };
    const data = await r.json();
    return { title: data.title || videoId, author: data.author_name || '' };
  } catch {
    return { title: videoId, author: '' };
  }
}

export function MixtapeBuilder({ className, name, tracks, onAddTrack, onCreate }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trackNumber = tracks.length + 1;
  const canCreate = tracks.length >= 1 && name.trim().length > 0;

  // Debounced search on query change.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = query.trim();
    if (!q || parseVideoId(q)) {
      setResults([]);
      setSearching(false);
      setHighlighted(-1);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
        setHighlighted(-1);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query]);

  const addAndReset = useCallback((track: MixtapeBuilderTrack) => {
    onAddTrack(track);
    setQuery('');
    setResults([]);
    setHighlighted(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [onAddTrack]);

  const submit = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    const vid = parseVideoId(q);
    if (vid) {
      const { title, author } = await resolveOembedTitle(vid);
      addAndReset({ videoId: vid, title, author });
      return;
    }
    let chosen: SearchResult | null = null;
    if (highlighted >= 0 && highlighted < results.length) chosen = results[highlighted];
    else if (results.length) chosen = results[0];
    if (chosen) {
      addAndReset({
        videoId: chosen.videoId,
        title: chosen.title,
        author: chosen.author || '',
        durationText: chosen.durationText,
      });
    }
  }, [query, results, highlighted, addAndReset]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'ArrowDown') {
      if (results.length) {
        e.preventDefault();
        setHighlighted(h => (h + 1) % results.length);
      }
    } else if (e.key === 'ArrowUp') {
      if (results.length) {
        e.preventDefault();
        setHighlighted(h => h <= 0 ? results.length - 1 : h - 1);
      }
    }
  }, [results.length, submit]);

  return (
    <div className={`mixtape-builder${className ? ' ' + className : ''}`}>
      <div className="mixtape-track-list">
        {tracks.map((t, i) => (
          <div key={i} className="tape-track">
            <div className="tape-track-top">
              <span className="tape-track-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="tape-track-title">{t.title}</span>
            </div>
            <div className="tape-track-author-row">{t.author}</div>
          </div>
        ))}
        <div className="mixtape-active-track">
          <span className="tape-track-num">{String(trackNumber).padStart(2, '0')}</span>
          <div className="mixtape-active-track-input-wrap">
            <input
              ref={inputRef}
              className="videobox mixtape-track-input"
              type="text"
              placeholder="paste a youtube url or search..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
            />
            {results.length > 0 && (
              <div className="search-dropdown mixtape-search-dropdown" style={{ position: 'absolute', top: '100%', left: 0, width: '100%' }}>
                {results.map((r, i) => (
                  <button
                    key={r.videoId + ':' + i}
                    type="button"
                    className={`search-result${i === highlighted ? ' highlighted' : ''}`}
                    onMouseEnter={() => setHighlighted(i)}
                    onClick={() => addAndReset({
                      videoId: r.videoId,
                      title: r.title,
                      author: r.author || '',
                      durationText: r.durationText,
                    })}
                  >
                    <div className="search-result-title">{r.title}</div>
                    <div className="search-result-meta">
                      {[r.author, r.year, r.durationText].filter(Boolean).join('  //  ')}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {searching && (
              <div className="search-dropdown mixtape-search-dropdown" style={{ position: 'absolute', top: '100%', left: 0, width: '100%' }}>
                <div className="search-message">Searching...</div>
              </div>
            )}
          </div>
          <button
            type="button"
            className="mixtape-track-tick"
            onClick={submit}
            disabled={!query.trim()}
            aria-label="Add track"
          ><i className="fas fa-check" /></button>
        </div>
      </div>
      <button
        type="button"
        className={`primary-action-btn${canCreate ? '' : ' primary-action-btn--disabled'}`}
        onClick={onCreate}
        disabled={!canCreate}
      >create</button>
    </div>
  );
}
