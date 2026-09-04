# Phase 07: Isolation Demo — upload session archive as transcribe source

**Package**: packages/lib/transcription-client  
**Spec**: packages/lib/transcription-client/docs/specs/20260904180005-feedback-isolation-demo-upload-session-archive-as-transcribe-source.md  
**Status**: unresolved  
**Depends on**: session-store `parseSessionArchive` (spec `20260904180001`)  
**Runner**: Cursor Cloud Agent (not Codex)

## Model / runner notes (read first)

- Implement this spec with a **Cursor Cloud Agent**. Do **not** call Codex (`codex exec` or any Codex CLI).
- This job is **transcription-client Isolation Demo only**. Import `parseSessionArchive`; do not reimplement the format; do not edit session-store.
- Not a PWA UI change. Do **not** change the Groq client (`src/transcribeAudio.js`) except trivial demo glue.
- Do **not** run `make build` unless PWA publish output actually changed (it should not).
- Do **not** mark the spec resolved until upload → transcribe input works, then add a Resolution section.

## Task Summary

Add a zip file input. Use parsed chunk audio as the demo’s transcribe input. Match today’s model: **one concatenated blob** (`audioBlobForTranscribe` concatenates live chunks).

## What to Change

### Isolation Demo (`isolation-demo/index.html`, `isolation-demo/demo.js`)

- **Upload session archive** alongside live mic / fixture blob
- `parseSessionArchive` → concat non-null blobs → existing `transcribeAudio` (fixture or live Groq)
- Chip/status for archive source
- Errors: bad zip, wrong `formatVersion`, no audio
- Do not write transcripts to IndexedDB / `web-whisper-db`

## What NOT to Change

- Do NOT change Groq endpoint, model, retries, or key validation
- Do NOT reimplement zip/manifest
- Do NOT edit session-store, PWA, playback-engine, or volume-analyzer
- Do NOT commit `node_modules`, `dist`, or lockfile surprises

## Stop Conditions

Mark spec resolved when:

1. Archive upload supplies transcribe audio (concatenated, matching the demo)
2. Live mic and fixture still work
3. Bad archive / no audio are clear
4. Spec has a Resolution section

## Implementation Prompt

```
Implement transcription-client Isolation Demo archive upload per
packages/lib/transcription-client/docs/specs/20260904180005-feedback-isolation-demo-upload-session-archive-as-transcribe-source.md

Use a Cursor Cloud Agent. Do NOT call Codex.

Prerequisites:
- Spec 20260904180001 parseSessionArchive should be available.

Requirements:
1. File input: upload session archive zip alongside live/fixture.
2. parseSessionArchive only — do not reimplement the format.
3. Concatenate non-null chunk blobs (same as live) and pass to transcribeAudio. Do not persist to the PWA DB.
4. Clear errors for bad zip, wrong formatVersion, no audio.
5. Do not change the Groq client.
6. Update the spec with a Resolution section.

Do NOT:
- Edit session-store or the PWA
- Change playback-engine or volume-analyzer
- Commit node_modules, dist, or lockfiles

Stop when the spec is resolved with Resolution and a working Isolation Demo upload.
```
