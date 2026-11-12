# QA: PWA scale performance baseline

**Date:** 2026-11-12  
**Branch:** `cursor/pwa-perf-harness-e1cf`  
**Harness:** `apps/web-whisper-pwa/tests/perf/README.md` (`npm run test:perf`)  
**Device:** Playwright Chromium `iPhone 13` (390×844, touch) + `Emulation.setCPUThrottlingRate = 4`  
**Not Safari.** Treat this as a ranking / regression gate. iPhone WebKit IndexedDB is likely slower.

No product fixes in this PR. Specs for later one-spec-one-agent work are listed at the bottom.

## Fixture

Synthetic formatVersion 1 `web-whisper-session-archive` (not real dictation):

| Field | Value |
| --- | --- |
| chunks | 357 × 4 s `audio/mpeg` |
| encode | ffmpeg sine+pink-noise, 128 kbps, 44100 Hz mono, **65,245 B/chunk** |
| duration | 1428 s (owner export was 1424 s / 357 chunks; we kept chunk count) |
| extras | `hasVolumeProfile` (40 samples/chunk @ 100 ms), 59 snips + transcripts, `status: ready` |
| zip | ~22.6 MB; ~22.2 MB audio per session |
| N=100 | **2.27 GB** origin usage (quota overridden to ~12 GB via CDP; first attempt died at ~900 MB / 37 sessions) |

Seed path: `session-store.importSessionArchive` (same function as Settings zip import). App cap set to **16384 MB** so retention does not purge transcribed audio during the run.

Raw JSON: `documentation/qa/perf-baseline-raw.json`.

## Timing table (CPU 4× UI)

Wall milliseconds. Cold load = new `page.goto` on the same origin (IndexedDB already seeded).

| N | used | cold → Start recording | cold → list idle | open detail | back → list | Record tap → active | Stop → home idle |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | 0.1 MB | 117 | 532 | — | — | 143 | 866 |
| 10 | 227 MB | 986 | 1427 | 556 | 1132 | 111 | 2446 |
| 20 | 454 MB | 1464 | 1994 | 579 | 1895 | 78 | 4423 |
| 50 | 1.14 GB | 3529 | 4081 | 780 | 4551 | 118 | 10461 |
| 100 | 2.27 GB | **6541** | **7554** | **1115** | **8244** | 112 | 8784 |

Target for list/detail navigation at N=100: **< 100–200 ms**. Record tap is already in band. List/back/stop-to-home are **30–40×** over target.

## Store microbench (unthrottled Chromium)

Median of 3 calls after seed, before 4× UI.

| N | `listSessions` | `getStorageStats` | one `getChunkCoverage` | one `getChunksForSession` | tile fan-out (N × snips+tx+coverage) |
| --- | --- | --- | --- | --- | --- |
| 0 | 0.2 | 0.2 | — | — | — |
| 10 | 1 | 175 | 19 | 17 | 310 |
| 20 | 1 | 352 | 17 | 19 | 397 |
| 50 | 2 | 1008 | 20 | 18 | 996 |
| 100 | **4** | **2044** | 19 | 18 | **2146** |

`getSnipsForSession` ~3–4 ms, `getTranscriptsForSession` ~2–3 ms, `getVolumeProfile` ~1 ms, `getSession` ~1 ms. Volume-profile JSON is not the list bottleneck. `listSessions` is not.

## Recording 60 s

| N | encoded | persist `put` max | `persist_backpressure` | chunks object-store cursor continues | accounted `sizeBytes` |
| --- | --- | --- | --- | --- | --- |
| 0 | 15 | 1.9 ms | no | 120 | 16.5 MB |
| 10 | 15 | 2.0 ms | no | 53,546 | 6.7 GB |
| 20 | 15 | 3.2 ms | no | 102,380 | 12.7 GB |
| 50 | 15 | 7.8 ms | no | 255,163 | 31.8 GB |
| 100 | 15 | 2.8 ms | no | **505,866** | **62.9 GB** |

Writes stay cheap. The live path full-scans the library on every `chunkEncoded` via `getStorageStats` (PWA 90% retention gate). N=0’s 120 continues are the growing session only (ingest/coverage) — that is the budget.

Main-thread long tasks ~350–430 ms appear **at N=0 too** (MP3 encode every 4 s). Not ranked as a scale bottleneck; not specced here.

## IndexedDB notes

Cold load at N=100: **2** `chunks` **object-store** cursors, **71,400** continues (~8.9 GB accounted) = `rebuildStatsCache` + `getStorageStats`. The probe originally wrapped `IDBObjectStore.openCursor` only; `getChunksForSession` uses **`IDBIndex.openCursor`** (under-counted in this baseline). Tile fan-out cost is the microbench column, not the cold-load cursor total. Index wrapping is now in `perfIdbProbe.ts` for the next run.

## Screenshots (iPhone 13 emulation)

- `documentation/qa/perf-baseline-list-n10.png` — 10 seeded READY tiles, DATA 244 MB / 16 GB
- `documentation/qa/perf-baseline-list-n20.png`
- `documentation/qa/perf-baseline-list-n100.png` — DATA **2.4 GB / 16 GB**, same 23:48 / 22 MB tiles

## Ranked bottlenecks

| Rank | Package | What | Evidence at N=100 | Spec |
| --- | --- | --- | --- | --- |
| 1 | `packages/datastore/session-store` | `getStorageStats` / `rebuildStatsCache` cursor the blob-bearing `chunks` store. Stats cache exists and is ignored. | 2044 ms unthrottled; 2.0 s × 2 on cold load; 4× list 6.5–8.2 s | `packages/datastore/session-store/docs/specs/20261112180000-feedback-storage-stats-must-not-scan-blob-store.md` |
| 2 | `apps/web-whisper-pwa` | Every `chunkEncoded` → `enforceCap` → `getStorageStats` (whole library) for the 90% check | 505,866 continues / ~63 GB in 60 s; persist puts 2–8 ms | `apps/web-whisper-pwa/docs/specs/20261112180300-feedback-no-whole-db-scan-on-every-encoded-chunk.md` |
| 3 | `apps/web-whisper-pwa` | Each Home `SessionCard` loads snips + transcripts + `getChunkCoverage`; `goHome` awaits `refresh()` | tile fan-out 2146 ms unthrottled; back-to-list 8244 ms at 4× | `apps/web-whisper-pwa/docs/specs/20261112180200-feedback-session-list-must-not-scan-all-chunks.md` |
| 4 | `packages/datastore/session-store` | `getChunksForSession` / `getChunkCoverage` strip `blob` in JS but cursor `cursor.value` still includes ~64 KB audio | 19 ms/session × 100 = list; Safari will hurt more | `packages/datastore/session-store/docs/specs/20261112180100-feedback-chunk-metadata-reads-without-blobs.md` |

**Not bottlenecks at this shape:** `listSessions`, volume-profile document (~0.1 MB / 1 ms), log store on list/boot, Record tap, capture-engine persist queue (until the stats scan starves it).

**Suggested implement order:** store stats (1) → PWA record-path (2, becomes cheap/O(1) once 1 lands) → store metadata/coverage (4) → PWA list (3). One spec per agent.

## How to re-run

```bash
cd apps/web-whisper-pwa
npm run test:perf
```

Env: `PERF_N=0,10,20,50,100`, `PERF_RECORD_SECONDS=60`, `PERF_CPU_THROTTLE=4`, `PERF_CHUNK_COUNT=357`.
