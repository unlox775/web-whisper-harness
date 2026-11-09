# QA: Recording screen wake lock (iPhone PWA)

**Date:** 2026-11-09  
**Branch:** `cursor/recording-screen-wake-lock-03fc`  
**Viewport:** iPhone 12 Pro Chrome device mode (390×844 CSS px → 1170×2532)

## What was verified

1. **`?screenshot=record-wake-lock`**
   - Full-screen recording takeover.
   - Status line **Screen awake · video** under the timer.
   - **Stop Recording** unchanged and tappable.

2. **Live take (`?simulate=1`) with iPhone UA**
   - Record tap acquires Screen Wake Lock **and** the muted `playsinline` video fallback (iOS path).
   - Status line **Screen awake · wake lock + video**.
   - Capture still starts; wake-lock work does not stop or drop audio.

3. **Unit tests** (`apps/web-whisper-pwa`): acquire / release, `visibilitychange`, `pageshow`, missing API → video, iOS uses both, same-turn `video.play()` from the Record gesture, request failure → video, logging, no audio track on the keep-awake clip.

## Proof shots

- `recording-wake-lock-iphone.png` — fixture, video-fallback status
- `recording-wake-lock-iphone-live.png` — live simulated recording, wake lock + video
- `recording-wake-lock-iphone-status.png` — status line crop
