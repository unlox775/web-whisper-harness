Spec Status: resolved
Spec Type: feedback
Created: 2026-08-28T18:03:00Z
Resolved: 2026-08-28T18:03:00Z
Product: apps/web-whisper-pwa

# Feedback: Aborted/cancelled recordings must persist

## User Feedback (Dave)

The whole point of the app is durability. Chunks should always be persisting to IndexedDB as they encode. If he cancels/aborts a recording, or something goes wrong, he must still have everything recorded so far when he comes back. Incomplete sessions should appear on Home. Re-transcribe (RETRY TX) should only re-transcribe missed/failed snips, not throw away audio.

## Requested Outcome

- Trace stop / cancel / discard / navigate-away paths in the PWA and capture-engine.
- If cancel deletes the session or drops uncommitted chunks, stop doing that.
- Persist every encoded chunk immediately (that should already be the design); cancel = stop capture and keep the session as a normal partial recording.
- Home should list aborted/partial sessions with duration/chunk data like finished ones (READY/PART TX badges if already present).
- Do not require a "successful" stop to keep audio.
- Do not redesign session-detail or recording overlay UI.
- Do not change the snip algorithm.

## Investigation (current harness)

Traced paths before the fix:

1. **Stop Recording** (`context.stopRecording` → `handle.stop()`): flushed remainder, awaited pending writes, kept the session, opened session detail. Correct for an explicit stop.
2. **Start failure** (`startCapture` throw): deleted the freshly created session. Correct — capture never started, no encoded audio.
3. **Cancel / navigate-away / pagehide / reload**: no handler. Remainder PCM (< ~4s) stayed in RAM. In-flight IndexedDB writes were not drained. Next launch could show `duration: 0` / `chunkCount: 0` even when chunks existed (concurrent `writeChunk` metadata races).
4. **Watchdog / encoding_failed**: watchdog called `stop()` without awaiting; `stop()` threw if already inactive; PWA cleared the handle and did not finalize session metadata. Session could look empty on Home.
5. **chunkEncoded**: fired *before* `writeChunk` completed, so the UI could claim a chunk existed that was not durable yet.
6. **RETRY TX** (`transcribeSession` without `retryFailedOnly`): re-sent snips that already had transcripts. Did not delete chunks, but could overwrite good text. `ensureSnips` already reused stored snips (snip algorithm untouched).

## What shipped

### capture-engine

- Encoded chunks enqueue a **serialized persist queue** (same idea as the live app). `chunkEncoded` fires **after** a successful `writeChunk`.
- `stop()` / `abort()` are the same persist path: flush remainder PCM, drain the persist queue, keep the session. `stop()` is idempotent (watchdog + UI + pagehide can all call it).
- In-memory isolation-demo mode is unchanged (still emits immediately, no store writes).

### session-store

- `createSession` marks `status: 'recording'`.
- `finalizeSession(sessionId)` recomputes duration / chunkCount / sizeBytes from persisted chunks, then sets `status: 'ready'` (has audio) or `'error'` (no chunks). Never deletes.
- `reconcileDanglingSessions()` runs on PWA boot and finalizes any session still marked `recording` (killed tab, cancel, crash).

### PWA orchestration

- After capture has started, abort/cancel/error/pagehide **never** `deleteSession`.
- `abortRecording()` = stop capture, finalize, land on Home with the partial session listed.
- `pagehide` persists and returns Home when the document survives; `beforeunload` / `freeze` persist without requiring a successful stop.
- Boot: `reconcileDanglingSessions()` then `listSessions()` so aborted sessions show duration/size like finished ones.
- RETRY TX / `transcribeSession` always skip snips that already have transcripts. Existing snips and chunk blobs are left alone.

### Out of scope (honored)

- Session-detail layout / copy-first UI — not touched.
- Recording overlay / Stop slot — not touched.
- Snip algorithm (`proposeSnipsFromProfile`) — not touched.

## QA proof (1170×2532)

![Cancelled recording still listed on Home with visible duration](../../../documentation/qa/aborted-session-home.png)

![Aborted session opens with playable audio and duration](../../../documentation/qa/aborted-session-playable.png)

## Resolution criteria

- [x] Encoded chunks persist to IndexedDB as they encode (serialized write queue)
- [x] Cancel/abort/pagehide flushes remainder and keeps the session
- [x] Home lists aborted/partial sessions with duration/chunk data
- [x] RETRY TX only retries missed/failed snips; does not throw away audio
- [x] No session-detail or recording-overlay redesign
- [x] Snip algorithm unchanged
- [x] iPhone 1170×2532 shots in `documentation/qa/`
- [x] `make build` published PWA to `docs/`
- [x] Draft PR, not merged
