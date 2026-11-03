Spec Status: resolved
Spec Type: feedback
Created: 2026-11-03T17:50:00Z
Resolved: 2026-11-03T18:30:00Z
Product: packages/datastore/session-store
Contract: docs/DURABILITY-CONTRACT.md

# Feedback: Owner-serialized writes; writeChunk never rejects because of our own background work

## User Feedback

A 56-minute recording lost 48 four-second chunks (3:12 of audio). Root cause on our side: `enforceRetentionPolicy` runs a long `readwrite` that walks every chunk and log row, and `writeChunk` arriving meanwhile returned `{ error: 'transaction_conflict' }`. Our own housekeeping rejected customer data. That is forbidden (AGENTS.md Rule 1).

## Depends on

None. Producer for capture-engine and web-whisper-pwa. Supersedes §"Serialization with writers" of `20261006180517-feedback-durable-per-package-logging.md`.

## Requested Outcome

1. **Owner-serialized internal queue.** All mutating operations (`writeChunk`, session metadata writes, retention batches, log writes) go through one internal scheduler owned by this package. Customer writes have priority over retention/log-pruning.
2. **`writeChunk` waits; never fails due to our background work.** Remove `transaction_conflict` from the public contract. If IndexedDB aborts internally, the store retries internally. Only genuine permanent errors (`quota_exceeded` after a retention attempt, `database_unavailable`, `session_not_found`) are returned, each tagged `{ class: 'permanent' }`; transient conditions that persist are returned as `{ error: 'store_busy', class: 'transient' }` only after an internal wait budget (≥ 5 s).
3. **Cheap retention early exit.** Keep a running total (or cached stats updated on every write/delete) so `enforceRetentionPolicy(capBytes)` returns immediately when under cap — **before** setting any in-flight flag or opening any transaction (today `retention.js:140` sets the flag first, then walks all chunks/logs).
4. **Bounded batches.** When retention does run, it deletes in small batches (separate short transactions) and yields to queued writes between batches so a pending `writeChunk` waits **< ~500 ms**.
5. **Idempotent writes keyed `(sessionId, seq)`.** Rewriting an existing seq with the same payload is a success no-op; never a duplicate row, never an error.
6. **Gap info per session.** New `getChunkCoverage(sessionId)` → `{ expectedFirstSeq, lastSeq, savedCount, missingSeqs: number[], savedDurationMs, lostChunks: [{seq,startMs,endMs,reason}] }`. New `recordChunkLost(sessionId, {seq,startMs,endMs,reason})` persists a loss record.
7. **Logs bounded and honest.** Log rows pruned by age/count on a cheap schedule independent of the cap (bounded growth). Log write failures are never silently swallowed: increment a persisted `logWriteFailures` counter exposed via storage stats.

## Contract doc updates

The planning PR already rewrote the superseded contract lines to the new behavior. The implementing PR must make the docs below match the shipped API exactly (signatures, event shapes, error classes) and keep both sides in sync:

- `customers/capture-engine.md`: replace "Callers serialize", "retry once", `transaction_conflict` failure row (Phase 07 addendum, ~l.384-396) and the "capture-engine serializes writes" notes (~l.77, 202, 344) with the new guarantees: concurrent `writeChunk` calls are safe; waits, never rejects for housekeeping; idempotent by seq; error classes.
- `customers/web-whisper-pwa.md`: remove "must not overlap retention with live chunk writers / await flushPending before retention" (Phase 07 addendum) and the "one retry only" quota note (~l.391); add `getChunkCoverage`, `recordChunkLost`, `logWriteFailures`, and "retention is safe to call any time; cheap when under cap".
- `README.md` interface lines 47-48: drop "Callers must serialize with writers" and `transaction_conflict`.

## Tests (must pass)

- 100 concurrent `writeChunk` calls issued while retention runs over a large DB (≥ 5,000 chunks + 20,000 log rows, over cap): all 100 stored; no call returns an error; max write wait < 500 ms.
- Retention under cap: returns without opening a `readwrite` transaction or setting the in-flight flag.
- Idempotent rewrite of `(sessionId, seq)` → success, one row.
- Gap detection: write seqs 0..9 except 4 and 7 → `missingSeqs` = [4,7]; `savedDurationMs` reflects only saved chunks.
- Injected log-write failure increments `logWriteFailures`.

## Out of scope

capture-engine retry/buffer behavior; PWA retention scheduling and UI (separate specs).

## Resolution

Implemented in `packages/datastore/session-store` only (package isolation). Owner-serialized scheduler (`src/scheduler.js`), running totals (`src/stats-cache.js`), batched retention, idempotent `writeChunk`, `getChunkCoverage` / `recordChunkLost`, and `logWriteFailures`.

- [x] Owner-serialized internal queue; customer writes have priority over retention/log-pruning
- [x] `writeChunk` waits; never fails due to our background work; `transaction_conflict` removed; permanent vs transient error classes; `store_busy` only after ≥ 5 s internal wait
- [x] Cheap retention early exit under cap (no in-flight flag, no transaction)
- [x] Bounded retention batches that yield to queued writes (< ~500 ms)
- [x] Idempotent writes keyed `(sessionId, seq)`
- [x] `getChunkCoverage` + `recordChunkLost`
- [x] Logs age/count-bounded; log write failures increment persisted `logWriteFailures`
- [x] Customer contracts + README match the shipped API
- [x] Tests: 100 concurrent writes during retention over a large DB; under-cap no-txn; idempotent rewrite; gap detection; injected log-write failure; old `transaction_conflict` expectation replaced
- [x] `npm test` in this package is green
