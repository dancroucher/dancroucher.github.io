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
  onRemoveTrack?: (index: number) => void;
  onReplaceTrack?: (index: number, track: MixtapeBuilderTrack) => void;
  onReorderTracks?: (next: MixtapeBuilderTrack[]) => void;
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

export function MixtapeBuilder({ className, name, tracks, onAddTrack, onRemoveTrack, onReplaceTrack, onReorderTracks, onCreate }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Drag-to-reorder state ──
  // draggingIndex: source track. dragDeltaY: pointer Y minus pointer-down Y.
  // rowHeightRef captures the height of the dragged row at drag-start so the
  // re-layout shift math is consistent across rows.
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragDeltaY, setDragDeltaY] = useState(0);
  const dragInfoRef = useRef<{ startY: number; rowHeight: number } | null>(null);

  const canCreate = tracks.length >= 1 && name.trim().length > 0 && editingIndex === null;

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
    if (editingIndex !== null && onReplaceTrack) {
      onReplaceTrack(editingIndex, track);
      setEditingIndex(null);
    } else {
      onAddTrack(track);
    }
    setQuery('');
    setResults([]);
    setHighlighted(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [onAddTrack, onReplaceTrack, editingIndex]);

  const startEdit = useCallback((index: number) => {
    setEditingIndex(index);
    setQuery(tracks[index]?.title || '');
    setResults([]);
    setHighlighted(-1);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [tracks]);

  const cancelEdit = useCallback(() => {
    setEditingIndex(null);
    setQuery('');
    setResults([]);
    setHighlighted(-1);
  }, []);

  // ── Drag-and-drop reorder ──
  const startDrag = useCallback((index: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (editingIndex !== null) return;
    e.preventDefault();
    const rowEl = (e.currentTarget as HTMLElement).closest('.tape-track') as HTMLElement | null;
    const rowHeight = rowEl?.getBoundingClientRect().height ?? 64;
    dragInfoRef.current = { startY: e.clientY, rowHeight };
    setDraggingIndex(index);
    setDragDeltaY(0);
  }, [editingIndex]);

  // Where the dragged row would land if released right now.
  const dragTargetIndex = (() => {
    if (draggingIndex === null || !dragInfoRef.current) return null;
    const { rowHeight } = dragInfoRef.current;
    const slotsMoved = Math.round(dragDeltaY / rowHeight);
    return Math.max(0, Math.min(tracks.length - 1, draggingIndex + slotsMoved));
  })();

  useEffect(() => {
    if (draggingIndex === null) return;
    const onMove = (e: MouseEvent) => {
      if (!dragInfoRef.current) return;
      setDragDeltaY(e.clientY - dragInfoRef.current.startY);
    };
    const onUp = () => {
      const di = draggingIndex;
      const ti = (() => {
        if (!dragInfoRef.current) return di;
        const slotsMoved = Math.round(dragDeltaY / dragInfoRef.current.rowHeight);
        return Math.max(0, Math.min(tracks.length - 1, di + slotsMoved));
      })();
      if (ti !== di && onReorderTracks) {
        const next = tracks.slice();
        const [moved] = next.splice(di, 1);
        next.splice(ti, 0, moved);
        onReorderTracks(next);
      }
      setDraggingIndex(null);
      setDragDeltaY(0);
      dragInfoRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [draggingIndex, tracks, onReorderTracks, dragDeltaY]);

  // Compute per-row vertical offset during a drag so the rest of the list
  // shifts up/down to make room for the dragged row.
  const rowTransform = (i: number): React.CSSProperties => {
    if (draggingIndex === null || dragTargetIndex === null) return {};
    if (i === draggingIndex) {
      return { transform: `translateY(${dragDeltaY}px)`, zIndex: 10 };
    }
    const h = dragInfoRef.current?.rowHeight ?? 64;
    if (dragTargetIndex > draggingIndex) {
      // Moving down: rows in (draggingIndex, dragTargetIndex] shift up.
      if (i > draggingIndex && i <= dragTargetIndex) {
        return { transform: `translateY(-${h}px)` };
      }
    } else if (dragTargetIndex < draggingIndex) {
      // Moving up: rows in [dragTargetIndex, draggingIndex) shift down.
      if (i >= dragTargetIndex && i < draggingIndex) {
        return { transform: `translateY(${h}px)` };
      }
    }
    return {};
  };

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
    if (e.key === 'Escape' && editingIndex !== null) {
      e.preventDefault();
      cancelEdit();
      return;
    }
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
  }, [results.length, submit, editingIndex, cancelEdit]);

  const activeRow = (
    <div className="mixtape-active-track">
      <div className="mixtape-active-track-input-wrap">
        <input
          ref={inputRef}
          className="videobox mixtape-track-input"
          type="text"
          placeholder={editingIndex !== null ? 'replace track…' : 'paste a youtube url or search…'}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {results.length > 0 && (
          <div className="search-dropdown mixtape-search-dropdown">
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
          <div className="search-dropdown mixtape-search-dropdown">
            <div className="search-message">Searching...</div>
          </div>
        )}
      </div>
      {editingIndex !== null && (
        <button
          type="button"
          className="mixtape-track-tick mixtape-track-cancel"
          onClick={cancelEdit}
          aria-label="Cancel edit"
        ><i className="fas fa-xmark" /></button>
      )}
      <button
        type="button"
        className="mixtape-track-tick"
        onClick={submit}
        disabled={!query.trim()}
        aria-label={editingIndex !== null ? 'Replace track' : 'Add track'}
      ><i className="fas fa-check" /></button>
    </div>
  );

  const renderTrackRow = (t: MixtapeBuilderTrack, i: number) => {
    const isDragging = draggingIndex === i;
    return (
      <div
        key={`t-${i}`}
        className={`tape-track${isDragging ? ' is-dragging' : ''}`}
        style={rowTransform(i)}
      >
        <div
          className="track-handle"
          onMouseDown={(e) => startDrag(i, e)}
          aria-label="Drag to reorder"
          title="Drag to reorder"
        >
          <span className="tape-track-num">{String(i + 1).padStart(2, '0')}</span>
          <i className="fas fa-grip-vertical track-drag-icon" aria-hidden="true" />
        </div>
        <div className="track-info">
          <div className="tape-track-title">{t.title}</div>
          <div className="tape-track-author-row">{t.author}</div>
        </div>
        <div className="track-actions">
          <button
            type="button"
            className="track-action-btn"
            onClick={() => startEdit(i)}
            aria-label="Edit track"
            title="Edit"
          ><i className="fas fa-pen" /></button>
          <button
            type="button"
            className="track-action-btn"
            onClick={() => onRemoveTrack && onRemoveTrack(i)}
            aria-label="Remove track"
            title="Remove"
          ><i className="fas fa-trash" /></button>
        </div>
      </div>
    );
  };

  return (
    <div className={`mixtape-builder${className ? ' ' + className : ''}`}>
      <div className="mixtape-track-list-frame">
      <div className={`mixtape-track-list${draggingIndex !== null ? ' is-dragging' : ''}`}>
        {tracks.map((t, i) => (
          editingIndex === i
            ? <React.Fragment key={`edit-${i}`}>{activeRow}</React.Fragment>
            : renderTrackRow(t, i)
        ))}
        {editingIndex === null && activeRow}
      </div>
      </div>
      <button
        type="button"
        className={`tape-btn mixtape-create-btn${canCreate ? '' : ' is-disabled'}`}
        style={{ fontSize: '1.1em', padding: '4px 10px', lineHeight: '1.5em' }}
        onClick={onCreate}
        disabled={!canCreate}
      ><i className="fas fa-check" />&nbsp;create</button>
    </div>
  );
}
