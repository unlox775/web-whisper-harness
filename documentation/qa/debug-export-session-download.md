# QA: Debug Export Session download

**Date:** 2026-09-04  
**Branch:** `cursor/debug-export-session-download-3394`  
**Viewport:** iPhone 12 Pro DevTools (390×844 CSS px)

## What was verified

1. **`?screenshot=session-detail` → Debug**
   - Session Detail Debug shows a full-width **Export Session** control under the CHUNKS/SNIPS kicker and above the Chunks·Snips pills.
   - Control is enabled when the session has playable chunk audio.
   - Click downloads `web-whisper-session-<id>-<timestamp>.zip` (object URL + `<a download>`).
   - Inspected zip: `manifest.json` (`kind: web-whisper-session-archive`, `formatVersion` 1) plus `chunks/000.mp3` (18.4 KB). Optional snips/transcripts/volume-profile were not included (defaults off).

2. **`?screenshot=session-snips` (empty chunk list)**
   - **Export Session** stays enabled.
   - Quiet helper: `No audio chunks — export is metadata only.`
   - Fixture session id is not in IndexedDB, so the store returns `session_not_found` and Session Detail toasts `Session not found. It may have been deleted.` (no crash). Product empty takes that exist in the store still export metadata-only.

3. **Regressions**
   - Transcript tab still copy-first.
   - ← Sessions returns to Home; reopening the session keeps Export Session on Debug.
   - Per-chunk / per-snip ↓ downloads, playback, histogram, and Developer Console table JSON were not changed.

## Empty / purged policy (documented)

| State | Control | Helper |
| --- | --- | --- |
| Playable chunk audio | Enabled | none |
| All chunks purged (`audioPurgedAt` / `sizeBytes === 0`) | Enabled (metadata-only) | `Archive has metadata, no audio bytes.` |
| No chunks | Enabled (metadata-only) | `No audio chunks — export is metadata only.` |
| Store `{ error }` | Toast; no crash | — |

## Proof shots

- `documentation/qa/debug-export-session-download.png` — iPhone 12 Pro DevTools, Debug **Export Session**
- `documentation/qa/debug-export-session-download-zip.png` — same view plus Chrome download `web-whisper-session-ses_…-….zip`
- `documentation/qa/debug-export-session-metadata-only.png` — helper text when there are no audio chunks
