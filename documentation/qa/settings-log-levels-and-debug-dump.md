# QA: Settings log levels and debug dump logs

**Date:** 2026-10-06  
**Branch:** `cursor/pwa-settings-log-levels-debug-dump-8614`  
**Viewport:** iPhone 12 Pro DevTools (390×844 CSS px) plus desktop confirmation  
**Served:** Vite `http://localhost:5173/`

## What was verified

1. **Settings → Advanced** (`?screenshot=settings-log-levels`)
   - Disclosure shows the six frozen package ids with `debug` / `info` / `warn` / `error` / `off`.
   - Defaults are `info`.
   - Approximate sizes from `getLogByteSizes()` (`621 B logs` after screenshot seed + persist test writes; per-package rows for packages with bytes).
   - Changing `capture-engine` → `debug` and `web-whisper-pwa` → `off`, Close, then Settings again keeps those values (`package_log_levels` localStorage).
2. **Debug tab Export Session** (`?screenshot=session-debug-export`)
   - Existing “Include snips + transcripts (debug)” checkbox; no second zip.
   - Checked → helper + hint mention `logs.json` (store `includeDebugArtifacts` turns on `includeLogs`).
   - Unchecked → “Slim zip: audio chunks + manifest only. No logs.”
3. **Default Settings is not cluttered**
   - Groq / Transcription stays the primary surface. Advanced is collapsed until opened.

## Untouched

session-store log schema, capture persist queue, slim-export default (still no logs), archive `formatVersion`.

## Proof shots

- `documentation/qa/settings-log-levels-iphone.png` — Advanced levels + size line
- `documentation/qa/session-debug-export-iphone.png` — Debug export checkbox + logs.json helper
