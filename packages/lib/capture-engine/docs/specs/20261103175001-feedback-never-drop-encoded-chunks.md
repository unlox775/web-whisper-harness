Spec Status: resolved
Spec Type: feedback
Created: 2026-11-03T17:50:00Z
Product: packages/lib/capture-engine
Contract: docs/DURABILITY-CONTRACT.md

# Feedback: Never drop an encoded chunk

## User Feedback

The persist queue "retried once, then moved on" (spec `20261006180517-feedback-resilient-persist-queue-and-flushpending.md` §1 items 4-5) and kept "no backlog". With the store busy, 48 chunks of a 56-minute session were thrown away. The whole point of this app is durability: audio must be held and retried exactly like transcription is.

## Depends on

`packages/datastore/session-store/docs/specs/20261103175000-feedback-owner-serialized-writes-never-reject.md` (error classes, idempotent seq writes, `recordChunkLost`). Supersedes §1 items 4-5 of the 20261006180517 persist-queue spec.

## Requested Outcome

1. **Bounded pending buffer replaces "no backlog".** Encoded chunks not yet confirmed saved stay in an ordered in-memory pending buffer sized for **at least 5 minutes of audio** (≥ 75 chunks at 4 s). Writes drain in seq order.
2. **Transient errors retry with exponential backoff (e.g. 250 ms → 4 s cap) bounded by time: ≥ 30 s per chunk**, and keep retrying while the session is live and the buffer has room. Later chunks queue behind; none are skipped.
3. **Backpressure, not dropping.** If the buffer nears capacity, emit `persist_backpressure { pendingCount, oldestSeq }` so the PWA can warn; still never drop a transient-failing chunk.
4. **Permanent errors** (`class: 'permanent'`, or retry window exhausted) → emit `chunk_lost { sessionId, seq, startMs, endMs, reason }` and call `sessionStore.recordChunkLost`. This is the only path by which a chunk is not saved.
5. **`flushPending()` reports truth.** Resolves to `{ savedCount, lostChunks: [...] }` after every pending chunk is saved or declared lost. It no longer counts failed writes as "finished". `whenPersistIdle()` same semantics.
6. `store_write_failed` becomes a transient diagnostic event only (not a loss signal).

## Contract doc updates

The planning PR already rewrote the superseded contract lines to the new behavior. The implementing PR must make the docs below match the shipped API exactly (signatures, event shapes, error classes) and keep both sides in sync:

- `customers/web-whisper-pwa.md` (~l.489): replace "retry once on transient conflict, then continue" with: chunks are held and retried with time-bounded backoff; `chunk_lost` is the only loss signal; `persist_backpressure` event; `flushPending()` result shape.
- `README.md` l.33: replace "one retry on transaction_conflict, continue" with the new behavior.
- Confirm against `packages/datastore/session-store/customers/capture-engine.md` as updated by the session-store spec.

## Tests (must pass)

- Store rejects every write (transient) for 3 s while chunks arrive every 4 s (fake timers) → every seq stored, in order; no `chunk_lost`.
- Store rejects transiently for 40 s on one chunk → that chunk still saved after recovery if buffer has room; later chunks not skipped.
- Permanent error on seq 5 → `chunk_lost` with correct `seq/startMs/endMs`; `recordChunkLost` called; seq 6+ continue.
- `flushPending()` with one lost chunk resolves `lostChunks.length === 1`.

## Out of scope

Store internals; PWA UI.

## Resolution Criteria

Mark this spec resolved when:

- [x] Bounded pending buffer holds encoded chunks (≥ 75 / 5 min); writes drain in seq order
- [x] Transient errors retry with exponential backoff (250 ms → 4 s cap) for ≥ 30 s, and keep retrying while the session is live
- [x] `persist_backpressure { pendingCount, oldestSeq }` emitted when the buffer nears capacity; transient-failing chunks are never dropped
- [x] Permanent errors emit `chunk_lost { sessionId, seq, startMs, endMs, reason }` and call `sessionStore.recordChunkLost`
- [x] `flushPending()` / `whenPersistIdle()` resolve `{ savedCount, lostChunks }` after every pending chunk is saved or declared lost
- [x] `store_write_failed` is diagnostic only, not a loss signal
- [x] Customer docs + README match the shipped API
- [x] Spec tests pass: 3 s transient rejects with 4 s arrivals; 40 s transient on one chunk; permanent seq 5; `flushPending` lostChunks.length === 1

## Resolution

Shipped in capture-engine only (`packages/lib/capture-engine`). Builds against session-store's owner-serialized contract (`writeChunk` waits; errors classed `permanent` vs `transient` `store_busy`; `recordChunkLost`). No session-store or PWA changes.

### Persist buffer

- Encoded chunks stay in an ordered in-memory pending buffer sized for ≥ 75 chunks (5 min at 4 s). Drain is owner-serialized and seq-ordered; later chunks queue and are never skipped.
- Transient `{ error, class: 'transient' }` (including `store_busy` and thrown IndexedDB errors) retry with backoff 250 ms → 4 s cap. Minimum retry window 30 s per chunk; while the session is live, retries continue past that window.
- Near-capacity enqueue emits `persist_backpressure { pendingCount, oldestSeq }`. Chunks are still held.

### Loss path

- Permanent store errors (`session_not_found`, `quota_exceeded`, `database_unavailable`, or `class: 'permanent'`) or retry-window exhaustion after stop → emit `chunk_lost { sessionId, seq, startMs, endMs, reason }` and `sessionStore.recordChunkLost`. That is the only way a chunk is not saved.
- `store_write_failed` is not emitted as a loss signal.

### flushPending / whenPersistIdle

- Same function under two names, on the handle and as module exports.
- Resolves `{ savedCount, lostChunks: [{ seq, startMs, endMs, reason }] }` after every pending chunk is saved or declared lost.
- Idle / not capturing: `{ savedCount: 0, lostChunks: [] }`.
- `handle.stop()` still awaits persist idle before returning `chunksWritten`.

### Tests

Package `npm test`: previous stall/watchdog cases plus never-drop cases (3 s transient reject while chunks arrive every 4 s, 40 s transient on one chunk, permanent seq 5 → `chunk_lost` + `recordChunkLost`, `flushPending` `lostChunks.length === 1`).
