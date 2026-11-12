Spec Status: unresolved
Spec Type: feedback
Created: 2026-11-12T18:03:00Z
Product: apps/web-whisper-pwa
Contract: docs/DURABILITY-CONTRACT.md
Harness: apps/web-whisper-pwa/tests/perf/README.md
Baseline: documentation/qa/perf-baseline-2026-11-12.md

# Feedback: Do not scan the whole library on every encoded chunk

## User Feedback

Recording itself should stay near-instant as old takes accumulate. On iPhone the live take feels heavier once the library is large, even when the new session is only seconds long.

## Measured (2026-11-12 harness)

60 s simulated capture (`?simulate=1`), CPU 4×. Persist `put` latency stays **2–8 ms**. No `persist_backpressure`. Encoded chunks ~15. What **does** scale is IndexedDB object-store walks on `chunks` during the live minute:

| N | chunk cursor continues (60 s) | accounted `sizeBytes` | write max |
| --- | --- | --- | --- |
| 0 | 120 | 16.5 MB | 1.9 ms |
| 10 | 53,546 | 6.7 GB | 2.0 ms |
| 20 | 102,380 | 12.7 GB | 3.2 ms |
| 50 | 255,163 | 31.8 GB | 7.8 ms |
| 100 | **505,866** | **62.9 GB** | 2.8 ms |

~`encodedChunks × (N × 357)` continues: one full-library `getStorageStats` cursor per 4 s chunk. N=0’s 120 continues match walking **only the growing session** (volume ingest / coverage). Main-thread long tasks ~400 ms exist even at N=0 (MP3 encode) and are **not** this spec.

`tapRecordToActive` is already ~80–140 ms and does **not** scale (under the 200 ms target). Stop → home **does** scale (interactive 205 → 5591 ms) because Stop `refresh()`s the list (list spec + stats spec).

## Root cause

`apps/web-whisper-pwa/src/context.tsx`: on every `chunkEncoded`, `enforceCap({ opportunity: 'recording' })` **always** `await sessionStore.getStorageStats()` then maybe `shouldRunRetention`. Spec `20261103175002` already forbids running retention during recording unless `usedBytes ≥ 90%` of cap (at most once per 60 s). The 90% check itself full-scans every chunk row via today’s `getStorageStats`.

Live ingest (`RecordingScreen` → `ingestGrowingSession` → `analyzeVolumeForSession`) only needs the **current** session’s chunks. That is the N=0 120-continue baseline and is in scope to keep, not to spread across the library.

## Depends on

- `packages/datastore/session-store/docs/specs/20261112180000-feedback-storage-stats-must-not-scan-blob-store.md` — `getStorageStats` must be O(1). Even then this spec requires the PWA **not** to treat “cheap stats” as license to do extra whole-library work on the record path.

## Requested Outcome

1. **While recording, do not walk other sessions’ chunks.** The 90% retention gate must use O(1) `usedBytes` (store spec) or a value already in PWA state from the last write/refresh. No object-store cursor over the library on `chunkEncoded`.
2. **Keep the existing retention policy:** no retention during recording unless used ≥ 90% of cap, at most once per 60 s. Under cap, `enforceCap` on `chunkEncoded` should be a few milliseconds, not a 2 s scan.
3. **`writeChunk` / persist queue stay on the hot path.** Do not drop, coalesce-away, or “retry once” encoded chunks to avoid the scan (`DURABILITY-CONTRACT`).
4. **Live volume/snip ingest stays per current `sessionId`.** Do not call `getStorageStats`, `cleanupOrphans`, `dumpStore`, or all-session `getChunkCoverage` from `chunkEncoded`.
5. After Stop, list refresh cost is the list spec — not solved by skipping `flushPending`.

## Package boundaries

PWA orchestration only. Do not change capture-engine persist retry. Do not weaken session-store `writeChunk`.

## Customer contracts (implementing PR)

- `apps/web-whisper-pwa/README.md`: recording-path usedBytes is O(1); no library scan per chunk
- `packages/datastore/session-store/customers/web-whisper-pwa.md`: PWA may call `getStorageStats` during recording **because it is O(1)**; it will not cursor chunks itself

## Tests (must pass)

- Existing `retentionPolicy.ts` unit tests: under cap → no retention during recording; ≥ 90% → at most once / 60 s.
- Harness 60 s record at N=100, CPU 4×, full-size library:
  - object-store (and index) `chunks` cursorContinues during `recordWindow` in the same **order of magnitude as N=0** (hundreds, not 5×10⁵). Allowed: walking the live session’s ~15 chunks for ingest/coverage.
  - persist `writeMsMax` stays **< 50 ms**; no `persist_backpressure` / Saving-is-behind from stats scans
  - `tapRecordToActive.wallMs` remains **< 200**
- Must **not** introduce chunk loss vs `tests/soak/no-chunk-loss.test.ts`.

## Out of scope

MP3 encode long tasks on the main thread (~400 ms at N=0). Session list fan-out (separate spec). Changing default 200 MB cap.

## Durability

Background stats/retention must yield to `writeChunk`. Never discard encoded audio because a usedBytes check was slow or skipped. If stats are unknown, do **not** run retention; keep recording.
