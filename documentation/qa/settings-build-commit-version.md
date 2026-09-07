# QA: Settings shows build commit / version

**Date:** 2026-09-07  
**Branch:** `cursor/settings-build-commit-version-d1ab`  
**Viewport:** iPhone 12 Pro DevTools (390×844 CSS px)  
**Served:** `docs/` via `python3 -m http.server 4173` after `make build`

## What was verified

1. **Home → Settings** (header button, no `?screenshot=` helper)
   - Settings **App** section footer shows muted identity lines:
     - `Version 0.1.0`
     - `Build 3dfe949`
     - `Built Today at 6:07 AM`
   - Readable at 390px; no overflow; not a marketing badge.
2. **Close → Settings again**
   - Same three lines; compile-time identity does not change.
3. **Published bundle**
   - `docs/index.html` → `pwa-assets/index-DLqeZ9Uc.js`
   - Baked `VITE_APP_VERSION=0.1.0`, `VITE_GIT_SHA=3dfe949`, `VITE_GIT_SHA_FULL=3dfe9491b4f9fc5cebd7ba79cede00cd3b9cdd77`, `VITE_BUILD_TIME=2026-09-07T06:07:46.049Z`

## Untouched

Transcription key flow, developer mode, storage cap, export defaults, snip algorithm, service worker / cache-clear UI.

## Proof shots

- `documentation/qa/settings-build-commit-version.png` — iPhone 12 Pro DevTools, Settings App footer
