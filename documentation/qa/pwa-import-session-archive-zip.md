# QA: PWA import session archive zip

**Date:** 2026-09-07  
**Branch:** `cursor/pwa-import-session-zip-4f74`  
**Viewport:** iPhone 12 Pro DevTools (390×844 CSS px)

## What was verified

1. **Home** shows a **LIBRARY** card with **Import session zip** (file picker, `.zip`).
2. **Settings → App → Session archive** shows the same control.
3. Importing `documentation/qa/web-whisper-blt-debug-import.zip` (debug: chunks + snips + transcripts + volume profile) creates a **new-id** session in `web-whisper-db`, navigates to Session Detail, and shows 3 chunks plus 2 BLT snips / transcripts.
4. Slim zip (`web-whisper-blt-slim-import.zip`) still imports and is listed as a playable session; snips / transcripts / profile stay absent until re-analyzed.
5. A non-zip / wrong-kind file shows Isolation Demo-style copy (`Import failed: … Choose a web-whisper session zip.`).
6. Existing session ids are never overwritten (store default: new IDs).

## Slim vs debug

| Zip | Restored |
| --- | --- |
| Slim | Session + chunk audio only |
| Debug | Session + chunks + snips + transcripts + volume profile |

## Proof shots

- `documentation/qa/pwa-import-session-zip-home.png` — Home LIBRARY **Import session zip**
- `documentation/qa/pwa-import-session-zip-settings.png` — Settings import control
- `documentation/qa/pwa-import-session-zip-detail.png` — Session Detail after debug zip import (chunks + snips)
