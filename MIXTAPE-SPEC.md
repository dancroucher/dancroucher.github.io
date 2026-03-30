# Mixtape — Implementation Spec

## Overview

Add a "Mixtape" feature to jeem-fm. Users enter a YouTube URL or keywords, get a 16-track tape generated via a vibe graph, can name it, save it, and share it via link.

---

## Routes

- `/` — existing site (unchanged)
- `/?mixtape=1` — open mixtape creator screen
- `/?tape={id}` — load a saved mixtape for playback (no creator UI)

---

## Mixtape Creator (`/?mixtape=1`)

### Input
- **YouTube URL** field — validates format, extracts video ID
- **Keywords** field — free text, used as fallback / augmentor if URL provided
- **Generate** button — triggers generation

### Generation Flow
1. Parse seed (URL → video ID, keywords → search query)
2. Fetch seed video metadata (title, uploader)
3. Build a graph of 16 tracks using BFS + eclectic sampling:
   - Start with seed
   - Query IMVDB + YouTube search for related content
   - Score candidates: relevance × random_factor (boosts less obvious matches)
   - Take top N, recurse 1-2 hops deeper for variety
   - Target: ~40% obvious matches, ~60% eclectic choices
4. Return ordered list of 16 `{ videoId, title, author, duration }` objects

### Track Graph Algorithm
```
seed → candidates (IMVDB + YouTube search)
score each: relevance * (1 + random * eclectic_factor)
sort by score descending
take top 4, add to tape
for remaining slots: pick from lower-ranked with probability proportional to score
```

### Output
- Name field (pre-filled: "{SeedTitle} Mixtape")
- Description field (optional)
- 16-track list preview (title, author, duration)
- "Save & Get Link" button

### Save
- Generate UUID v4
- Store in Vercel KV: `mixtape:{uuid}` → `{ name, description, tracks[], createdAt }`
- Return shareable URL: `https://jeem-fm.vercel.app/?tape={uuid}`

---

## Mixtape Playback (`/?tape={id}`)

### Load
- Fetch `mixtape:{id}` from Vercel KV
- If not found: show "Tape not found" message
- If found: render playback view

### Playback View
- Single 3D cassette in the center (reuse `Tape3D.tsx` + label texture)
- Tape label: mixtape name + "16 tracks"
- Track list sidebar: scrollable, shows current track highlighted
- YouTube iframe player below
- Auto-advance through tracks
- Previous/Next controls
- No creator UI visible

### 3D Tape Label
- Render tracklist to canvas → texture for tape label
- Show mixtape name prominently
- On hover: tracks appear as tooltip/scroll

---

## API Endpoints

### `POST /api/mixtape/generate`
Request: `{ url?: string, keywords?: string }`
Response: `{ tracks: [{ videoId, title, author, duration, durationText }], seedTitle }`

### `POST /api/mixtape/save`
Request: `{ name, description, tracks[] }`
Response: `{ id: uuid }`

### `GET /api/mixtape/{id}`
Response: `{ id, name, description, tracks[], createdAt }` or `404`

---

## KV Schema

```
Key:   mixtape:{uuid}
Value: {
  name: string,
  description: string,
  tracks: [{ videoId, title, author, duration, durationText }],
  createdAt: ISO timestamp
}
TTL: 30 days (configurable)
```

---

## UI Components

| Component | Location | Notes |
|---|---|---|
| MixtapeCreator | new `src/mixtape/Creator.tsx` | Input form + track preview |
| MixtapePlayback | new `src/mixtape/Playback.tsx` | Tape view + player |
| MixtapeTape | new `src/mixtape/Tape.tsx` | Single 3D tape, label texture |
| TrackList | new `src/mixtape/TrackList.tsx` | Scrollable sidebar |
| generate.ts | new `api/mixtape/generate.js` | Graph generation logic |
| mixtape.ts | new `api/mixtape/save.js` | KV save |
| `GET /api/mixtape/[id]` | new `api/mixtape/[id].js` | KV load |

---

## Build Notes

- Tapes 3D components already in `src/tapes/` — reuse, don't duplicate
- esbuild compiles `src/tapes/` → `public/dist/tapes.js`
- New mixtape components compile to `public/dist/mixtape.js`
- YouTube Iframe API already in `public/src/youtube_iframe_api.js`
- Vercel KV (`@vercel/kv`) for storage — server-side only, never exposed to client
- No auth in v1 — anyone with the link can view

---

## TODO

- [ ] Write `api/mixtape/generate.js` — graph + eclectic sampling
- [ ] Write `api/mixtape/save.js` — KV write
- [ ] Write `api/mixtape/[id].js` — KV read
- [ ] Build `src/mixtape/Creator.tsx`
- [ ] Build `src/mixtape/Playback.tsx`
- [ ] Build `src/mixtape/Tape.tsx` (3D label texture from tracklist)
- [ ] Build `src/mixtape/TrackList.tsx`
- [ ] Add mixtape routes to `vercel.json`
- [ ] Update `index.html` with mixtape screen logic
- [ ] Test full flow: create → save → share → playback
