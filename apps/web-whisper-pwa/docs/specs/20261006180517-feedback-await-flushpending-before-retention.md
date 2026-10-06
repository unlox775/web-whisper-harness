Spec Status: unresolved
Spec Type: feedback
Created: 2026-10-06T18:05:17Z
Product: apps/web-whisper-pwa

# Feedback: Await flushPending before retention

## User Feedback

Same ~47 minute incident as the capture-engine persist-queue spec: retention ran (or was triggered) while capture was still persisting chunks. A long session-store `readwrite` for `enforceRetentionPolicy` contended with `writeChunk` / `appendChunk`. Combined with an unhandled persist promise, **chunk writes stopped** while capture looked live — so volume / snips / transcripts froze.

PWA is the orchestrator that calls **both** capture-engine (writers) and session-store retention. It must **serialize** them.

## Depends on

- Capture-engine `flushPending()` / `whenPersistIdle()` — `packages/lib/capture-engine/docs/specs/20261006180517-feedback-resilient-persist-queue-and-flushpending.md`
- Session-store retention / `writeChunk` serialization rules — `packages/datastore/session-store/docs/specs/20261006180517-feedback-durable-per-package-logging.md` (section 5)

Do not implement those producer APIs in this PWA spec. Consume them.

Independent of Settings log levels and transcription-coverage specs.

## Requested Outcome

### 1. Never overlap retention with in-flight chunk writes

Before **every** `sessionStore.enforceRetentionPolicy(capBytes)` call that can run **during or after recording** (post-stop orchestration, quota toast path, Settings “enforce now” if it exists while a capture handle is live):

```javascript
await captureEngine.flushPending()
// or await handle.flushPending() / whenPersistIdle()
await sessionStore.enforceRetentionPolicy(capBytes)
```

If there is no active capture handle, `flushPending()` still resolves immediately (capture-engine contract). Always `await` it so the call sites stay identical.

Do **not** start retention in parallel with `startCapture` / live `writeChunk`. Prefer: run retention **after** Stop + persist idle, or on an idle Settings path when no capture is active.

If today’s PWA calls `enforceRetentionPolicy` from a `quota_exceeded` handler **while recording**, change that path to:

1. `await flushPending()`
2. Then retention (accept that the next live `writeChunk` waits until retention finishes — better than overlapping locks)
3. Or: stop capture first, flush, retain, then let the user start a new session (existing “storage full” UX). Document which choice shipped.

### 2. Do not open a second long readwrite yourself

PWA must not call `getStorageStats` + `enforceRetentionPolicy` + a write path in overlapping `Promise.all`. Sequential `await` only.

`getStorageStats` is a read; it may run anytime. The **write** is `enforceRetentionPolicy`.

### 3. Hypothesis (verify at implement time)

Record in the Resolution whether overlapping `readwrite` on chunks/sessions was actually the 47-minute failure. Still ship caller-serialized flush even if the root cause was only the unhandled persist chain (capture-engine spec). Two cooperating fixes; this one is the orchestrator half.

### 4. Structured logs (light)

When waiting on flush or running retention around a take, emit via session-store:

```javascript
sessionStore.log('web-whisper-pwa', 'info', () => ({
  message: 'retention after persist idle',
  details: { sessionId, deletedSessions, reclaimedBytes }
}))
```

Lazy payload. Do not build details if the PWA package level gates it.

## Notes For Phase 07

- Keep changes scoped to `apps/web-whisper-pwa` orchestration (stop / quota / settings retention call sites).
- Do not reimplement persist queue or retention internals.
- Do not change Settings log-level UI or transcript coverage in this PR.
- Cursor Cloud Agent only — never Codex.
- Add a unit or orchestration test: retention is not invoked until a mocked `flushPending` resolves.
- Run **`make build`** from the repo root in the implementation PR if PWA assets change.
- Update this spec with a Resolution or Blocked section when Phase 07 implementation runs.
- Do **not** mark this spec resolved from the specs-only PR.

## Out of scope

- Implementing `flushPending` in capture-engine
- Rewriting session-store to multiplex concurrent writers
- Log Settings UI / archive `includeLogs` UI
- Transcription coverage helper

## Resolution Criteria

Mark this spec resolved when:

- [ ] Every during/after-recording `enforceRetentionPolicy` path `await`s `flushPending()` / `whenPersistIdle()` first
- [ ] No `Promise.all` of retention + chunk persist
- [ ] Quota-while-recording path is documented (flush-then-retain vs stop-then-retain)
- [ ] Orchestration test covers the await order
- [ ] Spec updated with a Resolution section (including 47-minute hypothesis notes)
