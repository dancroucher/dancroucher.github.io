# jeem-fm

YouTube player with a 3D cassette-tape table. Browse videos as tapes, drag to deck to play, with MP4/anime/vintage backgrounds.

**Split:**
- Vanilla JS (`public/src/player.js`, `script.js`): 2D player, video playback, backgrounds, YouTube
- React/Three.js (`src/tapes/`, `src/mixtape/`): 3D table, physics, drag/drop, tape rendering

## Layout

```
public/
  index.html, player.css, font.css
  src/      player.js, script.js, youtube_iframe_api.js, demo.js
  dist/     tapes.js, mixtape.js  (esbuild bundles)
  assets/   favicon, font, recorder/gltf (.glb), textures (FBX + variants)
  video/, anime/, vintage/   bg MP4s
src/
  tapes/    index, TapesTable, TapesTable3D, TableSurface, TapeBody, Tape3D,
            Recorder3D, Spool, CassetteTape, DeckTape3D, TapeOverlayHybrid,
            MixtapeBuilder, coords.ts, types.ts, db.ts, textureCache.ts, share.ts,
            textureVariants.ts, hooks/
  hooks/    useTopBlockerMeasurement, useIsNarrow, usePlaybackPanelGlitch,
            useCalloutsDismissed, useCaretBlink, useLogoTypewriter,
            useShareUrl, usePlaylistTracks
  mixtape/  index, Tape, TrackList, Playback, Creator
api/        list-files, search, playlist-tracks, random[-playlist],
            mixtape/{save,generate,[id]}, tape-share, utils/youtube
server.js, build-tapes.js, build-lists.js
```

## Coordinates (`src/tapes/coords.ts`)

```
CANVAS_W=4000, CANVAS_H=2400; SCALE=MAP_SCALE=50
to3D(x,y)→[x3d,z3d]   to2D(x3d,z3d)→[x,y]
TILE_W=15.27 TILE_H=10  ACTIVE 3×3 (45.8×30)  TABLE 5×5 (76.4×50)
TAPE_W=7.02 TAPE_H=4.29  DRAG_HEIGHT=5  DRAG_BOUND_X=22.9  DRAG_BOUND_Z=15
```

## Video surface

When BG video plays (MP4 modes), `TableSurface` renders the video as `THREE.VideoTexture` on a plane so the recorder remains interactive. `player.js` dispatches `jeem-bg-change {bgTypeIndex, videoEl}`; `TableSurface` listens. The plane gates rendering on `hasLoadedVideo` (`currentSrc && readyState>=2`) — falls back to dark overlay until ready.

In-scene CRT overlay on the 3D plane: chromatic RGB stripes + radial vignette only (no scanlines). `NearestFilter` (linear smeared 1px stripes invisible). DOM `.crt::before/::after` hidden under `.tapes-active`.

## TapesTable.tsx state

```
Tape[]        loadedTape  playerTapeId    recorderSourced
view 'table'|'player'    showMixtapeCreator
inspectTapeId    inspectUiPhase 'hidden'|'showing'|'visible'|'hiding'
removingInspected    newTapeIds    respawnVersions
inspectUiVisible    mixtapeEditMode    mixtapeNameEditing
mixtapeBuilderTracks    focusedField    caretBlinkOn    caretPos
calloutsDismissed    styleChanged    playlistTracks
infiniteLoading    currentVideoId    deckEjecting    isPlaying
```

**Extracted hooks** — each owns a slice of previously inline state/effects:
- `useTopBlockerMeasurement()` → `topBlockerBottom` (ResizeObserver/MutationObserver, replaces 500ms poll)
- `useIsNarrow()` → `isNarrow` (resize listener, ≤960 breakpoint)
- `usePlaybackPanelGlitch(isPlaying)` → `playbackPanelGlitching` (glitch-in on play start)
- `useCalloutsDismissed(calloutsShowable)` → `[calloutsDismissed, setCalloutsDismissed]`
- `useCaretBlink(focusedField, mixtapeNameEditing)` → `caretBlinkOn`
- `useLogoTypewriter(inspectTapeId)` → void (swap `// jeem-fm` ↔ `// <`)
- `useShareUrl(spawnCX, spawnCY, sharedTapePromiseRef)` → void (parse `?t=`/`?tape=`)
- `usePlaylistTracks(inspectTapeId, tapes)` → `[playlistTracks, setPlaylistTracks]`
- `MixtapeData` / `MixtapeTrack` types moved to `types.ts`

View transition: "wipe" brightness flare (`wipeTransition(onCovered, onUncovered)` swaps at 270ms, ends at 600ms).

### `window.TapesBridge`
`onTapePlay, updateProgress, updatePlaylistIndex, addTapeFromSearch, addInfiniteTape, addMixtapeTape, notifyPlayState, onTrackEnded, loadNextInfiniteTrack, loadPrevInfiniteTrack`.

### Infinite tapes
`isInfinite + infiniteConfig` (decade/genre/year/artist/playlist). Pulls via `/api/search` with varied suffixes; `infiniteHistory[]`, `infiniteIndex`. Auto-advance on track end (or eject if single).

### Mixtapes
Special infinite tape: `author:'mixtape'`, pre-generated `infiniteHistory`. AI flow via `MixtapeCreator` (`jeem-create-mixtape` from vanilla JS). Manual flow: `MixtapeBuilder` (see below).

## TapesTable3D.tsx — scene

Camera: perspective fov=45, y=30–45, MapControls (table view only). Zoom clamp 35–45.

### Drag
Pointer + raycast to plane. `onDown` captures offset; `onMove` updates `drag.targetX/Y` (clamped, controls disabled); `onUp` snaps to recorder OR saves position. Mutable refs `drag/snap` avoid re-renders. `REC_COS/REC_SIN`, `_raycaster/_ndcVec/_hitVec/_worldVec/_plane` are module-scope/`useMemo` to avoid alloc churn.

Pointer is clamped to a 24px border inside canvas before raycast/edge-pan so dragged tape can't fly off.

### Edge-pan while dragging
useFrame after cam-tween: pointer near canvas edge drifts camera+target. Top margin 0.28, others 0.15 (top wider so tapes can't slip behind search/start UI). Edge-pan bounds match active-area clamp (`CAM_BOUND - halfView`) so release doesn't snap back.

Extended drag bounds: `DRAG_X_EXT`, `DRAG_Z_TOP=DRAG_BOUND_Z`, `DRAG_Z_BOT` (+6 left/right/bottom; top stays so tapes can't reach search UI).

### Recorder integration
Pos `[-20,-0.5,4]`, rot `π/6`. Hover footprint → lid opens, tape tips leading edge to lid angle, hovers higher. Drop → snap tween → kinematic → YouTube playback. Eject → fall back.

```
RECORDER_HALF_W=4, RECORDER_HALF_D=5            (lid trigger)
RECORDER_SNAP_HALF_W=7, RECORDER_SNAP_HALF_D=8  (snap zone)
RECORDER_LID_OPEN_ANGLE=π/8                      (tape held-over pose, flatter)
RECORDER_HOVER_LIFT=1
RECORDER_LOAD_Y=1.8  RECORDER_LOAD_LOCAL_X=0.4  RECORDER_LOAD_LOCAL_Z=2.15
LID_CLOSE_DELAY=800ms   SNAP_DURATION=0.4s
```

Lid only opens on `tapeOverRecorder || recentlyLoaded` (no hover/click toggles; debug onClick removed).

### Camera locks
`lockCamera = showMixtapeCreator || view==='player'` (controls fully disabled).
- Pickup: tween `y=40` (matches maxDistance) so users always pick up at most-zoomed pose.
- No tween on drop (no pose-restore, no recorder-load `jeem-centre-camera`); camera stays where edge-panned.
- Mobile (`innerWidth<=745`): force `y=45`, `enableZoom=false`, `min=max=45`. Inspect drops `minDistance=20`.

### External drag init
Eject from deck: `externalDrag.current = {tapeId, targetX,Y, screenX,Y}`. `useFrame` detects and starts drag.

## TapeBody.tsx

FBX `/assets/textures/CassetteTape.fbx` loaded once+cached. Variant 'a' mesh, baked transforms, scaled to TAPE_W. Collider 95% half-extents.

### Title stamping
Canvas 2D draws title onto baseColor texture. Label region rotated 90° CW (compensates UV). Word-wrap up to 2 lines, ellipsis. Stickers: yellow ∞ (infinite), red Playlist, blue Mixtape. LRU cache `MAX_STAMP_CACHE=100`, key `variant:title:inf:pl:mx`. Always stamps for `isInfinite || isPlaylist` (so mixtape sticker stays even when name is empty).

### States
`idle ↔ falling ↔ dragged ↔ snapping → loaded ↔ snapped → loading (kinematic)`. Snap tween: ease-out cubic 0.4s → kinematic.

### Inspect flatten
`inspecting?: boolean` prop. When true and not dragged/loaded/snapping: kinematic, captures `(x,y,z)` + yaw into `inspectPin`, slerps to `Euler(0,yaw,0)` over ~0.17s. Wipes resting tilt. On exit → dynamic unless another state owns it.

### Sub-mesh transparency
Materials toggle `depthWrite=false` when `opacity<0.995` to kill z-fight cutouts between shell and spool sub-meshes during fades.

### 2D spool overlays (`SpoolDisc`, from DeckTape3D.tsx)
Radius `0.765 * geo.scale`. Left x `-1.9*geo.scale - 0.325`, right x `1.9*geo.scale`. `yOffset` prop default `0.01`; TapeBody passes `-0.04` (flush with top face: thickness 0.08 → lands at `halfY`).

### isPlayingRef
Shared `MutableRefObject<boolean>` threaded TapesTable→3D→TapeBody. Replaces old `window.AppState?.playing` polling. No re-renders on play/pause.

## Recorder3D.tsx

Loads `/assets/recorder/gltf/cassetterecorder.glb`. Lid mesh `tapelid_low` wrapped in pivot Group at hinge edge. Smooth tween (rate 8, ~0.4s). Collider half-extents of scaled model. `castShadow` threshold 0.05. Listens `jeem-ui-fade {hidden}`. GLB mesh names logged once on load.

## TableSurface.tsx

Wood table + optional video plane. Mirrors `jeem-ui-fade` to tween `ShadowMaterial` opacity. Dispatches `jeem-table-ready` after wood texture resolves.

## Persistence (db.ts)

`idb` IndexedDB; `tapes` store. `loadTapes`/`saveTapes` wrapped in try/catch w/ logging. Migration: imports from localStorage `jeem_tapes`, `userVideoHistory` first run. Tapes with `isPending`/`isPendingMixtape` excluded from save. Migration: tapes whose saved (x,y) lands in recorder zone (centre 1000,1400; ±380,±420 in 2D) reposition at canvas centre + jitter.

## Build

```
npm run build   # build-lists.js + build-tapes.js
npm start       # build + node server.js
```
`build-tapes-watch.js` (untracked) runs esbuild watch for both bundles during dev.

## CSS (player.css)

Classes: `.crt`, `.crt::before/::after`, `.vignette::before`, `.bg`, `#bg-mp4`, `#bg-none`, `#bg-youtube`, `.tapes-active` (hides CRT in tapes view).

z-index: bg videos -21..-23; 3D canvas 3; CRT overlay 99998–99999; UI 10000+.

Design tokens (`:root`): `--tape-text`, `--tape-text-dim`, `--tape-text-strong`, `--tape-bg`, `--tape-accent`, `--tape-font`, `--tape-border`, `--tape-shadow`.

Reusable classes: `.tape-ui`, `.tape-btn`, `.tape-panel`, `.tape-panel-header`, `.tape-panel-label`, `.tape-panel-title`, `.tape-panel-author`, `.tape-panel-tracks`, `.tape-track`, `.tape-track-num`, `.tape-track-title`, `.tape-track-author`, `.tape-track-time`, `.tape-spinner`. `.tape-inspect-wide-panel` / `.tape-inspect-narrow-panel`. `.tape-inspect-wide-title` / `.tape-inspect-wide-buttons`.

Note: `gap` units required (e.g. `gap:8px`). Shadow map: `PCFShadowMap` (Soft is deprecated).

## Events / wiring

| Event | Source → Listener | Detail |
|-------|---|---|
| `jeem-bg-change` | player.js → TableSurface | `{bgTypeIndex, videoEl}` |
| `jeem-ui-fade` | IdleWatcher → Recorder3D + TableSurface | `{hidden}` (fades body, cast shadow, shadow plane) |
| `#tapes-root.glitching` | player.js class toggle (0.6s CSS) | blowout filter on canvas during `_crossfade` |
| `jeem-centre-camera` | TapesTable → TapesTable3D | `{tx,tz,animate,camY}` legacy `{x,camY}`. Target lands at `(tx+8, 0, tz)`. Extras: `dur`, `zoomTo`, `zoomDelay`, `zoomDur`, `saveCurrentPose`, `restoreSaved` |
| `jeem-create-mixtape` | vanilla → TapesTable | trigger AI MixtapeCreator |
| `jeem-create-pending-tape` | `#create-tape-btn` → TapesTable | spawn pending single tape |
| `jeem-create-pending-mixtape` | `#create-mixtape-btn` → TapesTable | spawn pending mixtape placeholder |
| `jeem-table-ready` | TableSurface → TapesTable | wood texture loaded |

## API

| Route | Description |
|-------|---|
| GET `/api/list-files` | shuffled video filenames |
| GET `/api/search?q=` | YouTube search |
| GET `/api/playlist-tracks?list=` | playlist metadata |
| POST `/api/mixtape/generate` | AI mixtape gen |
| POST `/api/tape-share {payload}` | → `{id}` (8-char alnum) |
| GET `/api/tape-share/:id` | → `{payload}` |

`tape-share` is file-backed at `data/tape-shares.json` (auto-created, not checked in). Won't work on Vercel — swap for `@vercel/kv`.

## Tape sharing (share.ts)

`WirePayload` 1-letter keys (`i,t,a,s,v,p,pl,n,c,h,x`). `buildShareUrl(tape)` async — POSTs payload, returns `?t=<id>`. Falls back to inline base64url `?tape=<encoded>` on error. `fetchShareById(id)` GETs and converts back.

Spawn flow (TapesTable.tsx): URL effect parses `?t` then `?tape`, strips via `replaceState`. Auto-calls `window.toggleTableView()` if hidden. `sharedTapePromiseRef` awaited by IndexedDB init effect so shared tape prepends even if network outlasts local load.

`public/index.html` mixtape-bundle gate: `create_mixtape === '1'` only (was `params.has('tape')` which stripped share param).

## Background modes (`BG_TYPES`)
`["vintage","anime","video","original"]` (no `none`/`tapes`). Open table is the only entry to table view. `setType` doesn't touch `tapesRoot.style.display` (owned by `toggleTableView`). `loadSavedType` clamps saved index against `BG_TYPES.length`. `BG_LABELS = {video:"stock"}`.

`z` keybind toggles table↔video views (gated on `AppState.playing`). `x` cycles bg.

`public/src/demo.js` `state_change` calls `loadNextInfiniteTrack()` for any infinite tape on state=0 (was 3s `setInterval` poll, throttled on hidden tabs).

`window.addEventListener("keydown")` calls `Inactivity.reset()` at top (before input/textarea early return).

## Texture variants

11 variants (a-k) cycle. `nextTextureVariant()` increments global counter. Legacy: `seed % VARIANTS.length`. Pending mixtape tap cycles via `onSingleTap` → advance `tape.textureVariant` through `TEXTURE_VARIANTS` (a–n wrap).

## Inspect view

Multi-stage entry/exit timeline (`handle3DDoubleTap` / `exitInspect`):

- 0ms: `inspectTapeId` set; other tapes + recorder fade via `hidden` prop (rate 4.5 → ~0.5s).
- 200ms: pan tween (1000ms) → target `(tx+8, 0, tz)`.
- 400ms: zoom tween (1000ms) → `camY=24`, separate `camYTweenRef`.
- 1650ms: inspect UI mounts with `ui-glitching-in`.

Exit: UI hides immediately (`ui-glitching-out` then unmount @ 450ms via `inspectUiPhase`). Pan+zoom reverse. `inspectTapeId` cleared at end.

Camera offsets in `handle3DDoubleTap` — unified: `tapeOffset=-8`, `tzOffset=3` for every inspect entry (cassette centred, projected high). Pending pre-fill spawn matches.

`minDistance` drops to 20 during inspect; zoom controls disabled.

Remove button: `removingInspected` → tape `hidden=true`, fades 600ms → `deleteTape` → `exitInspect`.

Pending-mixtape double-tap is a no-op (label area absorbs taps for inline name editor).

### Inspect layout

Title row + buttons row + tracklist panel. Breakpoint `isNarrow` = 960 (in TapesTable.tsx). `isMobile`=745 in TapesTable3D.tsx (gates touch/zoom).

Unified single+tracklist layout: `colStyle` anchors `left:50%`. Title `top:12vh` (wide) / `13vh` (narrow). Buttons row `top:94vh`, content-sized, `flexWrap:nowrap`, centred. (Old per-case branching gone.)

Title is click-to-edit (`tape-inspect-title-display` span + pen icon → textarea). Same in `Creator.tsx`. State: `editingTitle`, `editingName`.

Standard rewind/share/remove suppressed when `isPendingMixtape` (builder's create button replaces them).

## Tracklist

`<div className="mixtape-track-list">` for any tracklist (mixtape/playlist/infinite). Click-to-seek for non-mixtape via inline `cursor:pointer` + `onClick`. Mixtapes read-only during playback.

CSS: grid `"num title" / "num author"`; `.tape-track-top` uses `display:contents`. Numbers 1.4em opacity 0.55, no trailing dot. Title+author single-line ellipsis. `min-height:64px`, `padding:12px 16px`.

Wrapped in `.mixtape-track-list-frame` div: frame owns dark bg + upward-pointing triangle indicator (`::before`, `border-bottom:20px solid rgba(0,0,0,0.45)`, `top:-20px`). Inner list owns `overflow-y:auto` so iOS rubber-band moves the triangle with it. Per-panel `::before` triangles set `display:none`.

Tracklist panel anchor `top:48vh`. Narrow `left/right:16px`. Wide centred `width: min(50vw, 720px)`. List `max-height: min(495px, calc(100vh - 48vh - 130px))` (~8 rows × 64px). Panels `overflow:visible` so triangle isn't clipped.

`tape-info-panel` opacity drops to 0 while `dragging3D` (200ms). During playback, panel waits for `isPlaying` (via `notifyPlayState`) before mounting. Inspect mount/unmount via `inspectUiPhase`.

Playback panel mode (`tape-playback-panel` class): anchored below song/title container via `topBlockerBottom` (ResizeObserver + MutationObserver, replaces 500ms poll). Wide layout: `left:0;right:0;width:auto;overflow:hidden;scrollbar-width:none` (left-aligned to song container edge at 38px padding). `trackListScrollRef` uses RAF retry loop (up to 8 frames) to centre the active row on open — needed because the `.active` row may not exist on the first render frame. Ref only attaches when `!inspectTapeId`.

Header label: `MIXTAPE /` or `PLAYLIST /` faint uppercase + bold white tape title.

Active-row highlight: white text + 14% white bg, 3px white left border, glow `0 0 8px rgba(255,255,255,0.4)`, bold title. Number col uses 04b03 (parent font).

`playbackPanelGlitching` flips true on `isPlaying` false→true; panel gets `ui-glitching-in` 500ms.

Click-through during mixtape AND playlist playback (`pointerEvents:'none'`). Infinite (non-mixtape) keeps click-to-seek.

## Inactivity glitch + reveal

`@keyframes ui-glitch-out` / `ui-glitch-in` in player.css: opacity + filter (brightness/contrast/saturate/hue-rotate) over 0.45s, `steps(9, end)`. **Don't touch `transform`** — would yank `.tape-info-panel` (uses `translateY(-50%)`).

`Inactivity._hide()` adds `ui-glitching-out` (force reflow first to restart). `_show()` removes class + sets inline `opacity:1`. `_glitchTargets()` includes `titleContainer`.

Initial reveal: `<body class="scene-not-ready">` hides `#start-container` (opacity:0, pointer-events:none). On `sceneReady` + 500ms beat, body class removed, `#start-container` gets `ui-glitching-in` ~600ms.

## Loading overlay

Drops opaque bg (`#0a0805`→transparent) once `tableReady` (from `jeem-table-ready`); wood visible behind spinner. Disappears entirely when `sceneReady`.

## Start screen

`#create-tape-btn` "make a single tape" + `#create-mixtape-btn` "make a mixtape". Replace old search/lucky bar.

### Pending single (`isPending`)
Click → `jeem-create-pending-tape` → spawn placeholder at canvas centre + inspect-entry. Excluded from save. Standard inspect title/remove skipped (`if (tape.isPending) return null`).

`#single-tape-creator` overlay: blurb + `#video-form`. Full-screen flex column `justify-content:space-between` so blurb above 3D tape, search bar below. Search dropdown appended inside `#single-tape-search` (width tracks bar).

Submission: `addTapeFromSearch` detects `isPending`, forwards to `finishPendingTape`:
- t=0: glitch overlay out, fade placeholder.
- t=600: populate placeholder in place (id stable so `restoreSaved` resolves), `exitInspect`.
- t=1800: reposition at canvas centre + jitter, bump `respawnVersions`, add to `newTapeIds` → fall-in from `SPAWN_HEIGHT`. Clear flag.

### Pending mixtape (`isPendingMixtape`)
Click → `jeem-create-pending-mixtape` → `startPendingMixtape` spawns placeholder + inspect entry. Excluded from save.

`mixtape-creator-overlay--callout` always-on (narrow + wide). Narrow (≤960): builder spans `left:16px;right:16px`.

**Callouts** — SVG `<line>+<circle>` in fixed `.mixtape-callout-svg` (`pointer-events:none`):
- Left `.mixtape-callout-name` ("Add a name…"): `left:4vw;top:14vh;width:22vw`. Reuses `.single-tape-blurb`.
- Right `.mixtape-callout-blurb`: `right:4vw;top:14vh`.
- Leaders: percent-coord SVG paths, 7px filled circles `rgba(250,249,246,1)`, lines 2px `rgba(250,249,246,0.85)`.
- Glitch-hide: `is-callout-hidden` class replays `ui-glitch-out 0.45s steps(9,end) forwards`. Triggers: `nameAdded = title.trim().length>0` (left); `trackAdded = mixtapeBuilderTracks.length>0` (right).

**Inline name on cassette** — `.tape-name-on-cassette` transparent `<textarea>` over label area (`top:24vh; width:18vw; height:28px; caret-color:transparent; color:transparent; spellCheck=false`). Updates `tape.title` directly. No autoFocus.

Caret rendered into texture in 04b03 font: `nameInputFocused` toggles on focus/blur; `caretBlinkOn` interval 500ms while focused+pending; `tapesWithCaret` useMemo derives `title + '|'`. `stampTitle` LRU caches both, blink toggles between cached textures.

`startPendingMixtape` initialises `title:''`. All `'[mixtape name]'` guards stripped.

**Click-cycle texture** — pending mixtape tap cycles `textureVariant` via `onSingleTap`. Label shielded by textarea overlay (`pointer-events:auto`).

**Title link** — while pending mixtape, `// jeem-fm` swapped to `// <` (stash original on `dataset.jfmOriginal`). `handleLogoClick` runs `exitInspect()` while inspecting (instead of `<a href=".">` reload).

**MixtapeBuilder** (`src/tapes/MixtapeBuilder.tsx`):
- Search input: debounced 250ms `/api/search`. URL-paste via `parseVideoId` + youtube oembed for title/author.
- Keys: ↑/↓ highlight, Enter add. Hover updates highlight.
- On create: tracks → `infiniteHistory`, placeholder replaced with real `author:'mixtape'` infinite tape (new uuid), `newTapeIds` triggers fall-in.
- `.mixtape-track-list-frame` wrapper for dark bg + triangle indicator.
- Search dropdown: `.search-dropdown.mixtape-search-dropdown` selector (beats generic `.search-dropdown{width:40vw}`); `left:0;right:0`; chain forced `overflow:visible`.
- Footer (`.mixtape-builder-footer`): centred flex row with `by:` author input (`.mixtape-author-input`, `maxLength=8`, transparent bg + white border) and the create button. Props `authorTag` + `onAuthorTagChange` are wired from `TapesTable` so each keystroke updates `tape.authorTag`, which triggers a re-stamp and live-updates the cassette sticker.

**Builder track row** — three hover regions (only `.mixtape-builder` — inspect tracklist unchanged):
- `.track-handle` (56px col): number default, swap `fa-grip-vertical` on hover, `cursor:grab`.
- `.track-info`: hover shows actions.
- `.track-actions` (edit + remove): pinned shown via `:has(.track-info:hover)` / `:has(.track-actions:hover)`.

Edit (`editingIndex`): pen → row swaps to input pre-filled. `activeRow` hidden. Submit → `onReplaceTrack(i,track)`, `editingIndex=null`. Esc cancels; `fa-xmark` cancel button beside tick.

Remove: trash → `onRemoveTrack(i)` → `setMixtapeBuilderTracks(prev.filter(...))`. Numbers re-render.

Drag-reorder (custom, no HTML5):
- `mousedown` on handle → `startDrag(i,e)` (capture clientY + measured rowHeight in `dragInfoRef`, set `draggingIndex`, `dragDeltaY=0`).
- useEffect attaches global `mousemove` (updates delta) + `mouseup`.
- `dragTargetIndex = clamp(0..len-1, draggingIndex + round(delta/rowHeight))`.
- `rowTransform(i)`: dragged row `translateY(${delta}px)+z:10`; displaced rows `translateY(±rowHeight)`.
- Transition only when `.mixtape-track-list.is-dragging` — post-drop reset snaps instantly.
- `mouseup` → `onReorderTracks(next)` (splice in parent state). Disabled in edit mode.

## Search bar (script.js)

`Search` module: ↑/↓ highlight nav, Enter selects highlighted. Tracks `_highlighted`, scrolls items, applies `.highlighted`.

## Mobile (≤745)

- padinfo bar horizontal full-width; `padinfo-row:last-child` `margin-left:auto` (fullscreen/info pair right).
- `.start-title` `font-size: clamp(1.6em, 7vw, 3em); white-space: nowrap`.
- Canvas mobile heuristic: `y=45`, `enableZoom={false}`, `min=max=45`. Inspect drops `minDistance:20`.

## Sanity / robustness

- TapeBody: hooks before any early return (was bug: `useMemo` after `if (!mounted) return null`).
- `isPlayingRef` shared ref instead of polling `window.AppState?.playing`.
- `landedOnRecorder` boolean param on `onDragEnd` (set at drop site in `onUp`); replaces `recorderLoadedDuringDragRef` (which had ordering bug). `handle3DDragEnd` skips position save when true.
- `handle3DDragEnd` recorder-load skips `setTapes({x,y})`.
- IndexedDB init migration: tapes in recorder zone → repositioned at canvas centre.
- Cleanup useEffects unmount: `inspectUiTimerRef`, `recorderLoadingTimerRef`, `lidCloseTimer`.
- `History._load()` in player.js wrapped try/catch.
- `db.ts` `loadTapes`/`saveTapes` try/catch w/ logging.
- `stampCache` LRU `MAX_STAMP_CACHE=100` w/ `stampCacheOrder`. **Don't dispose on TapeBody unmount** — shared with other tapes.
- `db.ts` uses `clear()` (not `deleteAll+put`); rely on transaction abort, not per-put `.catch`.
- TapesTable3D: `REC_COS/REC_SIN` module scope; `_raycaster/_ndcVec/_hitVec/_worldVec/_plane` `useMemo`d.
- Logo click checks `inspectTapeIdRef.current` first → `exitInspect()` (was reloading mid-animation).
- Title size 21px (`.tape-inspect-title`, `.tape-panel-title`, `.single-tape-blurb`).
- `.tape-btn` `white-space:nowrap; flex-shrink:0`.
- `ShareButton` `narrow` prop kept for API compat, ignored.
- Dead removed: `savedCamPoseRef`, `MixtapeOverlayEffect`+`mountMixtapeOverlay`, debug logs in Recorder3D/TapeBody/Tape3D/TapesTable3D, GLB load progress callback, fbxDumped flag, per-variant collider logs.
- `.videobox-ok` no longer overrides text colour.

## Tape label font + caret + author sticker

### Permanent Marker label font
Title text on the cassette label uses Google Fonts **Permanent Marker** at
`64px`, line-height `× 1.0`. Loaded via `<link>` in `public/index.html`.

`TapeBody.tsx` kicks off `document.fonts.load("64px 'Permanent Marker'")`
at module init; on resolve it flushes `stampCache` and dispatches
`jeem-fonts-ready`. Each `TapeBody` listens, bumps a `fontsTick` state
(included in stamp `useEffect` deps) so existing tapes re-stamp with the
real font once it's available — no remount/respawn.

### Block-cursor caret (terminal-style, layout-stable)
On the pending-mixtape inspect view, the cassette title is edited
via an invisible in-canvas `<textarea>` overlay (`.tape-name-on-cassette`)
with transparent text + transparent caret + transparent `::selection`
so only the in-canvas cursor is visible. The author tag is edited
through a separate visible input in the MixtapeBuilder footer (see
"Author-tag sticker" below) — the cassette-overlay textarea for
author was removed because aligning a fixed-position element with a
rotated 3D-projected sticker proved too fragile.

Cursor renders as an inverted block (filled `#222` rect width-of-character,
height `fontSize × 1.05`) with the underlying glyph re-drawn in
`#f5f1e0`. End-of-line / empty-string fallback width = previous char
(or `"a"`). Block matches "block cursor" terminal behaviour.

`stampTitle` lays out title text **without** the caret glyph, then
overlays the block at the measured offset — so the rest of the title
doesn't shift as the cursor blinks. Empty-title case seeds a single
`{ text: '', startIdx: 0, endIdx: 0 }` line so the cursor renders at
offset 0 immediately on focus (before any keystroke).

Per-line `LineMeta = { text, startIdx, endIdx }` tracking lets the
caret resolve `lineIdx + offset` for multi-line wrap.

### Caret state machine (TapesTable.tsx)
- `focusedField: 'title' | 'author' | null` — single source of truth.
  In practice only `'title'` ever fires now (the author cassette-overlay
  was removed); `'author'` remains in the type for the in-canvas caret
  branch in `stampTitle` should we ever re-introduce direct editing.
- `caretBlinkOn` — toggles every 500ms via interval gated on
  `focusedField && inspectedIsPendingMixtape`.
- `caretPos: number` — tracked from `selectionStart` on the title
  editor via `onChange / onFocus / onSelect / onKeyDown / onClick`.
  `onKeyDown` defers via `requestAnimationFrame` (selectionStart
  updates after the event).
- `tapesWithCaret` useMemo injects transient `_caretField` +
  `_caretIndex` onto the inspected tape (only while focusedField is
  set and blink is on). Stamp `useEffect` deps include both, so each
  blink flips re-stamps to a new cached texture.

### Author-tag sticker
`Tape.authorTag?: string` — max 8 chars. Yellow sticker stamped onto
the cassette label, rotated **−45°** in the label plane so it sits
diagonally like a hand-stuck price label.

Drawn inside `stampTitle` after the standard `ctx.translate(label.cx,
label.cy); ctx.rotate(π/2)` (the label-orientation rotation), then a
nested transform: `ctx.translate(360, 220); ctx.rotate(-π/4)`.
Coordinates land within the cassette face's mapped UV region — the
original `(0, -300)` placement was on a part of the texture not mapped
to the visible face, which is why early iterations rendered nothing.

Sticker geometry (in the post-translate, post-rotate local frame —
draw at origin):
- `stickerW=260, stickerH=120`, rounded 10px corners
- Gradient `#ffe000 → #f5c800` (saturated yellow)
- Stroke `rgba(180,150,30,0.5)`
- "Made by:" header in `600 18px Helvetica Neue` at `y = -stickerH/2 + 16`
  for legibility against the bright yellow
- Author text in `bold 52px "Courier New"` (matches the "Mixtape" badge
  font for consistency) at `y = 16`
- Empty + pending + unfocused → faint `"…"` placeholder at the same
  position so the sticker is discoverable as editable

Visibility gate (unchanged):
`showAuthorSticker = !!authorTag || isPendingMixtape || (caretField === 'author' && caretIdx !== undefined)`.

`hasSticker` (in the stamp `useEffect`) **must** include
`isPendingMixtape` — otherwise an empty-title pending mixtape skips
`stampTitle` entirely and the sticker (with its `"…"` placeholder)
never renders. This was the root cause of the "sticker not appearing"
bug.

Editor: visible `<input>` in the MixtapeBuilder footer (see below) —
no longer an in-canvas overlay.

`onCreate` (mixtape finalise) propagates
`authorTag: (tape.authorTag ?? '').slice(0, 8) || undefined` onto
the real tape.

`stampCache` cacheKey now includes `authorTag` and `isPendingMix`
so the sticker cycles correctly between empty-placeholder, focused-
empty, and populated states.

## Pending-mixtape additions

### Style-hint callout (3rd callout)
`.mixtape-callout-style` — third left-side callout below the name
prompt: "Click the mixtape to change style." Anchored
`left:4vw top:36vh w:22vw`. Leader: `S start (26%, 42%)` →
`S bend (42%, 42%)` → `S tip (42%, 35%)` (one bend, right then up).

Hide trigger: `styleChanged` state. Set true in
`onSingleTap` when `tape.isPendingMixtape` (which cycles
`textureVariant` through `TEXTURE_VARIANTS`). Reset false in
`startPendingMixtape`. Glitches out via `is-callout-hidden` class
(replays `ui-glitch-out 0.45s steps(9, end) forwards`).

### Pending-mixtape spawn rotation
`startPendingMixtape` uses `±5°` random angle (was `±20°`) so the
cassette lands roughly square-on to the camera and the in-canvas
name/author editors line up cleanly. Other spawn sites unchanged.

### Inspect-mode hit-test isolation
`raycastTape` early-rejects every tape whose id != `inspectTapeId`
when inspect mode is active. Stops table tapes underneath the
focused subject from stealing taps (matters most during the
pending-mixtape texture-style cycling click). `inspectTapeId`
added to the `useCallback` deps.

### Pending-mixtape inspect double-tap
`handle3DDoubleTap` no-ops when `isPendingMixtape` (don't bail out
of the flow if the user double-taps the cassette label).

### Inline-name editor positioning
`.tape-name-on-cassette`: `left:50% top:24vh w:40vw h:48px
translateX(-50%)`. Selection highlight suppressed via
`::selection { background: transparent; color: transparent }`.
selectionStart still drives the in-canvas cursor — only the
visible blue/grey selection bar is hidden.

## Mixtape inspect (existing mixtapes)

The inspect view of a finalised mixtape reuses `MixtapeBuilder` directly
inside the inspect panel — same component, same UX as the creation
flow. Edits are wired straight to `tape.infiniteHistory` /
`tape.authorTag` (and `loadedTape` if it matches), so changes persist
without a separate "save" step.

`inspectedIsMixtape` derived flag = `inspectedTape.author === 'mixtape'
&& isInfinite && !isPendingMixtape`. Used alongside `inspectedIsPendingMixtape`
to switch on inspect-of-existing-mixtape behaviour.

### Edit-mode gate (`mixtapeEditMode`)
Read-only by default; toggled by an "edit" → "confirm" button that
sits as the 4th item in the inspect buttons row (mixtape inspect only).
`mixtapeEditModeRef` mirrors state for use inside refs/closures
(`onSingleTap`, `handle3DDoubleTap`). Auto-resets to `false` whenever
`inspectTapeId` changes.

While **off** (view mode):
- `MixtapeBuilder` receives `readOnly={true}` → hides the `+` add row
  and `.track-actions` (pen/trash) via `.mixtape-builder--readonly`
  CSS, drag handle inert (`startDrag` early-returns; `cursor:default`,
  no grip swap on hover).
- `.tape-name-on-cassette` textarea is not rendered.
- `onSingleTap` texture cycle is suppressed.
- Buttons row shows: share, remove, edit.

While **on** (edit mode):
- All edit affordances unlock.
- `handle3DDoubleTap` blocks the inspect-exit branch (must use the
  explicit "confirm" button to leave).
- Buttons row shows: confirm only.

`startDrag` `useCallback` deps must include `readOnly` — otherwise the
closure captures the stale value and the drag handle silently no-ops
on the first attempt after entering edit mode (until any other
re-render refreshes the closure).

### Logo `// <` swap + type-out animation
Triggered for **any** inspect (`inspectTapeId != null`), not just
mixtape. The title link is split once on first run into a static
`// ` text node + a `<span class="jfm-suffix">` that owns the
animated suffix. `dataset.jfmSuffix` stashes the original suffix
("jeem-fm") for replay; `dataset.jfmInit` flags the rewrite.

Transitions:
- Entering inspect: peel current suffix right-to-left at 70ms/char,
  then swap to `<span class="jfm-back-arrow">&lt;</span>`.
- Exiting inspect: clear arrow, type suffix left-to-right at 70ms/char.
- First mount seeds the suffix without animation (no flash).
- `_jfmTypeTimer` stored on the element; cleared on every effect run
  so rapid toggling doesn't leave the title mid-animation.

`.jfm-back-arrow { line-height: 0; vertical-align: baseline }` — the
1.2em glyph would otherwise expand the parent line-box and shift
the title down vs. the home/tapes screen's plain `// jeem-fm`.

### Title row removed
The inspect-title `<div>` (with edit textarea + pen icon) is gone for
every inspect type. Inline name editing for mixtapes happens via the
in-canvas `.tape-name-on-cassette` textarea (same overlay used in the
pending-mixtape flow); single/playlist inspect have no name editor.

### Texture cycle
`onSingleTap` cycles `textureVariant` only when:
- `tape.isPendingMixtape` (creation flow), **or**
- `tape.id === inspectTapeId && author === 'mixtape' && isInfinite
  && mixtapeEditMode`.

Other inspect types (single, playlist) no longer cycle on tap.

### Panel geometry (mixtape-create + mixtape-inspect + playlist-inspect)
All three wide-viewport tracklist boxes use **identical** geometry so
they line up across screens:
```
top: 48vh; left: 50%; transform: translateX(-50%);
width: min(50vw, 720px); padding: 0; bottom: 60
```
Inline `widePanel` style applies the override when
`inspectTapeId && (isMixtape || isPlaylistTape)`. Other inspect /
playback panels keep the legacy 56vw / `calc(50% - 70px)` layout.

`.tape-mixtape-inspect` class on the inspect panel:
- Forces `overflow:visible` through `.mixtape-builder →
  .mixtape-track-list-frame → .mixtape-track-list` so the search
  dropdown can escape the box.
- Forces `.mixtape-builder { width: 100% !important }` to defeat the
  default `min(620px, 86vw)` cap that would shrink the builder
  inside a 720px panel.
- Lifts `max-height` on the list (mirrors the creator overlay).

Narrow viewports (`≤960`) already aligned via `left:16px;right:16px`.

### MixtapeBuilder `+` add row
Default state: blank row sized like a track row (transparent
background, dashed bottom border `rgba(250,249,246,0.15)` matching
neighbours), centred grey `+` glyph. Glyph is a literal `+` character
in Helvetica Neue at `font-weight:200; font-size:22px` (FontAwesome
`fa-plus` was too chunky). Hover/focus brightens text colour.

Click → `addOpen=true` → row swaps in for `activeRow` (search input
+ tick). After `addAndReset` (successful add), `addOpen` resets to
`false` so the user clicks `+` again to add the next track. No
explicit cancel control on the open state.

`readOnly` prop hides the `+` row entirely.

### Rewind button removed
The "rewind" inspect-row button is gone for every inspect type.
`rewindTape` callback is still defined (used elsewhere if needed) but
no UI surfaces it. The `<i class="fa fa-fast-backward">` in
`public/index.html` is the playback prev-track button — distinct
from inspect rewind, kept.

## Search dropdown portal (MixtapeBuilder)

The active-row search dropdown is rendered via `createPortal` to
`document.body` so it can extend past the scrollable
`.mixtape-track-list` and the inspect panel without being clipped.
Position is computed from the input wrap's `getBoundingClientRect()`
and applied as `position: fixed` (`left`, `width`, plus `top` or
`bottom`). Flip direction picks the side with more space; forced up
when `spaceBelow < 160px` (mobile soft keyboard case).

Floor used for space-below is `min(listBottom, visualViewport.bottom)`
— `visualViewport` shrinks when the iOS/Android keyboard is open so
the dropdown flips above the input instead of being hidden behind the
keyboard. Listens for `resize` / `scroll` (capture) on `window` plus
`resize` / `scroll` on `window.visualViewport` to re-measure.

`z-index: 99998` (above the inspect panel and tracklist triangle).
`.mixtape-track-list` CSS overflow rules reverted to default
(`overflow-y: auto`, `max-height: min(495px, calc(100vh - 48vh - 130px))`)
since the dropdown no longer needs the list to be unclipped — only
the frame + active-row wraps stay `overflow: visible`.

When `readOnly` flips on (mixtape inspect "confirm"), a `useEffect`
resets `addOpen`, `editingIndex`, `query`, `results`, `searching`,
and `highlighted` so the dropdown disappears immediately along with
the edit affordances.

## Pickup yaw clamp + face-down flip

### Pickup yaw clamp (TapeBody.tsx)
On drag pickup, `savedYRot.current` (the yaw the tape tweens toward
during drag) was previously set to `euler.y` directly, so heavily
tilted resting tapes kept their slanted yaw the whole drag. Now
clamped to `angleRad ± 20°` (where `angleRad` is the original tape
angle). Tapes within ±20° keep their exact yaw; tapes beyond are
straightened toward angleRad. Recorder-sourced pickups still target
`angleRad` exactly (existing behaviour).

Diff normalised into [-π, π] before clamping so wrap-around doesn't
flip the result.

### Face-down inspect flip
`inspectPin.current.yaw` is captured at inspect entry from
`Euler.setFromQuaternion(q, "YXZ").y`. If the tape was resting
upside-down (label facing the table), the YXZ-extracted yaw
flattened to `Euler(0, yaw, 0)` would leave the label facing down.

Detect by rotating local `+Y` into world space via the body
quaternion and checking `up.y`. If negative, add `π` to yaw so the
flattened tape ends up label-side up toward the camera.

## Title-style loading screen

The initial loading overlay's `<div class="tape-spinner" />` was
replaced with a chunky pixel `// jeem-fm` title in the 04b03 font,
matching `.start-title`'s look:

```
<div class="tape-title-loader">
  <div class="tape-title-loader-text">
    <span class="tape-title-loader-word">jeem-fm</span>
    <span class="tape-title-loader-caret">_</span>
  </div>
</div>
```

`.tape-title-loader-text` reuses the existing `textShadow` keyframe
animation for the chromatic RGB glitch. `.tape-title-loader-word`
adds a `tape-loader-flicker` opacity/translateX jitter
(`steps(12, end)` over 2.4s). `.tape-title-loader-caret` blinks at
0.85s `steps(2, end)`. Spinner CSS classes are kept for any other
uses.
