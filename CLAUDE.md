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