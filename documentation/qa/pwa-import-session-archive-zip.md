# QA: PWA import session archive zip

**Date:** 2026-09-07  
**Branch:** `cursor/pwa-import-session-zip-4f74`  
**Viewport:** iPhone 12 Pro DevTools (390×844 CSS px) at `http://localhost:5173/`

## What was verified

1. **Home** LIBRARY card shows **Import session zip** plus slim-vs-debug / new-id helper copy.
2. **Settings → App → Session archive** shows the same control.
3. Importing `documentation/qa/web-whisper-blt-debug-import.zip` created a **new-id** session, navigated to Session Detail, and restored:
   - 3 chunks (4.00s / 256 B each, AUDIO/MPEG)
   - 2 snips with BLT transcripts (`I'll take a BLT's.` / `BLT is cheese quesadilla`)
   - Transcript tab: “Transcribed 2 of 2 snips”
4. Returning Home shows the session in the list (READY + snippet).
5. A non-zip file shows Isolation Demo-style copy both inline and as a toast: `Import failed: not_a_zip. Choose a web-whisper session zip.`
6. Importing `documentation/qa/web-whisper-blt-slim-import.zip` adds a second session (new id, not an overwrite). Slim card has no transcript snippet; debug card stays READY with BLT text.

## Slim vs debug

| Zip | Restored |
| --- | --- |
| Slim | Session + chunk audio only. Snips / transcripts / profile absent until re-analyzed. |
| Debug | Session + chunks + snips + transcripts + volume profile |

## Proof shots

- `documentation/qa/pwa-import-session-zip-home.png` — Home LIBRARY **Import session zip**
- `documentation/qa/pwa-import-session-zip-settings.png` — Settings import control
- `documentation/qa/pwa-import-session-zip-detail.png` — Session Detail after debug zip (BLT transcript)
- `documentation/qa/pwa-import-session-zip-chunks.png` — Debug CHUNKS (3)
- `documentation/qa/pwa-import-session-zip-snips.png` — Debug SNIPS (2) with BLT text
- `documentation/qa/pwa-import-session-zip-home-list.png` — imported session in the list
- `documentation/qa/pwa-import-session-zip-error.png` — unreadable-file error copy
- `documentation/qa/pwa-import-session-zip-slim-vs-debug.png` — slim + debug as two new-id sessions
