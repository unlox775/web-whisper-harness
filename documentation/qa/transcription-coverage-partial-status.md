# QA: Transcription coverage — PART TX when audio remains past last snip

**Date:** 2026-10-06  
**Branch:** `cursor/pwa-transcription-coverage-partial-a4f8`  
**Viewport:** iPhone 12 Pro DevTools (390×844 CSS px → 1170×2532 screenshots)

## What was verified

1. **`?screenshot=home-partial-coverage`**
   - Session duration **3:00**, last snip ends at **0:45**, every snip has text.
   - Badge is **PART TX** (orange), not READY.
   - Copy: `Transcription is incomplete. More audio exists beyond 0:45.`
   - **RETRY TX** is present.

2. **`?screenshot=session-partial-coverage`**
   - Same fixture on Session Detail.
   - TRANSCRIPTION header shows **PART TX** (not a complete checkmark / READY).
   - Status: `Transcribed 2 of 2 snips.` plus the same beyond-0:45 copy.
   - Home and Detail agree.

3. **Regression: covered tail still READY**
   - `?screenshot=home-after-stop` → **READY**, no incomplete copy.
   - `?screenshot=session-transcribed` → **READY**, `Transcribed 2 of 2 snips.`, no beyond-MM:SS copy.

## Proof shots (1170×2532)

- `documentation/qa/home-partial-coverage-iphone.png`
- `documentation/qa/session-partial-coverage-iphone.png`
- `documentation/qa/home-after-stop-ready-regression-iphone.png`
- `documentation/qa/session-transcribed-ready-regression-iphone.png`
