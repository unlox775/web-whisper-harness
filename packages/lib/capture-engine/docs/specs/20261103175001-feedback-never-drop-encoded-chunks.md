Spec Status: unresolved
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
