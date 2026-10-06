Spec Status: unresolved
Spec Type: feedback
Created: 2026-10-06T18:05:17Z
Product: packages/lib/capture-engine

# Feedback: Resilient persist queue and flushPending

## User Feedback

Dave’s ~47 minute take: capture **appeared** to continue (timer / mic live) but volume, snips, and transcripts **stopped**. Hypothesis to encode as a contract — agents verify at implement time, do not treat as already proven:

Retention’s long IndexedDB `readwrite` contended with `writeChunk` / `appendChunk`. A persist **promise chain without error handling died silently**. After that, no further chunks were stored, so the growing-session ingest had nothing new to analyze — while the UI still looked like a live recording.

This is a **persist-queue** failure, not the mid-stream PCM stall (`audioStalled` in `20260904120001-feedback-ongoing-audio-stream-stall-detection.md`). PCM can keep flowing while IndexedDB writes have stopped.

## Depends on

- Session-store writer / retention serialization — `packages/datastore/session-store/docs/specs/20261006180517-feedback-durable-per-package-logging.md` (section 5: caller-serialized flush; `writeChunk` may return `{ error: 'transaction_conflict' }`)
- PWA must await this package’s flush before retention — `apps/web-whisper-pwa/docs/specs/20261006180517-feedback-await-flushpending-before-retention.md`

Does **not** depend on PWA log-level Settings or transcription-coverage specs.

## Requested Outcome

### 1. Persist queue must not die on one failure

Chunk persist (`writeChunk` / any `appendChunk` wrapper) runs on a serialized promise chain today (or equivalent). That chain **must**:

1. `try/catch` (or `.catch`) **every** persist job.
2. On failure: emit existing `captureError` with reason `store_write_failed` and the store `{ error }` (quota, `session_not_found`, `database_unavailable`, `transaction_conflict`).
3. **Continue** the queue. The next encoded chunk still enqueues. One failed write must not reject the shared tail so later jobs never run.
4. **Single retry** for a **transient conflict** (`transaction_conflict`, aborted transaction, or an equivalent IndexedDB conflict). One retry only — no loops.
5. After retry failure: emit `captureError` again (or include `retried: true` in details) and move on. Do not buffer an unbounded in-memory backlog of failed blobs (existing customer contract: no giant RAM queue).

Fatal vs continue:

| Store error | Queue | Capture |
| --- | --- | --- |
| `transaction_conflict` (after 0–1 retry) | continue | stay live; emit `store_write_failed` |
| `database_unavailable` | continue | stay live; emit `store_write_failed` (PWA may stop) |
| `quota_exceeded` | continue attempting later chunks (they will likely fail the same way) | emit `store_write_failed`; PWA decides whether to stop. **Do not** call `enforceRetentionPolicy` from this package. |
| `session_not_found` | stop enqueueing for that session | emit and auto-stop (session is gone) |

Do **not** let an unhandled rejection kill the chain. Unit-test: inject one failed `writeChunk`, then a success; the success must still persist.

### 2. Expose flushPending / whenPersistIdle

Callers (PWA) need to wait until in-flight chunk writes have settled **before** opening session-store retention.

```javascript
// On the capture handle and/or as a module-level function bound to the active capture.
flushPending() => Promise<void>
whenPersistIdle() => Promise<void>   // alias; same promise is fine
```

Contract:

- Resolves when the persist queue is empty (every started `writeChunk` has settled — success, skipped, or failed after retry).
- Safe to call when not capturing: resolve immediately.
- `handle.stop()` / `stopCapture` **must** wait for persist idle after the final chunk encode (or the stop summary’s `chunksWritten` lies).
- Does not start retention. Does not call session-store except to finish already-queued writes.
- In-memory Isolation Demo mode: resolve immediately (no store writes) — still export the function so callers can `await` unconditionally.

Document both names in the package README. Prefer implementing one function and aliasing the other so PWA specs can say `flushPending()` without bikeshedding.

### 3. Structured logs via session-store (light)

This package **emits** structured logs through session-store’s `log()` API. It does not own log storage.

```javascript
sessionStore.log('capture-engine', 'debug', () => ({
  message: 'chunk persist ok',
  details: { sessionId, seq, sizeBytes }
}))
```

Use the lazy function form. Session-store checks package level **and** active (or explicit) session id **before** invoking the payload. If Settings has `capture-engine` at `off` / below `debug`, building `details` must not run.

Suggested events (not an exhaustive required list): persist ok (debug), persist retry (warn), persist failed (error), flushPending waited (debug). Do not log PCM sample buffers.

PWA wires `configureLogger` / `activeSessionId`. This package may pass `{ sessionId }` on `log()` using the capture’s session id.

### 4. Isolation Demo (this package)

This planning PR does not change demo code. The Phase 07 implementer may add a factory-floor note or control: “flushPending resolves” / inject one persist failure and show the queue continuing. In-memory demo can no-op persist; session-store’s demo remains the place that actually writes chunks.

## Notes For Phase 07

- Keep changes scoped to `packages/lib/capture-engine` (persist queue, `flushPending` / `whenPersistIdle`, customer docs, README, optional Isolation Demo).
- Do not implement PWA retention orchestration or session-store schema here.
- Do not change mid-stream `audioStalled` / start watchdog behavior except to keep it distinct from persist failure.
- Cursor Cloud Agent only — never Codex.
- Verify the 47-minute hypothesis at implement time (add a contention / rejected-chain test). If the real bug is different, document findings in the Resolution — still ship a queue that cannot die silently.
- Update this spec with a Resolution or Blocked section when Phase 07 implementation runs.
- Do **not** mark this spec resolved from the specs-only PR.

## Out of scope

- PWA Settings log-level UI
- Session-store `logs` object store implementation (session-store spec)
- PWA `await flushPending()` before `enforceRetentionPolicy` (PWA spec)
- Transcription coverage / `partial` status
- Pause/resume
- Automatic `enforceRetentionPolicy` from this package

## Resolution Criteria

Mark this spec resolved when:

- [ ] Persist queue catches per-job failures and continues; one failure cannot silently kill later writes
- [ ] Single retry for transient `transaction_conflict` (or equivalent); no retry loop
- [ ] `flushPending()` / `whenPersistIdle()` exist and resolve when the queue is idle
- [ ] `stop()` waits for persist idle before returning `chunksWritten`
- [ ] Structured `log()` calls use lazy payloads and package id `capture-engine`
- [ ] Customer docs + package README name the new APIs
- [ ] Spec updated with a Resolution section documenting what shipped (including whether the 47-minute hypothesis was confirmed)
