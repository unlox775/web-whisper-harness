Spec Status: implemented
Spec Type: feedback
Created: 2026-08-28T21:00:00Z
Resolved: 2026-08-28T21:30:00Z
Product: apps/web-whisper-pwa

# Feedback: Live recording must use durable snip + transcription pipeline; Stop → Home

## User Feedback (Dave, 2026-08-28)

Current live overlay appears to transcribe ~chunk audio and show text, but those are **not real snips**. When recording ends, the session has **no durable transcripts** even though he just watched live text.

Intent of the original app (`unlox775/web-whisper`, `recording-slices.ts` `listSnips` + live transcription queue in `App.tsx`):

- While recording, volume/snip detection runs lightly in the background on the growing audio.
- As each **real snip** becomes ready (noise-floor / quiet-gap / 5s min / 10s target params already on main), persist the snip permanently and send it through `@web-whisper/transcription-client` / the real orchestration path.
- Persist each transcript to session-store as soon as it returns. By Stop, most/all snips are already transcribed — he must not wait for a 30–60min batch after stop.
- Live overlay should display the concatenated durable transcript text as snips complete (expect ~30s delay — keep the “first words in about 30 seconds” pending copy). Longer snips → fewer mid-sentence cuts (good).
- Do NOT invent a parallel fake live TX path that never writes snips/transcripts.
- After Stop (and after abort that keeps the session), go to **Home**, not into that session’s detail. He will tap the card to copy.

## Original design (source of truth)

`unlox775/web-whisper` `src/modules/playback/recording-slices.ts` `listSnips`:

1. Read already-stored snips. Last end is frozen.
2. Only analyze audio **after** that end (growing window).
3. While `status === 'recording'`, do **not** persist the trailing in-progress segment (hold a tail so a quiet-gap cut is confirmed).
4. `appendSnips` writes closed snips to IndexedDB.
5. A live queue transcribes those stored snips via Groq and writes transcript text onto the snip records.
6. Overlay text is `getSnipTranscriptionText` of durable snips, not a throwaway chunk overlay.
7. Pending copy: “Pending - first words arrive in about 30 seconds.”

## What was wrong in the harness

`RecordingScreen` listened to `chunkEncoded` and called `transcribeAudio` on each ~4s chunk blob. Results lived only in React state. `stopRecording` then opened session detail. `ensureSnips` / `proposeSnipsForSession` ran after stop (or not at all for transcripts), so the session had audio but no durable snip transcripts.

## Requested outcome

- Replace per-chunk live TX with a streaming snip pipeline driven by volume-analyzer `proposeSnips` on the growing session.
- Incremental: only process new audio past the last snip end.
- Write snips + transcripts to session-store during record. Overlay reads that durable state.
- On `stopRecording` / abort success path: `goHome()` (Home list), never auto-open session detail.
- Overlay must never cover Stop (already fixed).
- Keep pending copy.
- `make build`. Keep PR **draft**.
- iPhone 1170×2532 shots in `documentation/qa/` + PR body.

## Out of scope

- Session-detail copy-first restyle
- Changing snip algorithm defaults (5s / 10s / 0.6s quiet-gap / adaptive noise floor)
- `node_modules` / scriptures repo

## Implementation

### volume-analyzer

- `analyzeVolumeForSession` decodes **new chunks only** and merges into the stored volume profile.
- `proposeSnipsFromProfile` accepts `windowStartTime` (process audio after last snip end) and `includeTrailing` (default true; false drops the in-progress tail while recording).
- `proposeSnipsForSession` no longer returns early when snips already exist. It freezes stored snips and appends newly closed ones.

### PWA orchestration

- `ingestGrowingSession(sessionId, { includeTrailing, transcribe, apiKey })` is the single path: analyze → propose → `transcribeAudio` per snip missing text → `writeTranscript`. Serialized per session.
- Recording screen `chunkEncoded` calls ingest with `includeTrailing: false`. Overlay concatenates durable transcript text (`overlayTranscriptText`).
- RETRY TX retries failed **snips**, not chunks.
- Stop/abort: finalize capture, ingest with `includeTrailing: true` (seal last snip), navigate **Home**, transcribe remaining snips in the background (do not block navigation).

### Navigation

- `stopRecording` → `finishCapture('home')`
- `abortRecording` already went Home; unchanged
- Watchdog `no_audio_received` also lands on Home

## QA proof (1170×2532)

1. `documentation/qa/record-live-durable.png` — mid-record overlay showing transcript after a snip completed (`?screenshot=record-durable`)
2. `documentation/qa/after-stop-home.png` — after stop, Home list showing the new session (`?screenshot=home-after-stop`)
3. `documentation/qa/session-transcribed-already.png` — session opened later with transcript already present, no Transcribe Session CTA (`?screenshot=session-transcribed`)

## Resolution

**Resolved:** 2026-08-28T21:30:00Z

### What shipped

1. Removed throwaway per-chunk live transcription from `RecordingScreen`.
2. Live overlay is a view of session-store snips + transcripts produced by the real snip/transcription pipeline.
3. Stop and abort that keep the session navigate to Home, not session detail.
4. Overlay Stop slot unchanged (never covers Stop). Pending copy unchanged.

### Verification

- volume-analyzer unit tests for trailing-drop and incremental `windowStartTime`
- Screenshot previews for the three QA shots
- `make build` published PWA to `docs/`
