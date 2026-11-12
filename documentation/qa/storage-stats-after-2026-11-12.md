# QA: session-store `getStorageStats` O(1) after-fix

**Date:** 2026-11-12  
**Branch:** `cursor/session-store-stats-o1-0624`  
**Spec:** `packages/datastore/session-store/docs/specs/20261112180000-feedback-storage-stats-must-not-scan-blob-store.md`  
**Harness:** `apps/web-whisper-pwa/tests/perf/README.md` (`PERF_N=10,50,100`, CPU 4×, iPhone 13 emulation)  
**Baseline:** `documentation/qa/perf-baseline-2026-11-12.md`

Captured audio was not purged (cap 16384 MB). DATA chip matches seeded library size.

## Store microbench (unthrottled `getStorageStats` median ms)

| N | before | after |
| --- | --- | --- |
| 10 | 175 | **0** |
| 50 | 1008 | **0** |
| 100 | **2044** | **0** |

Target: **< 10 ms**. Met at every N.

## Cold load `chunks` cursor continues (stats walk)

Baseline N=100: **2** object-store cursors, **71,400** continues (`rebuildStatsCache` + `getStorageStats`).

After this spec, full-store stats walks are gone (`getStorageStats` does not cursor `chunk-blobs`; blob bytes come from the cache / metadata `sizeBytes`). Remaining continues in the first after-fix harness were **N × 357** (one `getChunksForSession` / coverage cursor per Home tile). That fan-out is a separate spec and is already on `main` (#73).

| N | before (stats walk) | after this spec (tile fan-out still present in that run) |
| --- | --- | --- |
| 10 | ~7,140 | 3,570 (= 10 × 357) |
| 50 | ~35,700 | 17,850 (= 50 × 357) |
| 100 | **71,400** | 35,700 (= 100 × 357) |

Cold → Start recording at N=100: **6541 ms → 318 ms**.

## 60 s recording `chunks` cursor continues

| N | before | after |
| --- | --- | --- |
| 10 | 53,546 | **240** |
| 50 | 255,163 | **240** |
| 100 | **505,866** | **210** |

No longer `encodedChunks × totalChunksInDb`. Persist `put` max stayed 11–15 ms.

## Screenshots (iPhone 13 emulation)

- `documentation/qa/storage-stats-after-iphone-n10.png` — 10 READY tiles, DATA 244 MB / 16 GB
- `documentation/qa/storage-stats-after-iphone-n100.png` — DATA 2.4 GB / 16 GB, Start recording idle, audio not purged

Raw JSON: `documentation/qa/storage-stats-after-raw.json`.
