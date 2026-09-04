# Phase 07: Debug Export Session download

**Package**: apps/web-whisper-pwa  
**Spec**: apps/web-whisper-pwa/docs/specs/20260904180002-feedback-debug-export-session-download.md  
**Status**: unresolved  
**Depends on**: session-store archive APIs (spec `20260904180001`) merged or otherwise available  
**Runner**: Cursor Cloud Agent (not Codex)

## Model / runner notes (read first)

- Implement this spec with a **Cursor Cloud Agent**. Do **not** call Codex (`codex exec` or any Codex CLI).
- This job is **PWA only**. Call `exportSessionArchive` from session-store. Do not reimplement zip/manifest.
- **PWA UI change:** before marking resolved, capture **iPhone DevTools** screenshot proof (~390px) of the **Export Session** control on Session Detail Debug.
- Run **`make build`** from the repo root before push so `docs/` GitHub Pages PWA artifacts refresh. Leave harness files in `docs/` in place; only refresh PWA publish artifacts.
- Do **not** mark the spec resolved until screenshot + `make build` + Resolution section exist.

## Task Summary

Session Detail has per-chunk / per-snip MP3 download and Developer Console table JSON (no audio). Add **Export Session** on the Debug tab that downloads the session-store zip.

## What to Change

### SessionDetailScreen Debug tab (`src/screens/SessionDetailScreen.tsx`)

- Visible **Export Session** button on the Debug tab (not Developer Console only)
- `sessionStore.exportSessionArchive(sessionId)` → object URL download `web-whisper-session-<id>-<timestamp>.zip`
- Empty / all-purged: still allow metadata-only export (or document a disabled choice); helper text that there is no audio
- Toast store errors; revoke object URLs

Optional includes stay default off.

## What NOT to Change

- Do NOT reimplement the archive format in the PWA
- Do NOT edit Isolation Demos
- Do NOT change retention / `enforceCap`
- Do NOT remove Developer Console table JSON export
- Do NOT commit `node_modules`, `dist`, or lockfile surprises

## Stop Conditions

Mark spec resolved when:

1. Debug tab Export Session downloads the archive
2. Empty / purged behavior matches the spec
3. iPhone DevTools screenshot of the control
4. `make build` completed
5. Spec has a Resolution section

## Implementation Prompt

```
Implement PWA Debug Export Session per
apps/web-whisper-pwa/docs/specs/20260904180002-feedback-debug-export-session-download.md

Use a Cursor Cloud Agent. Do NOT call Codex.

Prerequisites:
- Spec 20260904180001 (session-store exportSessionArchive) should be available.

Requirements:
1. Session Detail Debug tab: Export Session downloads the session-store zip.
2. Do not hide the control in Developer Console only.
3. Metadata-only export when no chunks / all purged (document helper text).
4. iPhone DevTools screenshot of the control before marking resolved.
5. Run make build from repo root before push (refresh docs/ PWA artifacts only).
6. Update the spec with a Resolution section.

Do NOT:
- Reimplement zip/manifest in the PWA
- Touch isolation demos or retention
- Call Codex
- Commit node_modules, dist, or lockfiles

Stop when the spec is resolved with Resolution, iPhone screenshot, and make build.
```
