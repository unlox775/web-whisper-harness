# QA: Recording path does not scan the library per encoded chunk

**Date:** 2026-11-12  
**Branch:** `cursor/pwa-no-chunk-stats-scan-c87b`  
**Spec:** `apps/web-whisper-pwa/docs/specs/20261112180300-feedback-no-whole-db-scan-on-every-encoded-chunk.md`  
**Viewport:** Playwright Chromium `iPhone 13` (390×844, touch) + CPU 4× + `?simulate=1`  
**Harness:** `PERF_N=0,10,50,100 PERF_RECORD_SECONDS=60 npm --prefix apps/web-whisper-pwa run test:perf`  
**Raw after:** `documentation/qa/perf-after-no-chunk-scan-raw.json`  
**Baseline:** `documentation/qa/perf-baseline-2026-11-12.md`

## What was verified

1. **Live take** — Record tap → HUD **Recording**, timer advancing, **Stop Recording** tappable. Simulated capture encodes chunks; persist `put` stays on the hot path.
2. **No per-chunk `getStorageStats`.** The 90% retention gate uses last-known usedBytes (refresh) plus incremental encoded `byteLength × 1.1`. Unknown stats skip retention and keep recording.
3. **Stop still `await`s `flushPending()`** before `enforceRetentionPolicy`. Unsaved / untranscribed audio is not purged.
4. App unit tests (148) and soak (`tests/soak/no-chunk-loss.test.ts`) pass.

## Proof shots

- `recording-no-library-scan-iphone.png` — iPhone 13 emulation, live simulated recording (N=10 seeded library)

## Recording 60 s — before / after

Live-path metric is **last sample during the 60 s window** (before Stop). The original harness `recordWindow.idb` was taken after Stop → home, so it mixed in list/stats work (separate spec). After this PR the harness snapshots before Stop.

`chunks` object-store + index `cursorContinues` during the live minute:

| N | baseline continues | after last live sample | persist `put` max after | `tapRecordToActive` after |
| --- | --- | --- | --- | --- |
| 0 | 120 | 240 | 5.2 ms | 162 ms |
| 10 | 53,546 | **240** | 5.3 ms | 83 ms |
| 50 | 255,163 | **240** | 4.6 ms | 146 ms |
| 100 | **505,866** | **240** | 8.5 ms | 185 ms |

After: encoded chunks 15–16; no `persist_backpressure` / Saving-is-behind; `writeMsMax` **< 50 ms**; `tapRecordToActive` **< 200 ms**. N=100 live continues stay in the N=0 order of magnitude (hundreds: walking the growing take for ingest/coverage). Baseline 505k was one full-library `getStorageStats` per encoded chunk.

After-Stop `recordWindow.idb` in this run still jumped with N (18k / 90k / 178k) because that snapshot included Stop → home `refresh()` + tile fan-out — list spec, not this one.
