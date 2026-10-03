# frontend/

Scaffolding only. There is no frontend application here.

This folder holds the reserved feature boundaries for a future frontend. No
framework is installed, no build tooling is configured, and none of the features
are implemented.

## The working UI

The UI that actually runs is in `/public`, served by `server.js` with no build
step and no dependencies:

| Page | File | Status |
|---|---|---|
| Roster | `public/index.html` + `app.js` | Working |
| Studio | `public/studio.html` + `studio.js` | Working — real browser recording via `getUserMedia` |
| Da'Riyah | `public/video.html` + `video.js` | Working — scene planning; frame generation unavailable |

## If you want this folder populated

Pick a stack and say so. The structure below assumes React + TypeScript, which
the `App.tsx` reference implies, but that is an assumption and has not been
built.
