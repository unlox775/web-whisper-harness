# QA: session-store chunk metadata reads without blobs

**Date:** 2026-11-12  
**Spec:** `packages/datastore/session-store/docs/specs/20261112180100-feedback-chunk-metadata-reads-without-blobs.md`  
**Harness:** `npm --prefix apps/web-whisper-pwa run test:perf`  
**After run:** `PERF_N=10,50,100 PERF_RECORD_SECONDS=12` (CPU 4×, iPhone 13 Chromium). Recording window shortened vs the 60 s baseline; **open detail / back to list / store microbench** are the comparable columns.  
**Raw:** `documentation/qa/perf-chunk-metadata-after-raw.json`  
**Screenshot:** `documentation/qa/perf-chunk-metadata-detail-iphone.png` (N=10 session detail, iPhone 13 emulation)

Before numbers are from `documentation/qa/perf-baseline-2026-11-12.md` (same fixture: 357 × 4 s × ~64 KB chunks).

## Store microbench (unthrottled Chromium, median ms)

| N | `getChunksForSession` before → after | `getChunkCoverage` before → after | tile fan-out before → after |
| --- | --- | --- | --- |
| 10 | 17 → **9.4** | 19 → **0.2** | 310 → **31** |
| 50 | 18 → **9.0** | 20 → **0.4** | 996 → **161** |
| 100 | 18 → **9.3** | 19 → **0.1** | 2146 → **342** |

N=100 parallel `getChunkCoverage` across 100 sessions: **5 ms** (baseline 1682 ms). Coverage is a session-row read.

`getChunksForSession` stays in the 10–30 ms band (better). Opening one 357-chunk session detail does **not** read `chunk-blobs` (IDB snapshot: sessions + snips + transcripts + volume-profiles only; no ~22 MB audio).

Tile fan-out is still above 200 ms at N=100 because Home still loads snips + transcripts per card (PWA list spec). Coverage is no longer the cost.

## Open detail / back to list (CPU 4×, wall ms)

| N | open detail before → after (heading ms after) | back → list before → after |
| --- | --- | --- |
| 10 | 556 → **636** (heading **111**) | 1132 → **840** |
| 50 | 780 → **523** (heading **65**) | 4551 → **2116** |
| 100 | 1115 → **537** (heading **76**) | 8244 → **3859** |

Open-detail **heading** at N=100 is **76 ms**. Wall time still waits on leftover list/stats IndexedDB (`getStorageStats` median 1315 ms at N=100 — sibling spec). Back-to-list improved ~2× because `getChunkCoverage` is O(1) and chunk metadata no longer carries blobs, but the stats-store scan remains.

## Screenshot

iPhone 13 emulation, N=10 seeded READY session, transcript card after open detail:

`documentation/qa/perf-chunk-metadata-detail-iphone.png`
