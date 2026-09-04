# Phase 07: Isolation Demo — upload session archive as play source

**Package**: packages/lib/playback-engine  
**Spec**: packages/lib/playback-engine/docs/specs/20260904180003-feedback-isolation-demo-upload-session-archive-as-play-source.md  
**Status**: unresolved  
**Depends on**: session-store `parseSessionArchive` (spec `20260904180001`)  
**Runner**: Cursor Cloud Agent (not Codex)

## Model / runner notes (read first)

- Implement this spec with a **Cursor Cloud Agent**. Do **not** call Codex (`codex exec` or any Codex CLI).
- This job is **playback-engine Isolation Demo only**. Import `parseSessionArchive`; do not reimplement the format; do not edit session-store.
- Not a PWA UI change. Isolation Demo proof is enough; iPhone screenshots are not required.
- Do **not** run `make build` unless PWA publish output actually changed (it should not).
- Do **not** mark the spec resolved until upload → play + bad-archive errors work, then add a Resolution section.

## Task Summary

Add a file input so Dave can upload a session zip and play parsed chunk blobs (`playBlobs` / session concat) next to fixture and live capture.

## What to Change

### Isolation Demo (`isolation-demo/index.html`, `isolation-demo/src/main.ts`)

- Third source: **Upload session archive** (zip file input)
- `parseSessionArchive` → RAM chunks; play non-null blobs in seq order
- Chip: archive vs fixture vs live
- Errors: bad zip, wrong `formatVersion` / kind, no audio
- Never open `web-whisper-db`

## What NOT to Change

- Do NOT reimplement zip/manifest
- Do NOT edit session-store, PWA, volume-analyzer, or transcription-client
- Do NOT change GainNode / `setVolume` unless a tiny glue bug blocks play
- Do NOT commit `node_modules`, `dist`, or lockfile surprises

## Stop Conditions

Mark spec resolved when:

1. Archive upload plays non-purged chunks
2. Fixture and live still work
3. Bad zip / version / no audio are clear
4. Spec has a Resolution section

## Implementation Prompt

```
Implement playback-engine Isolation Demo archive upload per
packages/lib/playback-engine/docs/specs/20260904180003-feedback-isolation-demo-upload-session-archive-as-play-source.md

Use a Cursor Cloud Agent. Do NOT call Codex.

Prerequisites:
- Spec 20260904180001 parseSessionArchive should be available.

Requirements:
1. File input: upload session archive zip alongside fixture/live.
2. parseSessionArchive only — do not reimplement the format.
3. Play non-null chunk blobs (playBlobs / concat). Do not write web-whisper-db.
4. Clear errors for bad zip, wrong formatVersion, no audio.
5. Update the spec with a Resolution section.

Do NOT:
- Edit session-store or the PWA
- Change volume-analyzer or transcription-client
- Commit node_modules, dist, or lockfiles

Stop when the spec is resolved with Resolution and a working Isolation Demo upload.
```
