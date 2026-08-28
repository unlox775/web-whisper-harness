# QA: Isolation Demos on GitHub Pages

**Date:** 2026-08-28  
**Branch:** `cursor/isolation-demos-on-pages-7e5a`  
**Viewport:** iPhone 12/13/14 (390×844 CSS px → 1170×2532 screenshots)

## What was verified

1. **Developer-mode gate**
   - Isolation Demos control is hidden when developer mode is off.
   - Ladybug is hidden when developer mode is off.
   - Enabling developer mode shows Isolation Demos in Settings and the ladybug in the home header.

2. **Settings entry**
   - Settings → App → Enable developer mode → **Isolation Demos** button.
   - Button opens `isolation-demos/` (sibling of the published PWA) in a new tab.

3. **Ladybug entry**
   - Ladybug Developer Console also exposes Isolation Demos.

4. **Pages index**
   - Lists Capture Engine, Playback Engine, Volume Analyzer, Transcription Client, Session Store.
   - Each card shows Storage + Namespace.

5. **Storage isolation**
   - Capture Engine chip: `IN-MEMORY (not persisted)`.
   - Session Store chip: `SANDBOX DB (web-whisper-isolation-demo-session-store)` (not `web-whisper-db`).
   - Other demos load without writing PWA storage keys.

6. **Publish path**
   - `make build` → `docs/isolation-demos/index.html` + per-package pages.
   - Served locally from `docs/` at `http://127.0.0.1:8080/` for this QA pass.

## Proof shots (1170×2532)

- `documentation/qa/isolation-demos-settings-entry.png` — Settings with developer mode on and Isolation Demos button
- `documentation/qa/isolation-demos-index.png` — Isolation Demos index on Pages

## Out of scope confirmed untouched

- Session-detail copy UX
- Recording overlay Stop layout
- Snip algorithm defaults
