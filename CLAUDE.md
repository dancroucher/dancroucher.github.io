# jeem-fm Project

## Overview
Browser-based cassette tape simulator at https://jeem-fm.vercel.app (also https://jeem-fm.com). Users collect, arrange, and play music through a virtual tape table — drag cassettes onto a 3D physics table, YouTube plays via iframe bridge.

**Why:** Inspired by flipping through a shelf of mix tapes.

## Repo
GitHub: https://github.com/dancroucher/jeem-fm (branch: `preview`)
Local path: `~/Albemuth/Apps/jeem-fm`

## Team
- Dan (lead)
- Max (code/tech)
- Cass (content/design/playtesting)

## Tech Stack
- Frontend: React 19 + TypeScript
- 3D: Three.js + @react-three/fiber + @react-three/rapier (physics)
- Build: esbuild (separate bundles: tapes.js + mixtape.js), esm, es2020
- Backend: Vercel serverless functions
- Storage: IndexedDB via `idb` package (replaced Vercel KV + localStorage in commit a20799d; shared-tape concept removed)
- Hosting: Vercel (preview/prod branches, git-triggered rebuilds)
- UI font: `04b03` bitmap cassette font

## Architecture
- **Dual app structure**: Two separate React apps bundled by esbuild, loaded conditionally from index.html based on URL query params
  - `tapes.js` (from `src/tapes/index.tsx`) — main tape table
  - `mixtape.js` (from `src/mixtape/index.tsx`) — mixtape creator/playback
- **YouTube bridge**: React ↔ `window.myApp` / `window.AppState` / `window.switchBgType` via postMessage (`public/src/script.js`)
- **Coordinate system**: `coords.ts` converts 2D canvas (4000×2400) ↔ 3D world (50px = 1 unit)
- **32 predefined tape styles** (0–31) with housing, label, titleBg, midBg, stripe colors

## Key Features
- Drag-and-drop 3D cassette tapes onto physics table
- YouTube playback via embedded iframe player + vanilla JS bridge
- Lucky Pick: random tape generation from full library
- Infinite Tapes: genre/decade/year/artist seeded, paginated YouTube results
- Mixtape Creator: YouTube URL/keywords → 16-track curated mixtape → save/share (UUID links)

## Project Structure
- `src/tapes/` — main tape table (React + Three.js); core components: `TapesTable.tsx` (1558 lines, 2D/UI) and `TapesTable3D.tsx` (405 lines, 3D scene). Persistence in `db.ts` (IndexedDB)
- `src/mixtape/` — mixtape creator + playback
- `api/` — Vercel serverless functions (search, random, mixtape, user, etc.)
- `public/dist/` — esbuild bundles (tapes.js, mixtape.js)
- `public/src/script.js` — vanilla JS YouTube iframe API bridge

## Build & Deploy
- `npm install` then `npm start` (Express dev server, no hot-reload) or `npm run build`
- Build: `node build-lists.js` (indexes MP4s → file-index.json) + `node build-tapes.js` (esbuild)
- Preview: `vercel deploy --yes` or push to `preview` branch
- Production: `vercel deploy --prod --yes`
- New API routes: create `api/new-route.js` + add entry to `vercel.json` AND mirror the handler in `server.js` — the Express dev server doesn't auto-pick up `api/*.js`, so skipping this means the route 404s locally (or worse, only 404s on Vercel if you only add it to `server.js`, as happened with `/api/list-files`).

## Mixtape Feature
- Routes: `/?mixtape=1` (creator), `/?tape={uuid}` (playback)
- Generation algorithm: parse seed → BFS + eclectic sampling → score candidates (relevance × random_factor) → top 16 tracks
- Creator: URL/keywords → generate → preview → name → save to KV
- Playback: 3D cassette + YouTube iframe + track list sidebar + auto-advance
- `__jeem_mixtape__` magic ID identifies virtual mixtape tape
- On save: sessionStorage → `/?mixtape=1` → TapesTable loads and plays

## Known Issues (as of 2025-03-30)
- **TDZ Error** (main blocker): esbuild minification reorders `const` declarations → Temporal Dead Zone violations in closures. Current workaround: `minify: false` in build-tapes.js
  - Fixed patterns: MixtapeTrackOverlay (plain DOM instead of createPortal), loadIntoPlayer (ref pattern), setFallingIds (removed dead code), DeckTape3D import
- TypeScript errors suppressed: loadIntoPlayer used before declaration (line 615), setFallingIds not found (line 1025)
- YouTube `generate_204` errors (benign)
- `Permissions-Policy: browsing-topics` header error (benign Chrome)

## Recent changes (2026-04-17)

### Recorder hover-open interaction
Dragging a tape over the 3D recorder now opens the lid and snaps the tape's yaw to face the slot.

- **`Recorder3D.tsx`**
  - Accepts `lidOpen` prop; local state synced via `useEffect(() => setLidOpen(lidOpenProp), [lidOpenProp])` so parent can drive the lid while click-toggle still works for debug.
  - Lid tween rate: `k = 1 - Math.exp(-dt * 8)` (≈0.4s open/close — snappy).
- **`TapesTable3D.tsx`**
  - Recorder placement constants: `RECORDER_POS = [-18, 0, 8]`, `RECORDER_ROT_Y = Math.PI / 6`.
  - Hover-trigger half-extents (local axes, deliberately larger than the physical footprint so the lid pops open before the tape is right on top): `RECORDER_HALF_W = 13`, `RECORDER_HALF_D = 8`.
  - Per-frame hover test: transform `drag.target{X,Z}` into recorder's local frame via inverse Y-rotation, axis-align against half-extents.
  - When hovering, publishes `drag.targetYaw = RECORDER_ROT_Y + Math.PI` so the tape yaws 180° further — flipping which cassette edge faces the slot (an X-axis flip left the tape upside-down; yaw+π was the correct fix).
- **`coords.ts`**
  - `DragState` gained `targetYaw?: number | null` — shared mutable drag object (not React state) so yaw can change per-frame without re-renders.
- **`TapeBody.tsx`**
  - On drag start, captures current yaw into `savedYRot` and `currentYaw` refs.
  - Per-frame tween: `yawTarget = drag.targetYaw ?? savedYRot.current`, shortest-arc easing (`while diff > π: diff -= 2π; …`), rate `1 - Math.exp(-dt * 6)` (≈0.17s).
  - Euler order preserved: `new THREE.Euler(tiltX, currentYaw.current, tiltZ)` — momentum tilt on X/Z is unchanged; only yaw snaps.

### Pattern notes worth remembering
- **Mutable shared drag state object** (not React state) for per-frame values read by many tapes — avoids re-render storms during drag. Interface is duplicated inline in `TapeBody.tsx` and `TapesTable3D.tsx` to sidestep bundler/TDZ issues; keep them in sync with `coords.ts`.
- **Shortest-arc angle easing**: normalise the diff to `[-π, π]` before multiplying by the ease coefficient, otherwise rotation takes the long way around.
- **Exponential smoothing**: `k = 1 - Math.exp(-dt * rate)` is the framerate-independent form. Rate is roughly `1 / time_constant_seconds`; rate 8 ≈ 0.125s time constant ≈ 0.4s to visually settle.

## Known dev-server gotcha
The Express server (`PORT=3456 node server.js`) must be manually restarted if it dies — there's no auto-restart. Check with `lsof -ti:3456`; if empty, relaunch. Static bundle rebuilds (`node build-tapes.js`) do **not** require a restart — just hard-refresh the browser.

## How to apply
Always work from the repo directory, use the `preview` branch, and be mindful of the TDZ/minification issue when adding closures or const declarations.
