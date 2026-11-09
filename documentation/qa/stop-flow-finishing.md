# QA: Stop flow — instant busy state, then Home READY

**Date:** 2026-11-09  
**Branch:** `cursor/stop-flow-busy-state-b56b`  
**Viewport:** Chrome iPhone device mode (390×844 CSS px, deviceScaleFactor 3 → 1170×2532)

## What was verified

1. **`?screenshot=record-finishing`**
   - HUD label is **Finishing recording…** (not Recording).
   - Stop control reads **Saving recording…** and is disabled (`data-stop-phase="finishing"`).
   - Stay on the recording screen; live overlay still visible.

2. **`?screenshot=home-after-stop`**
   - After the wait, Home list shows the take as **READY** (fully transcribed).
   - No PART TX flash in this fixture — last snip already has text.

## Proof shots (1170×2532)

- `documentation/qa/stop-flow-finishing-iphone.png`
- `documentation/qa/stop-flow-home-transcribed-iphone.png`
