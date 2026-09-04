# Phase 07: Isolation Demo — upload session archive as analyze source

**Package**: packages/lib/volume-analyzer  
**Spec**: packages/lib/volume-analyzer/docs/specs/20260904180004-feedback-isolation-demo-upload-session-archive-as-analyze-source.md  
**Status**: unresolved  
**Depends on**: session-store `parseSessionArchive` (spec `20260904180001`)  
**Runner**: Cursor Cloud Agent (not Codex)

## Model / runner notes (read first)

- Implement this spec with a **Cursor Cloud Agent**. Do **not** call Codex (`codex exec` or any Codex CLI).
- This job is **volume-analyzer Isolation Demo only**. Import `parseSessionArchive`; do not reimplement the format; do not edit session-store.
- Not a PWA UI change. Do **not** change the snip algorithm.
- Do **not** run `make build` unless PWA publish output actually changed (it should not).
- Do **not** mark the spec resolved until upload → existing analyze/snip path works, then add a Resolution section.

## Task Summary

Add a zip file input. Parsed chunks become the same `ChunkWithBlob[]` live/fixture already feed into `analyzeChunksVolume` / `proposeSnipsFromProfile`.

## What to Change

### Isolation Demo (`isolation-demo/src/App.tsx` and related)

- **Upload session archive** alongside live mic / fixture pattern
- Map non-null blobs to `ChunkWithBlob`; set `chunks`; Compute Volume uses the existing pipeline
- Chip/status for archive mode
- Errors: bad zip, wrong `formatVersion`, no audio
- Do not open `web-whisper-db` (tuner IDB may stay `web-whisper-volume-analyzer-demo-db`)

## What NOT to Change

- Do NOT change snip / noise-floor algorithm (`src/snips.ts` defaults)
- Do NOT reimplement zip/manifest
- Do NOT edit session-store, PWA, playback-engine, or transcription-client
- Do NOT commit `node_modules`, `dist`, or lockfile surprises

## Stop Conditions

Mark spec resolved when:

1. Archive upload feeds the existing analyze/snip pipeline
2. Live and fixture still work
3. Bad archive / no audio are clear
4. Spec has a Resolution section

## Implementation Prompt

```
Implement volume-analyzer Isolation Demo archive upload per
packages/lib/volume-analyzer/docs/specs/20260904180004-feedback-isolation-demo-upload-session-archive-as-analyze-source.md

Use a Cursor Cloud Agent. Do NOT call Codex.

Prerequisites:
- Spec 20260904180001 parseSessionArchive should be available.

Requirements:
1. File input: upload session archive zip alongside live/fixture.
2. parseSessionArchive only — do not reimplement the format.
3. Feed non-null chunk blobs into the existing analyzeChunksVolume / proposeSnipsFromProfile path.
4. Clear errors for bad zip, wrong formatVersion, no audio.
5. Do not change the snip algorithm.
6. Update the spec with a Resolution section.

Do NOT:
- Edit session-store or the PWA
- Change playback-engine or transcription-client
- Commit node_modules, dist, or lockfiles

Stop when the spec is resolved with Resolution and a working Isolation Demo upload.
```
