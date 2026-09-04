# QA: Recording durability — wake lock + no-audio pulse

**Date:** 2026-09-04  
**Branch:** `cursor/recording-durability-ux-12f2`  
**Viewport:** iPhone 12 Pro DevTools (390×844 CSS px)

## What was verified

1. **`?screenshot=record-no-audio`**
   - Full-screen recording takeover stays up (no Home bounce).
   - Slow pulse on recording chrome + red pulse dot.
   - Banner copy **No audio**.
   - Clock still shows duration; **Stop Recording** remains tappable.

2. **No auto-stop policy**
   - `no_audio_received` maps to alert (not `finishCapture('home')`).
   - Mid-stream stall / start-with-no-audio do not navigate away.
   - `encoding_failed` may still stop; `store_write_failed` stays a toast.

3. **Wake lock**
   - Unit tests: acquire on start, release on stop, re-request on `visibilitychange` → visible, missing API does not throw.

4. **Beep schedule**
   - Unit tests: first 3-beep at ~5s, repeat every ~5s, three oscillators per pattern.

## Proof shots

- `documentation/qa/recording-no-audio-pulse.png` — iPhone 12 Pro DevTools, pulse + No audio banner before resolve
