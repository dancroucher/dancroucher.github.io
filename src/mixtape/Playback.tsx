import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MixtapeTape3D } from './Tape';
import { TrackList, type Track } from './TrackList';

interface PlaybackProps {
  name: string;
  description: string;
  tracks: Track[];
  onBack: () => void;
}

export function MixtapePlayback({ name, description, tracks, onBack }: PlaybackProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentTrack = tracks[currentIndex];

  const loadTrack = useCallback((videoId: string) => {
    if (!window.YT || !containerRef.current) return;

    // Create or reuse iframe player
    if (!playerRef.current) {
      try {
        playerRef.current = new window.YT.Player(containerRef.current, {
          height: '100%',
          width: '100%',
          videoId,
          playerVars: { autoplay: 1, controls: 1 },
          events: {
            onStateChange: (e: any) => {
              if (e.data === window.YT.PlayerState.ENDED) {
                setCurrentIndex(prev => {
                  const next = prev + 1;
                  if (next < tracks.length) {
                    loadTrack(tracks[next].videoId);
                    return next;
                  }
                  return prev;
                });
              }
              setPlaying(e.data === window.YT.PlayerState.PLAYING);
            },
          },
        });
      } catch (e) {
        console.error('YT.Player init error:', e);
      }
    } else {
      playerRef.current.loadVideoById(videoId);
    }
  }, [tracks]);

  useEffect(() => {
    if (currentTrack) loadTrack(currentTrack.videoId);
  }, [currentIndex, currentTrack, loadTrack]);

  const handleTrackSelect = useCallback((i: number) => {
    setCurrentIndex(i);
  }, []);

  const handleShare = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}?tape=${new URLSearchParams(window.location.search).get('tape')}`;
    navigator.clipboard.writeText(url).catch(() => {});
    alert('Link copied! ' + url);
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack}>← Tapes</button>
        <div style={styles.meta}>
          <h1 style={styles.title}>{name}</h1>
          {description && <p style={styles.desc}>{description}</p>}
        </div>
        <button style={styles.shareBtn} onClick={handleShare}>Share</button>
      </div>

      <div style={styles.main}>
        <div style={styles.tapeArea}>
          <MixtapeTape3D name={name} trackCount={tracks.length} />
        </div>

        <div style={styles.playerArea}>
          <div style={styles.playerWrapper} ref={containerRef} />
          {playing && (
            <div style={styles.nowPlaying}>
              <span style={styles.nowPlayingLabel}>▶ Now playing</span>
              <span style={styles.nowPlayingTitle}>{currentTrack?.title}</span>
            </div>
          )}
        </div>

        <div style={styles.trackListArea}>
          <TrackList
            tracks={tracks}
            currentIndex={currentIndex}
            onSelect={handleTrackSelect}
          />
        </div>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | null;
  }
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
    display: 'flex', alignItems: 'center', gap: 16,
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
    flexShrink: 0,
  },
  meta: {
    flex: 1, overflow: 'hidden',
  },
  title: {
    fontFamily: "'Lacquer', cursive",
    fontSize: 20,
    color: '#c9a84c',
    margin: 0,
    letterSpacing: 1,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  desc: {
    fontSize: 13, color: 'rgba(232,213,176,0.5)', margin: '4px 0 0',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  shareBtn: {
    padding: '6px 16px',
    background: 'linear-gradient(135deg, #8a5a20, #c9a84c)',
    border: 'none', borderRadius: 4, color: '#0a0805',
    fontFamily: "'Patrick Hand', cursive", fontSize: 14,
    cursor: 'pointer', flexShrink: 0,
  },
  main: {
    flex: 1, display: 'flex', overflow: 'hidden',
    gap: 0,
  },
  tapeArea: {
    flex: '0 0 45%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRight: '1px solid rgba(201,168,76,0.1)',
  },
  playerArea: {
    flex: '0 0 35%',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    gap: 16, padding: '16px',
    position: 'relative',
  },
  playerWrapper: {
    width: '100%', aspectRatio: '16/9',
    background: '#000', borderRadius: 6,
    overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
  },
  nowPlaying: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
  },
  nowPlayingLabel: {
    fontSize: 11, color: 'rgba(201,168,76,0.5)', textTransform: 'uppercase' as const, letterSpacing: 1,
  },
  nowPlayingTitle: {
    fontSize: 14, color: '#e8d5b0', textAlign: 'center', maxWidth: 300,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
  },
  trackListArea: {
    flex: '0 0 20%',
    overflowY: 'auto' as const,
    padding: '12px 12px 12px 8px',
  },
};
