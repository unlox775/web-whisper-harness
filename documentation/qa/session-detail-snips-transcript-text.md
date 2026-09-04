# QA: Debug snips list transcript preview

**Date:** 2026-09-04  
**Branch:** `cursor/snips-list-transcript-text-02c6`  
**Viewport:** iPhone 12 Pro DevTools (390×844 CSS px)

## What was verified

1. **`?screenshot=session-snips`**
   - Opens Session Detail on Debug → Snips.
   - Each transcribed row shows `#N`, duration, time range, **Transcribed** chip, download.
   - Compact muted preview text wraps under the meta line (grocery-list fixture copy).
   - No horizontal overflow at 390px.
   - RETRY is absent on transcribed rows (expected).

2. **Transcript tab still copy-first**
   - Switching to Transcript keeps the concatenated textarea + Copy button.
   - Returning to Debug keeps the per-snip previews.

3. **`?screenshot=session-detail` (IndexedDB fixture)**
   - Debug → Snips shows three store-backed transcripts with the same wrapping preview.

4. **Untouched surfaces**
   - Play / seek / volume remain visible.
   - Wake lock, histogram playhead, capture-engine, playback-engine, and session-store were not changed.

## Proof shots

- `documentation/qa/session-detail-snips-transcript-text.png` — iPhone 12 Pro DevTools, Debug snips rows with wrapping text
- `documentation/qa/session-detail-snips-transcript-text-store.png` — same preview from the session-detail store fixture
- `documentation/qa/session-detail-transcript-tab-regression.png` — Transcript tab still copy-first
