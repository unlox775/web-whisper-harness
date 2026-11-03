# Durability Contract (architecture-wide)

Status: **binding**. Every package spec, customer contract (`customers/*.md`), README interface section, and implementation must conform. A spec that contradicts this document is invalid. See `AGENTS.md` Rule 1.

## Invariants

1. **Captured audio is never discarded.** Once capture-engine has encoded a chunk, that chunk is either durably saved in session-store, or held and retried until it is saved.
2. **Transient failures wait; they never drop.** Busy store, aborted/conflicting transaction, slow IndexedDB, retention in progress → the write waits or is retried with backoff, bounded by **time** (≥ 30 s), never by "one retry".
3. **Permanent loss only on a permanent error** (quota exhausted after retention cannot free space, database unavailable for the retry window, session deleted) — and it is **reported**: `chunk_lost { sessionId, seq, startMs, endMs, reason }`, persisted with the session, visible to the user.
4. **The provider owns its concurrency.** session-store serializes its own writers and background work internally. No caller is required to coordinate with another caller or with the store's housekeeping.
5. **Retention and other housekeeping are lowest priority.** They never reject, abort, or block a customer write for more than ~500 ms, never run during recording unless storage is actually near the cap, and exit cheaply when under cap.
6. **Writes are idempotent**, keyed by `(sessionId, seq)`. Redelivery (at-least-once) is safe.
7. **Sessions detect gaps.** Every session knows its expected seq range; missing seqs are computed, exposed, and shown — never hidden behind "done" / READY.
8. **Saved duration is measured, not assumed.** Elapsed recording time and saved audio duration are reported separately; they must match on a healthy session.
9. **Failures are never silently swallowed**, including log-write failures (counted and surfaced).

## Error classes (shared vocabulary)

| Class | Examples | Required behavior |
| --- | --- | --- |
| transient | `store_busy`, aborted txn, timeout | wait / retry with backoff; keep data |
| permanent | `quota_exceeded` (after retention), `database_unavailable` (after window), `session_not_found` | stop retrying that item; emit `chunk_lost`; persist loss record |

`transaction_conflict` caused by the store's own background work is **not a valid customer-facing error** and is removed from the contract.

## Proof required

- Concurrency tests at each producer boundary (writes during retention).
- Fault-injection tests at each consumer boundary (store rejects for N seconds).
- Cross-package soak test: 60-minute simulated recording with injected transient failures and retention; every seq saved; saved duration == elapsed. See `apps/web-whisper-pwa/docs/specs/20261103175003-feedback-e2e-soak-60min-no-chunk-loss.md`.
  **Proven by:** `apps/web-whisper-pwa/tests/soak/no-chunk-loss.test.ts` (`npm run test:soak` / `make soak`).

## Implementing specs (one per package, one agent each, build in this order)

1. `packages/datastore/session-store/docs/specs/20261103175000-feedback-owner-serialized-writes-never-reject.md`
2. `packages/lib/capture-engine/docs/specs/20261103175001-feedback-never-drop-encoded-chunks.md`
3. `apps/web-whisper-pwa/docs/specs/20261103175002-feedback-no-retention-while-recording-and-gap-display.md`
4. `apps/web-whisper-pwa/docs/specs/20261103175003-feedback-e2e-soak-60min-no-chunk-loss.md`

## Superseded

- `packages/datastore/session-store/docs/specs/20261006180517-feedback-durable-per-package-logging.md` §"Serialization with writers" (transaction_conflict, callers serialize).
- `packages/lib/capture-engine/docs/specs/20261006180517-feedback-resilient-persist-queue-and-flushpending.md` §1 items 4–5 (single retry, move on, no backlog).
- `apps/web-whisper-pwa/docs/specs/20261006180517-feedback-await-flushpending-before-retention.md` (retention after every chunk while recording).
