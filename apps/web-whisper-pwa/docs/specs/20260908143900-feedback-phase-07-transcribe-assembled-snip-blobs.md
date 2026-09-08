Spec Status: resolved
Spec Type: feedback
Created: 2026-09-08T14:39:00Z
Resolved: 2026-09-08T14:39:00Z
Product: apps/web-whisper-pwa

# Feedback: Phase 07 — Groq must receive assembled snip blobs, not 4s chunks

## User Feedback

Dave’s imported session shows multi-word / ~3–4s phrase repeats across snips (BLT-like, but a full phrase long). He suspects Transcribe is feeding Groq **4s capture chunks** (or overlapping chunk sets) instead of **assembled snip blobs**.

Package README / `transcription-client/customers/web-whisper-pwa.md` say the PWA must:

1. Propose / use snips
2. Assemble each snip’s audio from its chunk refs
3. Call `transcribeAudio(snipBlob, apiKey)` **per snip**
4. Write the transcript per snip

## Investigation

### What is sent to Groq (call graph)

Normal Transcribe, live ingest, Home RETRY TX, and post-Stop leftover TX all go through `transcribeSession` / `ingestGrowingSession` → `transcribePendingSnips` in `apps/web-whisper-pwa/src/orchestration.ts`.

Session-detail per-snip RETRY goes through `SessionDetailScreen.retrySnip`.

| Step | File | Function | What it does |
| --- | --- | --- | --- |
| 1 | `orchestration.ts` | `transcribeSession` / `ingestGrowingSession` | `ensureSnips` / `proposeSnipsForSession`, then pending snips only |
| 2 | `orchestration.ts` | `transcribePendingSnips` | **One** `transcribeAudio` per snip missing text |
| 3 | `assembleSnipAudio.ts` | `assembleSnipTranscriptionBlob` | Builds the blob passed to Groq |
| 4 | `transcription-client/src/transcribeAudio.js` | `transcribeAudio` → `attemptTranscription` | POSTs that one blob to Groq Whisper |
| 5 | `orchestration.ts` | `sessionStore.writeTranscript` | Writes text for that snip id |

There is **no** whole-session Groq call on the PWA Transcribe path. Isolation Demo “upload archive → one concatenated blob” is a demo-only one-shot and is out of scope.

Historical note: `RecordingScreen` used to call `transcribeAudio` on each `chunkEncoded` blob (~4s). That throwaway path was removed in `20260828210000-feedback-live-durable-snip-transcription.md`. Live overlay now uses the same `transcribePendingSnips` path.

### What was wrong (real bug, not a fake one)

`transcribePendingSnips` already called Groq **once per snip**. It did **not** iterate capture chunks.

The blob was still wrong. `assembleSnipBlob` byte-concatenated **every** `snip.chunkIds` MP3. volume-analyzer’s `chunkRefsForRange` (`packages/lib/volume-analyzer/src/snips.ts`) stores **all chunks that overlap** the snip time range.

Capture chunks are ~4s. Target snips are 5–60s (default 10s). Adjacent snips that abut mid-chunk therefore share that entire ~4s file:

| Snip | Time range | `chunkIds` (overlap refs) | Old Groq audio |
| --- | --- | --- | --- |
| A | 0–10s | c0 0–4, c1 4–8, **c2 8–12** | **0–12s** |
| B | 10–20s | **c2 8–12**, c3 12–16, c4 16–20 | **8–20s** |

Shared window: **8–12s (~4s)**. Groq transcribes that phrase twice. That matches Dave’s “~3–4s phrase repeats across snips” and his “overlapping chunk sets” suspicion. It is not ASR-bleed of a single boundary word (the BLT doctor case).

Imported sessions hit the same assembler: slim zip → `ensureSnips` proposes overlapping refs; debug zip → restored snips keep remapped `chunkIds`, then Transcribe concatenates them.

## Requested outcome

- Keep **one Groq call per snip** (no chunk-by-chunk Transcribe, no whole-session Transcribe).
- Assemble a blob whose audio is the snip’s `[startTime, endTime]`, not the union of overlapping whole chunks.
- Document findings + resolution. Do not invent a second fake bug.

## Out of scope

- Isolation Demo UI
- API key paste / Settings
- Developer-mode import visibility
- Changing `proposeSnipsFromProfile` cut math
- playback-engine `playSnip` (still concatenates overlapping refs for listen-back)

## Resolution Criteria

- [x] Trace documents the real Groq payload (snip-assembled vs chunk vs session)
- [x] Overlapping whole-chunk windows are no longer sent on Transcribe / retry
- [x] Unit test proves one job per snip and non-overlapping slice windows
- [x] Spec records findings + resolution
- [x] Draft PR against main; not merged

## Resolution

**Resolved:** 2026-09-08T14:39:00Z

### Finding

PWA Transcribe was already **per-snip**, not per-chunk and not whole-session. The repeat bug was **overlapping chunk-set concatenation**: shared ~4s MP3s at snip boundaries.

### What shipped

- `apps/web-whisper-pwa/src/assembleSnipAudio.ts`
  - `planSnipAudioSlices` trims each overlapping chunk to the snip range (abutting snips share a ref, not a time window).
  - `assembleSnipTranscriptionBlob` decodes those slices and encodes one WAV (`kind: 'trimmed-wav'`).
  - If decode is unavailable, exclusive-chunk MP3 concat (`kind: 'concat-mp3'`) so a boundary chunk is owned by one snip only — still no overlapping Groq windows.
- `orchestration.ts` `transcribePendingSnips` and `SessionDetailScreen` retry/download use that assembler, then `transcribeAudio(blob, { mode: 'live' })` **once per snip**.
- `transcription-client` `filenameForAudioBlob` uploads `audio.wav` when the PWA sends a trimmed WAV (Groq keys off the filename).

### Proof

- `apps/web-whisper-pwa/src/assembleSnipAudio.test.ts`
  - Two 10s abutting snips over five 4s chunks → **2 Groq jobs**, each `groqCalls === 1`
  - Assembled duration is **10s**, not the 12s overlapping-chunk union
  - Whole-chunk concat **would** overlap; trimmed slices do not
  - Decode path writes a ~10s WAV; decode-fail path drops the shared `c2` from snip A
- Call sites: `transcribePendingSnips` (`orchestration.ts`), `retrySnip` (`SessionDetailScreen.tsx`), `attemptTranscription` (`transcribeAudio.js`)
