# Storage DATA meter after stats-cache upgrade fix

iPhone 13 Chromium emulation (`device-mode`).

| Screenshot | State |
|------------|--------|
| `storage-stats-calculating-iphone.png` | Upgraded DB missing persisted stats — DATA shows **Calculating…** (no sentinel). |
| `storage-stats-meter-iphone-n100.png` | After background rebuild at N=100 — sane MB/GB usage vs cap. |

Perf harness seeds this by deleting `meta.storage-stats` and zeroing session `sizeBytes` before reload (see `simulateUpgradedDbMissingStats` in `scale.spec.ts`).
