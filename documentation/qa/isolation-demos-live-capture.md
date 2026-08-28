# QA: Isolation Demos live mic + compact mobile type

**Date:** 2026-08-28  
**Branch:** `cursor/isolation-demos-live-capture-5297`  
**Viewport:** iPhone 12/13/14 (390×844 CSS px → 1170×2532 screenshots)

## What was verified

1. **Live mic is the primary path**
   - Capture Engine: Live Microphone radio is selected; Start Capture is visible (not fixture-only).
   - Volume Analyzer: Live microphone toggle on; Start Capture / Stop Capture visible; fixtures optional.
   - Playback Engine: Live microphone source + Start Capture; fixture session/chunk/snip optional.
   - Transcription Client: Live microphone source + Start Capture; fixture blob optional.
   - Session Store: Live Microphone data source + Start Capture / Stop & Write Chunks into sandbox DB.

2. **Isolation**
   - Capture / playback / transcription keep live chunks in RAM.
   - Volume-analyzer tuner settings still use `web-whisper-volume-analyzer-demo-db`.
   - Session-store live flush writes to `web-whisper-isolation-demo-session-store` only.
   - No demo opens `web-whisper-db`.

3. **Mobile typography**
   - `@media (max-width: 480px), ((hover: none) and (pointer: coarse)) { html { zoom: 0.5 } }` on the index and every package demo.
   - Desktop fine-pointer / wide window stays full size.

4. **Publish**
   - `make build` publishes `docs/isolation-demos/`.

5. **Out of scope confirmed untouched**
   - PWA session-detail copy UX
   - Snip algorithm defaults (`DEFAULT_SNIP_OPTIONS` tests still pass)

## Proof shots (1170×2532)

- `documentation/qa/isolation-demos-live-record-control.png` — Capture Engine demo with live-record control visible
- `documentation/qa/isolation-demos-mobile-tiny-type.png` — Isolation Demos index at iPhone viewport (compact type)
