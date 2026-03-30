import React from 'react';

export interface Track {
  videoId: string;
  title: string;
  author: string;
  duration: number;
  durationText: string;
}

interface TrackListProps {
  tracks: Track[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

export function TrackList({ tracks, currentIndex, onSelect }: TrackListProps) {
  return (
    <div style={styles.container}>
      <p style={styles.header}>{tracks.length} tracks</p>
      {tracks.map((track, i) => (
        <div
          key={i}
          style={{
            ...styles.row,
            ...(i === currentIndex ? styles.rowActive : {}),
          }}
          onClick={() => onSelect(i)}
        >
          <span style={styles.num}>{i + 1}</span>
          <span style={styles.info}>
            <span style={styles.title}>{track.title || 'Untitled'}</span>
            <span style={styles.author}>{track.author}</span>
          </span>
          <span style={styles.dur}>{track.durationText}</span>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: 'rgba(10,8,5,0.9)',
    border: '1px solid rgba(201,168,76,0.2)',
    borderRadius: 8,
    overflowY: 'auto',
    maxHeight: '100%',
    minWidth: 220,
  },
  header: {
    padding: '10px 14px 6px',
    fontSize: 11,
    color: 'rgba(201,168,76,0.5)',
    borderBottom: '1px solid rgba(201,168,76,0.1)',
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
    margin: 0,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 14px',
    cursor: 'pointer',
    borderBottom: '1px solid rgba(255,255,255,0.03)',
    transition: 'background 0.15s',
  },
  rowActive: {
    background: 'rgba(201,168,76,0.12)',
    borderLeft: '2px solid #c9a84c',
    paddingLeft: 12,
  },
  num: {
    color: 'rgba(201,168,76,0.4)',
    fontSize: 12,
    width: 16,
    flexShrink: 0,
    textAlign: 'right',
  },
  info: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    overflow: 'hidden',
  },
  title: {
    color: '#e8d5b0',
    fontSize: 13,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  author: {
    color: 'rgba(232,213,176,0.45)',
    fontSize: 11,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  dur: {
    color: 'rgba(201,168,76,0.4)',
    fontSize: 11,
    flexShrink: 0,
  },
};
