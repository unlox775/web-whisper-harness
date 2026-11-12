Spec Status: unresolved
Spec Type: feedback
Created: 2026-11-12T18:00:00Z
Product: packages/datastore/session-store
Contract: docs/DURABILITY-CONTRACT.md
Harness: apps/web-whisper-pwa/tests/perf/README.md
Baseline: documentation/qa/perf-baseline-2026-11-12.md

# Feedback: getStorageStats / rebuildStatsCache must not cursor the blob store

## User Feedback

On iPhone Safari PWA, app load, returning to the session list, Stop, and live recording all get slower as sessions pile up. A 24-minute take is ~357 chunks × ~64 KB. At ~100 such sessions the list and recording path feel far from instant.

## Measured (2026-11-12 harness)

Chromium, iPhone 13 device metrics, CPU 4×. Synthetic formatVersion-1 archives (357 × 4 s `audio/mpeg` @ 128 kbps, volume profile + snips + transcripts). `importSessionArchive` seed. Cap raised so retention does not purge audio.

Unthrottled `getStorageStats` median:

| N sessions | used | `getStorageStats` | cold list (4×) | back to list (4×) |
| --- | --- | --- | --- | --- |
| 0 | ~0.1 MB | 0.2 ms | 117 ms | — |
| 10 | 227 MB | 175 ms | 986 ms | 1132 ms |
| 20 | 454 MB | 352 ms | 1464 ms | 1895 ms |
| 50 | 1.14 GB | 1008 ms | 3529 ms | 4551 ms |
| 100 | 2.27 GB | **2044 ms** | **6541 ms** | **8244 ms** |

Cold load at N=100 opens **2** `chunks` object-store cursors and walks **71,400** records (~8.9 GB of `sizeBytes` accounted on `cursor.value`). That is `rebuildStatsCache` on `init()` plus `getStorageStats` on `refresh()`. Linear in total chunk count.

During a 60 s recording at N=100 the live session writes 15 chunks, but the chunks store shows **505,866** object-store cursor continues (~63 GB accounted). That is `getStorageStats` on every `chunkEncoded` (PWA `enforceCap` / 90% check). Persist `put` itself stays 2–8 ms. The scan is the scale cost.

`listSessions` stays 4 ms at N=100. Logs are not the list/boot path.

A running totals cache already exists (`src/stats-cache.js`) and retention already cheap-exits from it. **`getStorageStats` still ignores the cache and `openCursor`s every chunk and log row.**

## Root cause

`packages/datastore/session-store/src/storage.js` `getStorageStats` and `src/stats-cache.js` `rebuildStatsCache` walk the `chunks` object store (blob-bearing records) and the `logs` store to recompute totals the cache already maintains on write/delete.

## Requested Outcome

1. **`getStorageStats()` is O(1) in chunk count** when the stats cache is valid: return `usedBytes` / `chunkCount` / `logBytes` / `sessionCount` from running totals (same 1.1 overhead as today). Do **not** `openCursor` the chunks store on the customer path.
2. **`init()` / `rebuildStatsCache` must not block the first customer read** on a full blob-store walk. If a rebuild is required, it yields to customer writes (existing scheduler) and must not make `listSessions` or `writeChunk` wait on the scan. Prefer persisting the running totals in `meta` so boot does not rescan.
3. **Never use a stale-low `usedBytes` to justify purging untranscribed audio.** If the cache is invalid, treat used bytes as unknown / high (skip cheap “under cap” only when that is safe) rather than scanning blobs on the UI path. Untranscribed captured audio is never discarded (`docs/DURABILITY-CONTRACT.md`).
4. Public contract: `getStorageStats` remains `{ usedBytes, capBytes, sessionCount, chunkCount, logBytes, logEntryCount, logWriteFailures, logBytesByPackage }`. Callers must not be told to “not call this while recording.”

## Package boundaries

This spec is **session-store only**. PWA still calls `getStorageStats` on refresh and to decide near-cap retention; that becomes cheap once this lands. A separate PWA spec covers not fanning out per-tile chunk scans.

## Customer contracts (implementing PR)

- `README.md` storage stats: O(1) when cache valid; no blob cursor on the customer path
- `customers/web-whisper-pwa.md`: `getStorageStats` is safe on boot, every list refresh, and every live chunk

## Tests (must pass)

- Unit: after N chunk writes, `getStorageStats().usedBytes` matches cache/`sizeBytes` sums without opening a chunks `readwrite` and without an object-store cursor over all rows (spy/fake IDB).
- Unit: `writeChunk` / `deleteSession` keep cache and `getStorageStats` aligned.
- Harness (`apps/web-whisper-pwa/tests/perf`, N=100 full-size 357×4 s sessions, CPU 4×):
  - `storeMicrobench.getStorageStats.medianMs` **< 10 ms**
  - `coldLoadToInteractiveList.wallMs` **< 200 ms** once the PWA list spec also lands; **this spec alone** must make unthrottled `getStorageStats` < 10 ms and must drop cold-load object-store `chunks` cursorContinues from ~71,400 to ~0 (no full-store stats walk)
  - 60 s record at N=100: object-store `chunks` cursorContinues no longer scales as `encodedChunks × totalChunksInDb` (baseline 505,866)

## Out of scope

PWA tile query storm; `getChunksForSession` blob-in-record (separate spec); capture-engine encoder long tasks.

## Durability

Do not make stats “cheap” by dropping chunk bytes, skipping `writeChunk`, or purging audio. Cache bugs must not cause retention to delete untranscribed capture.
