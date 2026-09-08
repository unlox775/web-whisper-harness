Spec Status: resolved
Spec Type: feedback
Created: 2026-09-08T18:23:00Z
Resolved: 2026-09-08T18:23:00Z
Product: packages/lib/transcription-client

# Feedback: Isolation Demo — abutting snips repeat trailing phrases on Live Groq

## User Feedback

Dave reproduced boundary transcript repeats in the **Transcription Client Isolation Demo** (Live Groq API + Upload session archive, stepping by snips).

Screenshot: snip [1/106] ends with “What the hell am I supposed to do?” and snip [2/106] starts with the same phrase. Snip times abut (`0.0–16.2s` then `16.2–26.6s`) with **no reported time overlap**. Dave said that phrase **only once**.

Live demo UI: “Stepping by snips (106). Prefer snips when snips.json is present.” The demo *labels* units as snips.

PR #53 already fixed the **PWA** path: `assembleSnipTranscriptionBlob` time-trims audio to `[startTime, endTime]` (WAV) instead of concatenating full overlapping ~4s MP3 chunks. Mid-chunk cuts meant adjacent snips both included the whole boundary chunk → Whisper heard the same ~4s twice.

PR #52 taught the Isolation Demo to step snips via `archiveSource.js` (`blobsForSnip` + `concatArchiveAudio`). That path still fed **full chunk blobs**.

## Investigation

Dave’s guess (“not using the actual SNIPS”) was half right. The demo used snip **metadata** (ids / times / `chunkIds`) as the step unit, but the Groq payload was still `new Blob(overlappingChunkMp3s)`.

| Path | What was sent |
| --- | --- |
| PWA Transcribe / retry (PR #53) | `assembleSnipTranscriptionBlob` → time-trimmed WAV (or exclusive-chunk MP3 if decode fails) |
| Isolation Demo archive step (PR #52, before this spec) | `blobsForSnip` + `concatArchiveAudio` → **every overlapping `chunkIds` MP3, untrimmed** |

volume-analyzer stores `chunkIds` as every chunk that **overlaps** the snip range. Capture chunks are ~4s. Adjacent snips that cut mid-chunk share that entire file:

| Snip | Time range | Shared chunk | Old demo Groq audio |
| --- | --- | --- | --- |
| A | 0–16.2s | last ~4s chunk that contains 16.2s | full overlapping chunk set |
| B | 16.2–26.6s | same chunk | full overlapping chunk set |

Reported timestamps abut; the **audio blobs** still overlapped by up to one chunk (~4s). That matches a full-phrase repeat at the boundary, not ASR bleed of a single word.

This is the same root cause as `apps/web-whisper-pwa/docs/specs/20260908143900-feedback-phase-07-transcribe-assembled-snip-blobs.md`. Isolation Demo was explicitly out of scope there.

## Requested outcome

- Archive snip transcription uses the **same time-trimmed assembly semantics as the PWA**.
- Shared helper preferred over copy-paste. Decode-fail fallback matches PWA (exclusive-chunk MP3; a boundary chunk is owned by one snip).
- Regression tests: adjacent snip blobs do not both contain the full overlapping boundary chunk.
- Rebuild `docs/isolation-demos/transcription-client/` via `make build`.
- Draft PR; do not mark ready; do not merge.

## Out of scope

- Live Groq confirmation against Dave’s zip (requires his archive + key)
- Changing `proposeSnipsFromProfile` cut math
- playback-engine `playSnip`
- PWA UI

## Resolution Criteria

- [x] Root cause documented (snip labels + overlapping chunk concat, not a second Groq client)
- [x] Isolation Demo archive snips call the shared assembler
- [x] Decode-fail fallback matches PWA exclusive-chunk concat
- [x] Tests prove adjacent blobs do not both include the shared ~4s chunk
- [x] Spec + `make build`

## Resolution

**Resolved:** 2026-09-08T18:23:00Z  
**Phase:** Phase 07 — Isolation Demo archive snips time-trim like the PWA  
**Runner:** Cursor Cloud Agent (grok-4.6, not Codex)

### Finding

The demo **was** stepping snips. It was **not** sending snip-trimmed audio. `buildArchiveTranscribeUnits` concatenated every overlapping chunk MP3 and `demo.js` POSTed that blob to Groq. Abutting snips that share a mid-cut ~4s chunk therefore repeated the trailing phrase.

### What shipped

- `packages/lib/transcription-client/src/assembleSnipAudio.js` — shared helper (moved out of the PWA-only TypeScript file). Decode → slice `[startTime, endTime]` → WAV; decode-fail → exclusive-chunk MP3.
- PWA `assembleSnipAudio.ts` re-exports that helper so Transcribe / retry cannot drift.
- Isolation Demo `archiveSource.js` `assembleArchiveUnitBlob` + `demo.js` send the assembled blob (not `concatArchiveAudio` of full `chunkIds`).
- Transcript headers note `time-trimmed wav` or `exclusive-chunk mp3`.

### Proof

- `isolation-demo/archiveSource.test.js`
  - Whole-chunk concat **would** put marker `C2` (8–12s) in both abutting snips
  - Decode-fail fallback drops `C2` from snip A; snip B keeps it
  - Planned slices are `[0–10)` and `[10–20)` (10s each, not 12s); `transcriptionWindowsOverlap` is false
  - Injected decode writes ~10s WAV for each snip
- PWA `assembleSnipAudio.test.ts` still covers the same helper via re-export
- Live Groq was **not** run in this agent (no Dave zip / no committed key). Final confirmation still needs his archive + Groq key on the published demo.
