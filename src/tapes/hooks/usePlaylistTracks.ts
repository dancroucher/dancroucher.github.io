import { useState, useEffect, useRef } from 'react';
import type { MixtapeData } from '../types';
import type { Tape } from '../types';

type PlaylistResult = Pick<MixtapeData, 'name' | 'description' | 'tracks'> | null;

/**
 * Fetches playlist metadata when inspecting a playlist tape. Caches by playlist ID
 * so re-inspecting the same tape doesn't fire again. Returns the setter so
 * callers (e.g. exitPlayerView) can reset directly without a separate reset fn.
 */
export function usePlaylistTracks(
  inspectTapeId: string | null,
  tapes: Tape[],
): [PlaylistResult, React.Dispatch<React.SetStateAction<PlaylistResult>>] {
  const [playlistTracks, setPlaylistTracks] = useState<PlaylistResult>(null);
  const tapesRef = useRef(tapes);
  tapesRef.current = tapes;

  useEffect(() => {
    if (!inspectTapeId) { setPlaylistTracks(null); return; }

    const tape = tapesRef.current.find(t => t.id === inspectTapeId);
    if (!tape?.isPlaylist || !tape.playlistId) { setPlaylistTracks(null); return; }

    const key = tape.playlistId;
    if (playlistTracks && (playlistTracks as PlaylistResult & { _key?: string })._key === key) return;

    setPlaylistTracks(null);
    fetch(`/api/playlist-tracks?list=${encodeURIComponent(tape.playlistId)}`)
      .then(r => r.ok ? r.json() : [])
      .then((data: MixtapeData['tracks']) => {
        if (data.length > 0) {
          setPlaylistTracks({ name: tape.title || 'Playlist', tracks: data } as PlaylistResult);
        }
      })
      .catch(() => {});
  }, [inspectTapeId]);

  return [playlistTracks, setPlaylistTracks];
}
