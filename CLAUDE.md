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
- `jeem-centre-camera` (TapesTable.tsx → TapesTable3D.tsx): tweens the
  perspective camera + MapControls target. Detail accepts either legacy
  `{ x, camY }` or `{ tx, tz, animate, camY }`. The `tx/tz` form lands the
  target at `(tx+8, 0, tz)` so the right-side tracklist UI doesn't overlap
  the focused subject.

## Recent Changes (2026-04, late)

### 3D table UX polish

- **Pickup zoom = 40**: picking up a tape tweens the camera to `y=40`
  (matches `maxDistance`), so users always pick up at the most zoomed-in
  pose regardless of their prior zoom.
- **Edge-pan while dragging** (`TapesTable3D.tsx` useFrame after the
  cam-tween useFrame): when a tape is held and the pointer enters a
  margin near the canvas edge, the camera + controls target drift in that
  direction. Top margin is wider (0.28) than the others (0.15) so dragged
  tapes can't slip behind the search/start UI overlay. Edge-pan bounds
  match the active-area clamp's effective bound (`CAM_BOUND - halfView`)
  so releasing the tape doesn't trigger a pull-back.
- **Pointer border clamp during drag**: pointer coords are clamped to a
  24px border inside the canvas before raycast / edge-pan, so the held
  tape can't be flung off-screen past the pan zone.
- **Extended drag bounds** (`TapesTable3D.tsx` constants `DRAG_X_EXT`,
  `DRAG_Z_TOP`, `DRAG_Z_BOT`): left/right/bottom drag clamps extended by
  +6 units beyond `DRAG_BOUND_X/Z`. Top stays at `DRAG_BOUND_Z` so tapes
  can't reach the search UI.
- **Held-over-recorder pose flatter**: `RECORDER_LID_OPEN_ANGLE = π/8`
  (was π/4) and `RECORDER_HOVER_LIFT = 1` (was 3) — held tape tilts less
  and hovers lower over the open lid.
- **Lid open trigger tightened**: the recorder lid opens on
  `tapeOverRecorder || recentlyLoaded` only — mouse hover and click no
  longer toggle it (the debug `onClick` in `Recorder3D.tsx` was removed).
- **Camera locked in player view**: `lockCamera` is now
  `showMixtapeCreator || view === 'player'`, fully disabling MapControls
  pan/zoom while a tape is playing.
- **No camera tween on drop**: removed both the on-drop pose-restore
  tween (`savedCamPoseRef` no longer drives `camTweenRef`) and the
  recorder-load `jeem-centre-camera` dispatch — the camera now stays
  wherever the user edge-panned it.

### Tape visuals

- **2D spool overlays** (`SpoolDisc` from `DeckTape3D.tsx`, used in
  `TapeBody.tsx`): tuned to sit flush over the 3D hubs.
  - radius `0.765 * geo.scale` (10% smaller than the 0.85 iteration)
  - left x `-1.9 * geo.scale - 0.325`, right x `1.9 * geo.scale`
  - new `yOffset` prop (default `0.01`); `TapeBody` passes `-0.1` to
    drop the discs flush with / just inside the tape's top surface.
- **Player-view rewind/remove buttons removed**: deleted the buttons
  block in `TapesTable.tsx` and the in-scene `Html` context-menu in
  `TapeBody.tsx`. `handle3DMenuAction`, `rewindTape`, and the
  `onMenuAction` plumbing are still wired but currently unused.

### Background mode list

- `BG_TYPES` in `public/src/player.js` trimmed to
  `["vintage", "anime", "video", "original"]` — removed `"none"` and
  `"tapes"`. The "open the tape table" button is the sole way to enter
  table view now.
- `setType` no longer touches `DOM.tapesRoot.style.display` — that's
  owned exclusively by `toggleTableView`. Previously both branches
  forced `display = "flex"`, which meant cycling backgrounds with `X`
  yanked the user back to the table.
- `loadSavedType` clamps the saved index against the new
  `BG_TYPES.length` so old localStorage values don't crash.

### Tape sharing

- **Share button** in the tape inspect view (`ShareButton` in
  `TapesTable.tsx`) calls `buildShareUrl(tape)` and copies the resulting
  URL to clipboard.
- **`src/tapes/share.ts`**:
  - `WirePayload` uses 1-letter keys (`i`, `t`, `a`, `s`, `v`, `p`, `pl`,
    `n`, `c`, `h`, `x`) to keep payloads compact.
  - `buildShareUrl` is async — POSTs the wire payload to
    `/api/tape-share`, returns `?t=<id>`. On any error (server down,
    non-OK response) it falls back to inline base64url:
    `?tape=<encoded>`.
  - `fetchShareById` GETs `/api/tape-share/:id` and converts the wire
    payload back to `SharePayload`.
- **Server routes** (`server.js` + `api/tape-share.js`):
  - `POST /api/tape-share { payload }` → `{ id }` (8-char alphanumeric).
  - `GET /api/tape-share/:id` → `{ payload }`.
  - File-backed at `data/tape-shares.json` (read-modify-write). The
    `data/` dir is auto-created and is NOT checked in. This local-disk
    store will not work on Vercel — swap for `@vercel/kv` (or similar)
    on deploy.
- **Spawn flow** in `TapesTable.tsx`:
  - URL effect parses `?t=<id>` first, then `?tape=<encoded>` as
    fallback. Strips both params via `history.replaceState` so reloads
    don't re-spawn.
  - Auto-calls `window.toggleTableView()` if the tape table is hidden
    when the link is opened.
  - The async resolution lives in `sharedTapePromiseRef`. The IndexedDB
    `init()` effect awaits this promise before its final `setTapes`,
    ensuring the shared tape is prepended even when the network round-
    trip outlasts the local DB load.
- **`public/index.html` mixtape-bundle gate**: the inline script that
  loads `dist/mixtape.js` previously triggered on `params.has('tape')`
  too. That caused the mixtape bundle's `useEffect` to redirect to `/`
  (since `create_mixtape` was unset), stripping the share param before
  React saw it. The condition is now `create_mixtape === '1'` only.

## Recent Changes (2026-05)

### Inspect-view transition (double-tap a tape)

Multi-stage fade + pan + zoom on entry, mirrored on exit. Implemented
in `handle3DDoubleTap` / `exitInspect` (TapesTable.tsx) coordinating
with the `jeem-centre-camera` handler in TapesTable3D.tsx.

- Entry timeline (relative to double-tap):
  - 0ms: `inspectTapeId` set → other tapes + recorder fade out via
    their `hidden` prop (no longer filtered out — they stay mounted so
    the fade can play). Easing rate bumped to 4.5 (TapeBody +
    Recorder3D) so ~0.5s reaches near-fully faded.
  - 200ms: pan tween starts (1000ms). Camera target lands at
    `(tx + 8, 0, tz)` — pass `tx - 2` from the parent so the tape
    sits ~6 units left of camera centre (left half of screen).
  - 400ms: zoom tween starts (1000ms) to camY = 24, runs in parallel
    via a separate `camYTweenRef` so it can be offset in time without
    overwriting the position tween.
  - 1650ms: inspect-view UI appears with `ui-glitching-in` class.
- Exit (double-tap focused tape, or remove flow):
  - UI hides immediately (`ui-glitching-out` then unmount after 450ms
    via `inspectUiPhase` state machine: `hidden|showing|visible|hiding`).
  - Pan + zoom-out reverse tweens.
  - `inspectTapeId` cleared at the end → other tapes/recorder fade in.
- `jeem-centre-camera` event detail extensions:
  - `dur`: pan tween duration (default 600).
  - `zoomTo`: optional Y target → spawns a parallel `camYTween`.
  - `zoomDelay` / `zoomDur`: timing for the Y tween.
  - `saveCurrentPose` / `restoreSaved`: capture pre-entry pose on the
    way in, restore exact pose on the way out so the post-tween clamp
    can't snap the camera somewhere else.
- Remove button (in inspect view): sets `removingInspected` → the
  inspected tape gets `hidden=true` and fades over 600ms. Then
  `deleteTape(target)` runs first (so the tape is gone from `tapes`),
  then `exitInspect()` runs the standard zoom-out + pan-back.
- `minDistance` drops to 20 during inspect so the y=24 zoom isn't
  clamped back up. Zoom controls disabled during inspect.

### Sub-mesh transparency artifact

Tape materials now toggle `depthWrite` off when `opacity < 0.995` to
kill stencil-like z-fight cutouts that appeared between body shell
and spool sub-meshes at low opacity (`TapeBody.tsx` per-frame fade).

### Inactivity glitch + reveal animations

Inactivity hide replaced with a glitch-out flicker. Reveal of the
search/start UI on initial load is also a glitch-in.

- `@keyframes ui-glitch-out` and `ui-glitch-in` in `player.css` —
  flicker via opacity + filter (`brightness/contrast/saturate/
  hue-rotate`) over 0.45s with `steps(9, end)` for digital cadence.
  **Keyframes intentionally do not touch `transform`** — some targets
  (notably `.tape-info-panel`, which uses `translateY(-50%)` to centre)
  would yank across the screen if mid-animation `transform` overrode
  their static centring transform.
- `Inactivity` module in `public/src/player.js`:
  - `_hide()` adds class `ui-glitching-out` to each target (forces
    reflow first so re-adding restarts the animation). `forwards`
    fill-mode keeps opacity:0 after end.
  - `_show()` removes the class and sets `style.opacity = "1"`. The
    inline opacity overrides the animation's persisted final state.
  - `_glitchTargets()` includes `titleContainer` now (was previously
    held at 0.25 separately — now glitches with the rest).
- Initial-load reveal:
  - `<body class="scene-not-ready">` in `index.html`. CSS hides
    `#start-container` via opacity:0 + pointer-events:none while the
    class is present.
  - `TapesTable.tsx` has a useEffect on `sceneReady` that, after a
    500ms beat, removes `scene-not-ready` from body and adds
    `ui-glitching-in` to `#start-container` for ~600ms.

### Loading-spinner staging

The full-screen loading overlay no longer hides the table the entire
time. `TableSurface.tsx` dispatches `jeem-table-ready` once the wood
texture has resolved (after the Suspense fallback). `TapesTable.tsx`
listens, sets `tableReady`, and drops the overlay's opaque background
(`#0a0805` → transparent) — the wood is visible behind the spinner
while tapes/recorder finish loading. The overlay disappears entirely
when `sceneReady` fires.

### Tape-info / tracklist panel during interaction

- `tape-info-panel` opacity drops to 0 while `dragging3D` (200ms
  transition). Restores when drag ends. Inspect view + idle playback
  unaffected.
- During playback, the panel waits for `isPlaying === true` (set via
  `notifyPlayState`) before mounting — so it doesn't flash empty
  state during YouTube load.
- Inspect-view UI mount/unmount goes through `inspectUiPhase` state
  machine so the glitch-out animation plays before unmount.
  Apply via `className={inspectUiClass}` on the panel wrapper (only
  when in inspect mode — playback path doesn't get the class).

### Recorder-pose-persistence bug

When a tape was loaded into the recorder via drag, `handle3DDragEnd`
saved the drop coords (= recorder pose) as the tape's `x/y`. On
refresh the tape would spawn under the recorder and stay stuck.
Fixed in two places:

- `handle3DDragEnd` in `TapesTable.tsx` skips the `setTapes({ x, y })`
  update if `recorderLoadedDuringDragRef.current` is true.
- `init()` migration: any tape whose saved (x, y) lands within the
  recorder zone (centre 1000, 1400; box ±380, ±420 in 2D) gets
  re-positioned at canvas centre with the standard random jitter.

### 2D spool overlay tuning

`SpoolDisc` parameters in `TapeBody.tsx`:

- `yOffset = -0.04` — flush with the tape's top face (was -0.1 which
  was inside the body). Position is `halfY + thickness/2 + yOffset`
  with thickness = 0.08, so -0.04 lands the disc exactly at `halfY`.
- Per-tape positions are tweaked manually — see the live values in
  `TapeBody.tsx` near the SpoolDisc invocations. Default symmetry is
  `±1.9 * geo.scale`; nudges are added inline.

### Build watch script

`build-tapes-watch.js` (untracked at repo root) runs esbuild in watch
mode for both `tapes.js` and `mixtape.js` bundles. Use during dev so
edits to `src/tapes/**` and `src/mixtape/**` auto-rebuild on save —
the regular `npm start` build is one-shot.

## Recent Changes (2026-05, second batch)

### "make a single tape" creator flow

Replaced the old start-screen search/lucky bar with two action buttons
(`#create-tape-btn` "make a single tape" + a disabled `#create-mixtape-btn`)
in `public/index.html`. The mixtape button is reserved for a future
flow.

- Click `#create-tape-btn` → dispatches `jeem-create-pending-tape`.
  `TapesTable.tsx` listens, spawns a placeholder tape (`isPending: true`,
  fresh uuid each time) at canvas centre, and runs the inspect-entry
  sequence. The standard inspect-view title textarea / remove buttons
  are skipped for pending tapes (`if (tape.isPending) return null`).
- Search overlay = `#single-tape-creator` in HTML, holding the blurb
  + the existing `#video-form`. CSS makes it a full-screen flex column
  with `justify-content: space-between` so the blurb sits above the
  centred 3D tape and the search bar sits below — works at any width.
  Search dropdown is now appended inside `#single-tape-search` so its
  width tracks the search bar.
- The pending tape is excluded from `saveTapes` so a half-completed
  flow doesn't persist across refreshes.
- Submission hand-off: `addTapeFromSearch` detects `tape.isPending`
  upfront and forwards the metadata to `finishPendingTape` (without
  touching `tapes` state itself). `finishPendingTape` orchestrates:
  - t=0:    glitch the search overlay out (`setInspectUiVisible(false)`),
            fade the placeholder tape (`setRemovingInspected(true)`).
  - t=600:  populate the placeholder in place (id stays the same so
            `restoreSaved` pose still resolves), call `exitInspect()`.
  - t=1800: re-position the now-real tape at canvas centre + jitter,
            bump `respawnVersions` and add to `newTapeIds` so TapeBody
            remounts and falls in from `SPAWN_HEIGHT`. Clear the
            `removingInspected` flag.
- Creator-overlay visibility uses `inspectedIsPending && inspectUiRendered`
  (derived from `tapes.find(t => t.id === inspectTapeId)?.isPending`),
  so the overlay glitches in/out with the rest of the inspect UI.

### Inspect view layout: single tapes vs. tracklist tapes

- `handle3DDoubleTap` and `startPendingSingleTape` pick a camera offset
  based on whether the focus tape has a tracklist:
  - Single tapes (no playlist / no infinite / no mixtape): pass
    `tx - 8` so the tape lands at the camera centre (centred on screen).
  - Playlist / infinite / mixtape: pass `tx - 2` so the tape sits in
    the left half, leaving room for the tracklist on the right.
- Inspect-mode title + button row uses `left: 50%` for single tapes,
  `left: 32%` for tracklist tapes.
- The unified info / tracklist panel returns `null` for single-tape
  inspect (no tracklist to show — keeps the view clean).

### Tracklist UX during playback

- `tape-info-panel` and each track row become click-through
  (`pointerEvents: 'none'`) for mixtape AND playlist playback — drag
  events fall through to the 3D canvas so users can still move tapes
  around without leaving playback. Infinite (non-mixtape) tapes keep
  the existing click-to-seek behaviour.
- Header above the tracklist now shows `MIXTAPE /` or `PLAYLIST /`
  (faint, uppercase, letter-spaced) followed by the tape's title in
  bold white with a soft text-shadow.
- Playing-track highlight: white text + 14% white background, 3px
  white left border, soft glow `0 0 8px rgba(255,255,255,0.4)`, bold
  title. Track-number column uses 04b03 (parent font) — kept inline
  with the rest of the row.
- New `playbackPanelGlitching` state flips true when `isPlaying`
  transitions false → true; the panel gets `ui-glitching-in` for
  500ms so title, author, tracklist all flicker in together.

### Mobile / responsive

- `body` ≤ 745px viewport: padinfo bar is now horizontal across the
  full width (instead of stacking right-side); `padinfo-row:last-child`
  uses `margin-left: auto` to push the fullscreen / info pair to the
  right edge. Reflects the removal of the 2D deck.
- Title `.start-title` uses `font-size: clamp(1.6em, 7vw, 3em)` plus
  `white-space: nowrap` so it shrinks instead of wrapping.
- 3D canvas mobile heuristic (`window.innerWidth <= 745`) in
  `TapesTable3D.tsx`: forces `camera.position.y = 45` on mount, sets
  `enableZoom={false}` and `minDistance = maxDistance = 45` so pinch
  / scroll zoom can't tighten the view. Inspect view still drops to
  `minDistance: 20` so the inspect zoom-in keeps working.

### Background-tab playback

`public/src/demo.js` `state_change` handler now calls
`TapesBridge.loadNextInfiniteTrack()` when state=0 for any infinite
tape — not just single videos. The previous implementation relied on
a 3-second `setInterval` poll that browsers throttle to ~1 minute on
hidden tabs, so auto-advance stalled. The iframe's `state_change`
event isn't a timer, so it fires reasonably even when backgrounded.

### Other small changes

- `z` keybind in `public/src/player.js` toggles between table and
  video views (mirrors `x` for bg cycle). Gated on `AppState.playing`
  — disabled when no tape is playing.
- `BG_LABELS = { video: "stock" }` in `Backgrounds.setType` — the
  user-facing label is now "stock" while the underlying folder name
  stays `/video`.
- `Recorder3D.tsx` logs all GLB mesh names once on load (`[Recorder3D]
  mesh parts: [...]`) so future animations can reference them.
- `.videobox-ok` no longer overrides text colour (was a green tint);
  the `.videobox-notok` red error styling is unchanged.

## Recent Changes (2026-05, third batch)

### Inspect view layout — full pass

The inspect-view UI (title row + buttons row + tracklist panel) was
restructured around four cases: wide single, wide tracklist, narrow
single, narrow tracklist. Anchors and camera offsets are tuned per
case so each lays out cleanly.

**Breakpoint:** `isNarrow` in `TapesTable.tsx` bumped 745 → 960. The
`TapesTable3D.tsx` `isMobile` heuristic stays at 745 (it gates touch /
zoom behaviour, distinct from layout choice).

**Camera offsets** (in `handle3DDoubleTap`):

- `tapeOffset = (isSingle || narrowNow) ? -8 : -1` — single + narrow
  centre the tape on screen; wide tracklist nudges -1 so the cassette
  sits a touch right of centre, opening room for the tracklist.
- `tzOffset = narrowNow ? (isSingle ? 0 : 3.5) : (isSingle ? 0 : 2)` —
  narrow tracklist bumps tz so the cassette projects higher in the
  frame (panel sits at the bottom of the screen below it).
- Pending-tape (`startPendingSingleTape`) uses `tx: tx - 8, tz: tz`
  to match wide single inspect.

**Wide single (≥960px, no tracklist):**
- Title at `top: 12vh, width: 25vw`, anchored `left: 50%` centred.
- Buttons at `bottom: 18vh, gap: 12, justifyContent: center`.

**Wide tracklist (≥960px, playlist/infinite/mixtape):**
- Title at `top: 12vh, width: 25vw, paddingRight: 20px`, anchored
  `left: 25%` (middle of the left half — fixed anchor that doesn't
  drift with viewport).
- Buttons at `top: 68vh, width: auto, flexWrap: nowrap` — same 25%
  anchor, content-sized so the three buttons stay on one line.
- Tracklist panel `.tape-inspect-wide-panel` anchored `top: 10vh`
  (was `top: 50%; transform: translateY(-50%)`) so the first track
  is at a fixed position regardless of list length and aligns with
  the title.

**Narrow single (<960px, no tracklist):**
- Title at `top: 20vh, width: 50vw`, centred. Multi-line wrap via
  the existing `.tape-inspect-title` CSS.
- Buttons at `top: 75vh, width: auto, flexWrap: nowrap`, centred.
  No bottom bar.

**Narrow tracklist (<960px, playlist/infinite/mixtape):**
- Title at `top: 13vh, width: 50vw`, centred.
- Buttons at `top: 94vh, width: auto, flexWrap: nowrap`, centred.
- Tracklist panel `.tape-inspect-narrow-panel`: `bottom: 70px`
  (was 60px), `padding: 16px 18px 12px` (extra 2px on left/right),
  `max-height: 46vh`. So at max height the panel top is around
  `100vh − 70px − 46vh ≈ 54vh − 70px`. Buttons at 94vh sit above
  the bottom bar but can collide with the panel on very short
  viewports — flag for future iteration.

### Inspect-mode tape flatten

New `inspecting?: boolean` prop on `TapeBody`. When true (and the
tape isn't dragged / loaded / snapping):

- Body switches to kinematic (`setBodyType(2)`).
- Captures current `(x, y, z)` and yaw on entry into `inspectPin`
  ref, then holds position and slerps rotation toward
  `Euler(0, savedYaw, 0)` over ~0.17s (`1 - exp(-delta * 6)`).
- Resting tilt from stacking / physics settling is therefore wiped
  out the moment a tape enters inspect view.

On exit (`inspecting → false`) the body switches back to dynamic
unless another state (loaded/snapping/dragged) now owns it.

Wired in `TapesTable3D.tsx` via
`inspecting={!!inspectTapeId && tape.id === inspectTapeId && !fadeInspectedTape}`.

### Font + style polish

- `.tape-inspect-title`, `.tape-panel-title`, and
  `.single-tape-blurb` bumped from 19px → 21px for legibility.
- `.tape-btn` gets `white-space: nowrap` + `flex-shrink: 0` so
  button labels don't wrap and the buttons don't get squashed when
  the row is constrained.
- `ShareButton` — `narrow` prop retained for API compat but ignored;
  both narrow and desktop use the same inline style now.
- `.single-tape-creator` blurb size updated alongside the title.

### CSS architecture refactor

Inline styles for inspect/playback UI extracted into reusable
classes in `player.css`:

- `:root` design tokens: `--tape-text`, `--tape-text-dim`,
  `--tape-text-strong`, `--tape-bg`, `--tape-accent`, `--tape-font`,
  `--tape-border`, `--tape-shadow`, etc.
- `.tape-ui`, `.tape-btn`, `.tape-panel`, `.tape-panel-header`,
  `.tape-panel-label`, `.tape-panel-title`, `.tape-panel-author`,
  `.tape-panel-tracks`, `.tape-track`, `.tape-track-num`,
  `.tape-track-title`, `.tape-track-author`, `.tape-track-time`,
  `.tape-spinner` — used across inspect + playback panels.
- `.tape-inspect-wide-panel` / `.tape-inspect-narrow-panel` for the
  two tracklist panel anchors.
- `.tape-inspect-wide-title` / `.tape-inspect-wide-buttons` for
  desktop title + buttons row positioning.

`TapesTable.tsx` still sets a few inline styles for case-specific
overrides (titleTop, paddingRight, width) but the bulk of the
visual styling is now in CSS.

### Sanity-check fixes (round 1)

- Removed `FADE_MS` reference from inspect remove-button onClick
  (the constant was scoped to `finishPendingTape`, would have
  thrown `ReferenceError` on remove). Now uses the literal `600`.
- Removed an over-eager unmount cleanup in `TapeBody` that was
  disposing the shared `stampCache` whenever any tape unmounted —
  it was wiping textures still in use by every other tape. The
  LRU eviction in `stampTitle` already handles cache growth.
- `db.ts`: dropped a misleading comment claiming `deleteAll+put`
  semantics (the code used `clear()`); also dropped the per-put
  `.catch` since the surrounding transaction would still abort on
  any error. Added trailing newline.
- `TapesTable3D.tsx`: hoisted `REC_COS`/`REC_SIN` to module scope
  (they were declared inside the component, recomputed every
  render). Pre-allocated `_raycaster`, `_ndcVec`, `_hitVec`,
  `_worldVec`, `_plane` via `useMemo` so pointer events don't
  churn `THREE.Vector3` and `THREE.Plane` allocations.
- `TapesTable.tsx`: cleanup `useEffect` for `inspectUiTimerRef` and
  `recorderLoadingTimerRef` on unmount, plus a matching cleanup for
  `lidCloseTimer` in `TapesTable3D.tsx`.
- `player.js` `History._load()` wrapped in try/catch.
- `db.ts` `loadTapes` / `saveTapes` wrapped in try/catch with error
  logging instead of throwing.
- `stampCache` in `TapeBody.tsx` got LRU eviction via a
  `stampCacheOrder` array — caps at `MAX_STAMP_CACHE = 100` entries,
  oldest disposed when full.
- Removed duplicate `.tape-inspect-wide-title` / `.tape-inspect-wide-buttons`
  rules in `player.css`; fixed `gap: 8` (invalid — unitless) → `gap: 8px`.
- `Creator.tsx` + `TapesTable3D.tsx` `Canvas`: changed shadow map
  from `PCFSoftShadowMap` → `PCFShadowMap` (intentional —
  `PCFSoftShadowMap` is deprecated).
## Recent Changes (2026-05, fourth batch)

### Sanity-check fixes (round 2)

- **TapeBody hooks bug fixed**: `positionedTapes` `useMemo` was placed
  *after* the `if (!mounted) return null;` early return, so the hook
  count changed between the first (mounted=false) and subsequent
  (mounted=true) renders → React error #310. Moved the `useMemo`
  above the early return.
- **`window.AppState?.playing` polling removed** (`TapeBody.tsx` per-
  frame): replaced with a shared `isPlayingRef: MutableRefObject<boolean>`
  prop. `TapesTable.tsx` owns the ref, syncs it from `isPlaying` state
  via a useEffect, and threads it through `TapesTable3D` → `TapeBody`.
  `TapeBody`'s useFrame reads `isPlayingRef.current` instead of the
  vanilla-JS global. No re-renders on play/pause toggle.
- **Recorder-load drag-end flag**: replaced `recorderLoadedDuringDragRef`
  (set inside `handleRecorderLoad` *after* `loadIntoPlayer`, so a throw
  in between would leave the flag false and exit player view) with a
  new `landedOnRecorder` boolean parameter on `onDragEnd`. Set at the
  actual drop site in `TapesTable3D.tsx`'s `onUp` handler — same
  moment `snap.tapeId` is assigned. `handle3DDragEnd` reads the
  parameter directly.
- **Dead code removed**:
  - `savedCamPoseRef` in `TapesTable3D.tsx` — written on drag start
    and cleared on drag end, never read. Removed declaration + both
    assignments.
  - `MixtapeOverlayEffect` component + its only-caller helper
    `mountMixtapeOverlay` (~95 lines of inline-styled DOM template
    string) in `TapesTable.tsx`.
- **Debug log strip**:
  - `Recorder3D.tsx`: GLB load progress, raw bbox, mesh part list,
    lid pivot coords, scale summary, and the now-unused load progress
    callback.
  - `TapeBody.tsx`: full FBX hierarchy dump (`fbxDumped` flag) and
    per-variant collider-size logs.
  - `Tape3D.tsx`: FBX bbox + mesh dumps in both `TapeFBX` and
    `NewTapeFBXTest`. (Components themselves are dead but still
    bundled — left for now.)
  - `TapesTable3D.tsx`: per-pointerdown `[TapeTable]` log. WebGL
    context lost/restored handlers kept (rare error events).
