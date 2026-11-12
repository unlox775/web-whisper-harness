# QA: Home list no longer scans every chunk

**Date:** 2026-11-12  
**Spec:** `apps/web-whisper-pwa/docs/specs/20261112180200-feedback-session-list-must-not-scan-all-chunks.md`  
**Harness:** `npm --prefix apps/web-whisper-pwa run test:perf`  
**Device:** Playwright Chromium `iPhone 13` (390×844) + CPU 4×  
**After run:** rebased onto `main` (#72) then `PERF_N=10,50,100 PERF_RECORD_SECONDS=12`  
**Raw after JSON:** `documentation/qa/perf-session-list-after-2026-11-12.json`  
**Before:** published baseline `documentation/qa/perf-baseline-2026-11-12.md` (same parent as the first PWA-list change; list/detail numbers are comparable)

## What changed

Home paints tile chrome from `listSessions` rows. Gap honesty uses coverage persisted on those rows (`lastSeq`, `savedCount`, `missingSeqs`, `savedDurationMs`, `lostChunks`) — the same O(1) `getChunkCoverage` shape from #72. Visible tiles lazy-load snips + transcripts for READY / PART TX (never READY from `hasTranscript` alone). Cards do not call `getChunksForSession`. `getChunkCoverage` is only a fallback when a row lacks persisted fields (O(1) session get). `goHome` refreshes session rows only; the DATA chip does not block navigation. Session detail heading and gap line paint from the list row; `getChunksForSession` / `getChunkCoverage` load for that session only.

## Timing (CPU 4×)

Wall milliseconds. Before = baseline. After `backToList.wallMs` still includes the harness 400 ms IDB-idle window; `cardsVisibleMs` is Start recording + N cards.

| N | cold list before | cold list after | open detail before | open detail after (heading) | back → list before | back → list after (cards / wall) |
| --- | --- | --- | --- | --- | --- | --- |
| 10 | 986 | **423** | 556 | **585 (heading 119)** | 1132 | **88 / 599** |
| 50 | 3529 | **1477** | 780 | **527 (heading 69)** | 4551 | **126 / 664** |
| 100 | **6541** | **2590** | **1115** | **530 (heading 69)** | **8244** | **203 / 793** |

N=100 after (#72 APIs): `getChunkCoverage` median **0.1 ms**; `getChunksForSession` median **9.4 ms** (metadata only). Home back-to-list IndexedDB `chunks` cursors **0**. Snips/transcripts continues **472** (~visible tiles), not 100× coverage. Cold load still opens **2** `chunks` object-store cursors / **71,400** continues — `session-store.init()` `rebuildStatsCache` (store spec `20261112180000`), out of scope here.

## Screenshots (iPhone 13 emulation)

- Before: `documentation/qa/perf-session-list-n100-before.png` (READY tiles, DATA 2.4 GB / 16 GB)
- After: `documentation/qa/perf-session-list-n100-after.png` (same READY + snippet; status still correct, not a false all-transcribed)

## Remaining

Cold list under 200 ms needs O(1) `getStorageStats` / no blob walk on `init()` (sibling store spec). Tile snippet/READY still lazy-loads snips + transcripts for visible cards (`hasTranscript` is not READY).
