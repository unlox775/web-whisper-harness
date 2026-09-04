# Phase 07: Snips list shows transcript text per snip

**Package**: apps/web-whisper-pwa  
**Spec**: apps/web-whisper-pwa/docs/specs/20260904120004-feedback-snips-list-transcript-text.md  
**Status**: unresolved  
**Runner**: Cursor Cloud Agent (not Codex)

## Model / runner notes (read first)

- Implement this spec with a **Cursor Cloud Agent**. Do **not** call Codex (`codex exec` or any Codex CLI).
- This job is **PWA only**. Use existing `transcripts` state. Do not add session-store fields.
- **PWA UI change:** before marking resolved, capture **iPhone DevTools** screenshot proof (~390px) of a snip row with compact transcript text.
- Run **`make build`** from the repo root before push so `docs/` GitHub Pages PWA artifacts refresh.
- Do **not** mark the spec resolved until screenshot + `make build` + Resolution section exist.

## Task Summary

Debug snips tab shows duration + Transcribed chip but not the words. Render a compact, wrapping preview of `transcript.text` on each snip that has one.

## What to Change

### SessionDetailScreen snips list (`src/screens/SessionDetailScreen.tsx`)

For each snip row you already resolve `transcript` / `failure`:

- If `transcript.text` is present: show a compact preview under the meta line (truncate ~160–240 chars or ~3–4 CSS lines; wrap; iPhone-safe)
- If `failure`: keep the existing error line; no fake text
- If pending: nothing or a quiet “Pending…” placeholder (pick one)
- Keep Transcribed chip, RETRY, download

Do not redesign the copy-first transcript panel. This is list preview only.

## What NOT to Change

- Do NOT implement wake lock, volume, or histogram playhead
- Do NOT change capture-engine, playback-engine, or session-store
- Do NOT commit `node_modules`, `dist`, or lockfile surprises

## Stop Conditions

Mark spec resolved when:

1. Snips with text show a compact wrapping preview
2. Failed / pending rows behave per spec
3. iPhone DevTools screenshot of a text row
4. `make build` completed
5. Spec has a Resolution section

## Implementation Prompt

```
Implement snips-list transcript previews per
apps/web-whisper-pwa/docs/specs/20260904120004-feedback-snips-list-transcript-text.md

Use a Cursor Cloud Agent. Do NOT call Codex.

Requirements:
1. For each snip with a transcript, show compact wrapping text from existing transcripts state.
2. Failed snips still show error. Pending: nothing or “Pending…”.
3. Do not add session-store fields or new producer APIs.
4. iPhone DevTools screenshot of a snip row with text before marking resolved.
5. Run make build from repo root before push.
6. Update the spec with a Resolution section.

Do NOT:
- Touch wake lock, volume, or histogram playhead
- Modify capture-engine, playback-engine, or session-store
- Commit node_modules, dist, or lockfiles

Stop when the spec is resolved with Resolution, iPhone screenshot, and make build.
```
