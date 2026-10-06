Spec Status: resolved
Spec Type: feedback
Created: 2026-10-06T18:05:17Z
Resolved: 2026-10-06T19:45:00Z
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

- [x] Every during/after-recording `enforceRetentionPolicy` path `await`s `flushPending()` / `whenPersistIdle()` first
- [x] No `Promise.all` of retention + chunk persist
- [x] Quota-while-recording path is documented (flush-then-retain vs stop-then-retain)
- [x] Orchestration test covers the await order
- [x] Spec updated with a Resolution section (including 47-minute hypothesis notes)

## Resolution

**Resolved:** 2026-10-06T19:45:00Z on branch `cursor/pwa-await-flushpending-retention-22ad` (draft PR).

### What shipped

1. Single orchestrator helper `enforceRetentionAfterPersistIdle` in `apps/web-whisper-pwa/src/retentionAfterIdle.ts`.
   - Sequential `await flushPending()` then `await enforceRetentionPolicy(capBytes)`.
   - No `Promise.all` of persist + retention.
   - `createRetentionGate()` serializes fire-and-forget callers so two retentions cannot overlap.
2. Every PWA `enforceRetentionPolicy` path goes through `enforceCap` in `context.tsx`, which now always awaits module-level `flushPending()` from `@web-whisper/capture-engine` first (no-op when no capture is active). Covered call sites:
   - boot / Settings cap change (`useEffect` → `enforceCap({ force: true })`)
   - Start Recording (before `startCapture`)
   - live `chunkEncoded` throttle
   - live `store_write_failed` / quota toast
   - post-Stop `finishCapture`
   - `onTranscriptWritten` (Home / Recording / Session Detail)
3. **Quota-while-recording: flush-then-retain** (not stop-then-retain). Capture stays live; the toast is unchanged. The next live `writeChunk` waits until retention finishes instead of contending for a second long `readwrite`.
4. Structured logs: helper accepts an optional lazy `sessionStore.log` callback, but this main does not export `log` yet (PR #60 not merged). No call site wires it, so Vite does not import a missing export. Does not block this PR.
5. Orchestration tests in `retentionAfterIdle.test.ts`: retention is not invoked until a mocked `flushPending` resolves; no overlap; gate serializes concurrent callers.

### 47-minute hypothesis

Overlapping IndexedDB `readwrite` on chunks/sessions **was a real cooperating cause**, not just a guess: `chunkEncoded` and `store_write_failed` both called `enforceCap()` while capture was still persisting. That matches the incident (retention / long `readwrite` vs `writeChunk` / `appendChunk`). Capture-engine PR #59 already fixed the unhandled persist-queue rejection so later writes cannot die silently. This PR is the orchestrator half: flush, then retain, never in parallel. Both fixes are needed; either alone would still leave a race.

### Untouched

Capture-engine persist queue / `flushPending` implementation, session-store retention internals, Settings log-level UI, transcription coverage.
