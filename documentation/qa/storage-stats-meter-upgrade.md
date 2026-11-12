# Storage DATA meter after stats-cache upgrade fix

iPhone 13 Chromium emulation (`device-mode`), **N=10** synthetic sessions (~22 MB audio each).

| Screenshot | State |
|------------|--------|
| `storage-stats-calculating-iphone.png` | DATA chip only — **Calculating…** while `__wwStatsRebuildDelayMs` stalls rebuild (15s). |
| `storage-stats-tiles-before-rebuild-iphone-n10.png` | First session tile — **0 B** before rebuild finishes. |
| `storage-stats-meter-iphone-n10.png` | DATA chip after rebuild — **~244 MB** scale (10 × ~22 MB + 1.1 overhead). |
| `storage-stats-tiles-after-rebuild-iphone-n10.png` | First session tile after rebuild — repaired **sizeBytes** (~22 MB), not 0 B. |

Harness: `apps/web-whisper-pwa/tests/perf/stats-meter-screenshots.spec.ts`.
