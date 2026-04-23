# jeem-fm Codebase Documentation

## Overview

jeem-fm is a YouTube video player with an interactive 3D tape table interface. Users browse videos as physical cassette tapes on a virtual table, drag them to a deck/recorder to play, and watch MP4/anime backgrounds during playback.

**Key architectural split:**
- **Vanilla JS** (`public/src/player.js`, `public/src/script.js`): Original 2D player, video playback, backgrounds, YouTube integration
- **React/Three.js** (`src/tapes/`, `src/mixtape/`): 3D tape table, physics, drag-and-drop, tape rendering

---

## Project Structure

```
jeem-fm/
├── public/
│   ├── index.html          # Entry point, loads player.css + JS bundles
│   ├── player.css          # Global styles (CRT effects, UI, backgrounds)
│   ├── font.css            # 04b03 pixel font
│   ├── src/
│   │   ├── player.js       # Main vanilla player, video playback, backgrounds
│   │   ├── script.js       # UI logic, start screen, search, events
│   │   └── youtube_iframe_api.js
│   ├── dist/
│   │   ├── tapes.js        # Bundled React 3D tapes (esbuild output)
│   │   └── mixtape.js      # Bundled React mixtape creator
│   ├── assets/
│   │   ├── favicon/
│   │   ├── font/
│   │   ├── recorder/gltf/  # Cassette recorder 3D model (.glb)
│   │   └── textures/       # Texture variants for tapes
│   ├── video/              # MP4 background videos
│   ├── anime/              # Anime background videos
│   └── vintage/             # Vintage background videos
│
├── src/
│   ├── tapes/              # 3D tape table React components
│   │   ├── index.tsx       # Entry: mounts TapesTable into #tapes-root
│   │   ├── TapesTable.tsx  # Main orchestrator: state, bridge to vanilla JS
│   │   ├── TapesTable3D.tsx # React-Three-Fiber canvas, scene contents
│   │   ├── TableSurface.tsx # Wood table + optional video surface plane
│   │   ├── TapeBody.tsx    # Physics body, FBX mesh, drag/snap logic
│   │   ├── Tape3D.tsx      # FBX loading, texture variants
│   │   ├── Recorder3D.tsx  # 3D cassette recorder with animated lid
│   │   ├── Spool.tsx       # Cassette spool visualization
│   │   ├── CassetteTape.tsx # 2D tape for deck (legacy)
│   │   ├── DeckTape3D.tsx  # 3D tape in deck slot
│   │   ├── TapeOverlayHybrid.tsx
│   │   ├── coords.ts       # 2D↔3D coordinate math + constants
│   │   ├── types.ts        # TypeScript interfaces (Tape, etc.)
│   │   ├── db.ts           # IndexedDB persistence
│   │   └── textureCache.ts # Texture variant caching
│   │
│   └── mixtape/            # Mixtape creator React components
│       ├── index.tsx       # Entry
│       ├── Tape.tsx
│       ├── TrackList.tsx
│       ├── Playback.tsx
│       └── Creator.tsx     # AI-powered mixtape generation UI
│
├── api/                    # Express server routes
│   ├── list-files.js       # GET /api/list-files — returns shuffled video filenames
│   ├── search.js           # GET /api/search?q= — YouTube search
│   ├── playlist-tracks.js  # GET /api/playlist-tracks?list=ID — playlist metadata
│   ├── random.js
│   ├── random-playlist.js
│   ├── mixtape/save.js
│   ├── mixtape/generate.js
│   ├── mixtape/[id].js
│   └── utils/youtube.js
│
├── server.js               # Express server (port 3000 default, PORT env var)
├── build-tapes.js          # esbuild: compiles src/tapes/, src/mixtape/ → public/dist/
├── build-lists.js          # Indexes video/anime/vintage folders → file-index.json
└── package.json
```

---

## Core Concepts

### 2D ↔ 3D Coordinate System

Defined in `src/tapes/coords.ts`:

```typescript
CANVAS_W = 4000, CANVAS_H = 2400  // 2D canvas dimensions
SCALE = 50                         // 50 2D pixels = 1 3D unit
MAP_SCALE = SCALE                  // 1:1 mapping

// Convert 2D (top-left origin) → 3D (center origin, Y-up)
to3D(x2d, y2d) → [x3d, z3d]

// Convert 3D → 2D
to2D(x3d, z3d) → [x2d, y2d]
```

**Tile system:**
- Active area: 3×3 tiles
- Table: 5×5 tiles (active + border)
- Tiles sized to fit ~9 tapes in active area

### Coordinate Constants

```typescript
TILE_W = 15.27   // ~15.3 3D units wide
TILE_H = 10      // 10 3D units tall
ACTIVE_W = 45.8  // 3 tiles wide
ACTIVE_H = 30    // 3 tiles tall
TABLE_W = 76.4   // 5 tiles wide
TABLE_H = 50     // 5 tiles tall
TAPE_W = 7.02    // ~7 3D units
TAPE_H = 4.29    // ~4.3 3D units
DRAG_HEIGHT = 5  // How high tapes float when dragged
DRAG_BOUND_X = 22.9  // Max drag X
DRAG_BOUND_Z = 15    // Max drag Z
```

### Video Surface (TableSurface.tsx)

When a background video plays (MP4 mode, indices 0-2), the table surface renders the video as a `THREE.VideoTexture` on a plane. This lets users still interact with the 3D recorder while a video plays.

Communication: `player.js` dispatches a `jeem-bg-change` CustomEvent with `{ bgTypeIndex, videoEl }`. `TableSurface` listens and renders the video texture accordingly.

---

## TapesTable.tsx — Main State Machine

This is the central orchestrator. Key state:

```typescript
const [tapes, setTapes] = useState<Tape[]>([])           // All tapes
const [loadedTape, setLoadedTape] = useState<Tape|null>(null)  // Currently in deck
const [view, setView] = useState<'table'|'player'>('table')   // View mode
const [playerTapeId, setPlayerTapeId] = useState<string|null>(null)
const [recorderSourced, setRecorderSourced] = useState(false)  // True if playing via 3D recorder
const [showMixtapeCreator, setShowMixtapeCreator] = useState(false)
```

### View Transitions

- **table view**: Shows 3D table with all tapes, camera can pan
- **player view**: Single tape focused, camera locked, deck/recorder active, info panel shown

Transition uses a "wipe" animation (brightness glitch flare).

### Bridge to Vanilla JS

`window.TapesBridge` exposes methods for vanilla JS to communicate with React:

```typescript
interface TapesBridge {
  onTapePlay: (tape: Tape) => void
  updateProgress: (videoId, progress) => void
  updatePlaylistIndex: (videoId, index) => void
  addTapeFromSearch: (videoId, title, author, isPlaylist, playlistId?) => void
  addInfiniteTape: (config, title) => void
  addMixtapeTape: (name, tracks[]) => void
  notifyPlayState: (playing) => void
  onTrackEnded: () => void
  loadNextInfiniteTrack: () => void
  loadPrevInfiniteTrack: () => void
}
```

### Infinite Tapes

Infinite tapes use YouTube search to auto-generate playlists:
- `isInfinite: true` + `infiniteConfig: InfiniteConfig`
- Config types: `decade`, `genre`, `year`, `artist`, `playlist`
- Fetches tracks via `/api/search` with varied query suffixes
- Tracks stored in `infiniteHistory[]`, current index in `infiniteIndex`
- On track end, auto-loads next track (infinite) or ejects (single)

### Mixtapes

Special infinite tape with `author: 'mixtape'` and pre-generated tracklist. Triggered by `jeem-create-mixtape` event from vanilla JS. Uses `MixtapeCreator` component for AI-powered generation.

---

## TapesTable3D.tsx — 3D Scene

### Camera

- Orthographic-ish perspective (position y=30-45, fov=45)
- Pan via MapControls (enabled in table view, locked in player view)
- Zoom clamped to 35-45
- Pan bounds prevent seeing outside active area

### Drag System

Uses pointer events + raycasting to plane:
1. `onDown` → raycast finds tape, capture pointer offset
2. `onMove` → update `drag.targetX/Y`, clamp to bounds, disable controls
3. `onUp` → snap to recorder OR save position, re-enable controls

Shared mutable objects (no React re-renders during drag):
- `drag: DragState` — current drag target
- `snap: SnapState` — snap-to-target when dropped on recorder

### Recorder Integration

Recorder at `[-20, -0.5, 4]` with rotation `PI/6`. When tape hovers over footprint:
1. Lid opens (tween animation)
2. Tape tips its leading edge down to match lid angle
3. Tape hovers higher to clear the open lid
4. On drop → snap animation tweens tape into loaded pose
5. Tape becomes kinematic (no physics), plays via YouTube

Recorder loading: `handleRecorderLoad` → `loadIntoPlayer` → YouTube playback
Recorder eject: `handleRecorderEject` → `autoEject` → tape falls back to table

---

## TapeBody.tsx — Physics + Animation

### FBX Mesh Loading

- Loads `/assets/textures/CassetteTape.fbx` once, caches
- Extracts variant mesh (always 'a' variant), bakes transforms, scales to TAPE_W
- Measures half-extents for collider (95% of actual size)

### Title Stamping

Canvas 2D draws title text onto baseColor texture:
- Label region: rotated 90° CW (compensates for UV rotation on model)
- Word-wrap up to 2 lines, truncate with ellipsis
- Stickers: yellow ∞ for infinite, red "Playlist", blue "Mixtape"

Cached by `variant:title:inf:pl:mx` key.

### Physics States

```
idle → falling → idle
     → dragged → idle
                → snapping → loaded
     → snapped → loading (kinematic)
     → loaded  → dragged (on pickup)
```

### Snap Animation

Post-drop tween: ease-out cubic over 0.4s, then switch to kinematic body type.

---

## Recorder3D.tsx

- Loads GLB from `/assets/recorder/gltf/cassetterecorder.glb`
- Wraps lid mesh (`tapelid_low`) in a pivot Group at its hinge edge
- Animates lid open/closed with smooth tween (rate 8 → ~0.4s)
- Click toggles lid for debugging
- Collider at centre, args = half-extents of scaled model

---

## Persistence (db.ts)

IndexedDB via `idb` library:
- `tapes` store: array of Tape objects
- `loadTapes()` / `saveTapes()` helpers

Migration: on first run, imports from localStorage `jeem_tapes`, `userVideoHistory`.

---

## Build System

```bash
npm run build  # build-lists.js + build-tapes.js
npm start      # build + node server.js
```

`build-lists.js`: Scans video/anime/vintage folders, indexes filenames → `file-index.json`

`build-tapes.js`: esbuild bundles `src/tapes/index.tsx` → `public/dist/tapes.js`, `src/mixtape/index.tsx` → `public/dist/mixtape.js`

---

## CSS Architecture (player.css)

Key classes:
- `.crt` / `.crt::before` / `.crt::after` — CRT scanline + vignette effects
- `.vignette::before` — box-shadow vignette
- `.bg`, `#bg-mp4`, `#bg-none`, `#bg-youtube` — background layers
- `.tapes-active` — added by script.js to hide CRT when tapes view active

CSS z-index stack:
- Background videos: z=-21 to -23
- Table/3D canvas: z=3
- CRT overlay: z=99998-99999
- UI: z=10000+

---

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/list-files` | GET | Returns shuffled video filenames (for backgrounds) |
| `/api/search` | GET | YouTube search: `/api/search?q=query` |
| `/api/playlist-tracks` | GET | Playlist metadata: `/api/playlist-tracks?list=PLAYLIST_ID` |
| `/api/mixtape/generate` | POST | AI-powered mixtape generation |

---

## Key Constants

```typescript
// TapesTable3D
RECORDER_POS = [-20, -0.5, 4]
RECORDER_ROT_Y = Math.PI / 6
RECORDER_HALF_W = 4, RECORDER_HALF_D = 5     // Lid open trigger
RECORDER_SNAP_HALF_W = 7, RECORDER_SNAP_HALF_D = 8  // Snap zone (wider)
RECORDER_LID_OPEN_ANGLE = Math.PI / 4       // Lid animation
RECORDER_HOVER_LIFT = 3                      // Extra hover height over recorder
RECORDER_LOAD_Y = 1.8                        // Y when loaded in recorder
RECORDER_LOAD_LOCAL_X = 0.4, RECORDER_LOAD_LOCAL_Z = 2.15  // Snap offset
LID_CLOSE_DELAY = 800                        // ms before lid closes after drop

// TapeBody
SNAP_DURATION = 0.4                          // Seconds to tween into recorder

// coords.ts
DRAG_HEIGHT = 5                              // Hover height while dragging
```

---

## Known Patterns

### External Drag Initiation

When tape is ejected from deck, `startDeckDrag` sets:
```typescript
externalDrag.current = { tapeId, targetX: 0, targetZ: 0, screenX, screenY }
```
TapesTable3D's `useFrame` detects `externalDrag.tapeId` and starts a drag.

### Texture Variants

11 variants (a-k) cycling for visual variety. `nextTextureVariant()` increments a global counter for new tapes. Legacy tapes use `seed % VARIANTS.length`.

### View Wipe Transition

```typescript
wipeTransition(onCovered, onUncovered)
// At 270ms: swap views behind the wipe
// At 600ms: end animation, call onUncovered
```

---

## Recent Changes (2024)

- Unify tape info + tracklist into single panel
- Open recorder lid when dragging tape over it
- Animate cassette recorder lid on click
- Video surface on table when MP4 mode active
- 3D cassette recorder on tape table
- IndexedDB persistence (replaces localStorage)

## Recent Changes (2026)

- **Black-canvas fix on initial load**: `TableSurface` now gates the video
  plane behind `hasLoadedVideo` (`currentSrc && readyState >= 2`). Before the
  video element has data it falls back to the dark overlay instead of
  rendering a black `VideoTexture`.
- **Recorder + shadow UI fade**: `Recorder3D` already listened to the
  `jeem-ui-fade` CustomEvent; `TableSurface` now mirrors the same signal to
  tween the `ShadowMaterial` opacity, and `Recorder3D`'s `castShadow`
  threshold dropped to 0.05 so the cast shadow on the wood tracks the body
  fade almost all the way down instead of snapping off.
- **In-scene CRT overlay** (on the 3D video plane): chromatic RGB stripes +
  radial vignette only — scanlines removed. Texture uses `NearestFilter`
  (linear filtering was smearing the 1px stripes to invisible when
  downsampled onto the plane). Source lives in the `crtMaterial` useMemo in
  `TableSurface.tsx`. The DOM `.crt::before/::after` CRT is still hidden
  under `.tapes-active` — only the 3D overlay is visible in tapes mode.
- **Video-change blowout restored in tapes mode**: `player.js` `_crossfade`
  now toggles the `glitching` class on `#tapes-root` in addition to
  `#bg-mp4`. CSS reuses the existing `@keyframes bg-glitch` (same curve as
  `view-flare`) so the 3D canvas gets the brightness/contrast/translate
  filter blowout during background video swaps. Without this the flash was
  invisible because `.tapes-active` hides the `#bg-mp4` element the CSS was
  originally attached to.

### Key wiring (as of 2026-04)

- `jeem-bg-change` (player.js → TableSurface): `{ bgTypeIndex, videoEl }`.
  Drives `isMediaMode` + `VideoTexture` creation.
- `jeem-ui-fade` (IdleWatcher in player.js → Recorder3D + TableSurface):
  `{ hidden: boolean }`. Fades recorder body, its cast shadow, and the
  shadow plane on the video.
- `#tapes-root.glitching` (player.js class toggle, 0.6s CSS animation):
  Blowout filter applied to the entire 3D canvas during `_crossfade`.