# Phase 07: Session archive — optional include snips + transcript for debug

**Package**: packages/datastore/session-store (primary)  
**Consumers (allowed)**: apps/web-whisper-pwa Debug Export; packages/lib/volume-analyzer Isolation Demo overlay  
**Spec**: packages/datastore/session-store/docs/specs/20260906204601-feedback-session-archive-include-snips-transcript-debug.md  
**Status**: resolved  
**Roster**: docs/PHASE-07-05.md (Spec B — after A; before C)  
**Depends on**: Phase 07-03 `exportSessionArchive` / `parseSessionArchive` (already on main)  
**Runner**: Cursor Cloud Agent (not Codex)

## Model / runner notes (read first)

- Implement this spec with a **Cursor Cloud Agent**. Do **not** call Codex (`codex exec` or any Codex CLI).
- Primary job is session-store export/parse + docs. You **may** edit PWA Debug Export UI and the volume-analyzer Isolation Demo so archived live snips actually appear.
- Do **not** reimplement zip/manifest. Do **not** change `proposeSnipsFromProfile`.
- Default export must stay slim. Debug include is opt-in.
- PWA UI change: iPhone DevTools screenshot (~390px) of the debug-include control.
- Run **`make build`** (PWA `docs/` artifacts + Isolation Demo publish).
- Do **not** mark the spec resolved until default-off + debug include + demo overlay work, then add a Resolution section.

## Task Summary

Dave’s PWA zip has `hasSnips: true` but no `snips.json`. Isolation Demo therefore cannot show live cuts. Keep the default archive as today; add an explicit debug option that includes snip ranges + per-snip transcript text (and volume profile if cheap). Demos that parse archives must overlay those live snips and still allow recompute.

## What to Change

### 1. session-store (`src/archive.js`, README, Isolation Demo, tests)

- Keep `includeSnips` / `includeTranscripts` / `includeVolumeProfile` default **false**
- Optional `includeDebugArtifacts: true` convenience flag (document)
- Parsed result must yield start/end/duration/ids + transcript text per snip (join `transcripts.json` or document the join)
- Unhide Isolation Demo export checkboxes
- formatVersion: **stay at 1** unless you add a required field — document the decision. Slim v1 zips must still parse
- Tests: default slim; debug include round-trip; v1 without optionals still parses

### 2. PWA Debug tab (`SessionDetailScreen` / `exportSession.ts`)

- Explicit checkbox (or equivalent): **Include snips + transcripts (debug)**
- Off → `exportSessionArchive(sessionId)` (defaults)
- On → includes snips + transcripts + volume profile
- Helper text: slim vs debug. Screenshot the control

### 3. volume-analyzer Isolation Demo

- If `parseSessionArchive` returns snips, show **Live (archived)** list + histogram overlay
- Show transcript text when present
- Compute Volume / sliders still recompute; do **not** drop the archived live set
- Zip without optionals: same as today (chunks only)

## What NOT to Change

- Do NOT turn optional includes on by default
- Do NOT change snip / noise-floor algorithm
- Do NOT implement Spec C doctor/diff (overlay live snips only)
- Do NOT edit playback-engine / transcription-client unless a one-line status is trivial
- Do NOT commit `node_modules`, `dist`, or lockfile surprises

## Stop Conditions

Mark spec resolved when:

1. Default export is still chunks + manifest only
2. Debug option includes snips + transcript text (+ volume profile)
3. volume-analyzer Isolation Demo overlays archived live snips and still recomputes
4. formatVersion decision is documented; slim v1 still parses
5. PWA screenshot + `make build`
6. Spec has a Resolution section

## Implementation Prompt

```
Implement session-archive debug include (snips + transcripts) per
packages/datastore/session-store/docs/specs/20260906204601-feedback-session-archive-include-snips-transcript-debug.md

Use a Cursor Cloud Agent. Do NOT call Codex.

Requirements:
1. Default exportSessionArchive stays slim (no snips.json / transcripts.json / volume-profile.json).
2. Explicit debug option: PWA Debug Export checkbox and/or session-store Isolation Demo checkboxes, calling existing includeSnips + includeTranscripts + includeVolumeProfile (or includeDebugArtifacts).
3. parseSessionArchive exposes live snip start/end/duration/ids and per-snip transcript text when those files are present.
4. volume-analyzer Isolation Demo overlays archived live snips when present; Compute Volume still recomputes without dropping the live set.
5. Stay on formatVersion 1 unless a required-field bump is justified; slim v1 zips must still parse.
6. Tests for default-off and debug-include round-trip.
7. iPhone DevTools screenshot of the PWA debug-include control.
8. Run make build. Update the spec with a Resolution section.

Do NOT:
- Change proposeSnipsFromProfile
- Make debug includes the default
- Implement overlap / n-gram doctor (Spec C)
- Reimplement zip/manifest in the PWA
- Commit node_modules, dist, or lockfiles

Stop when the spec is resolved with Resolution, slim default, debug include, and live-snip overlay.
```
