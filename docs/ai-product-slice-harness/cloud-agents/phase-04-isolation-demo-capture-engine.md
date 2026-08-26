# Phase 04: Isolation Demo → capture-engine Customer Request

**Date**: 2026-08-26  
**Phase**: 04 (Customer Requests)  
**Relationship**: Isolation Demo → packages/lib/capture-engine  
**Customer Document**: `packages/lib/capture-engine/customers/00-isolation-demo.md`

## Relationship Summary

The Isolation Demo is the standing founder/developer customer that operates capture-engine independently to prove core capture logic works without the PWA or session-store persistence. It is the package factory floor for validating mic capture, MP3 encoding, chunk generation, and mic ghost detection.

## Customer Request Content

The Isolation Demo's customer request in `packages/lib/capture-engine/customers/00-isolation-demo.md` specifies:

- **In-memory mode (no session-store writes)**: Demo operates in in-memory mode. Chunks kept in RAM, NOT written to IndexedDB. Capture-engine MUST provide `startCapture({inMemory: true})` option or `startCaptureInMemory()` separate function that returns chunks as array instead of writing to store.

- **Safe default: Simulated PCM stream**: Demo defaults to "Simulated Audio" (gray chip). Capture-engine generates synthetic audio waveform (OscillatorNode at ~440 Hz). Allows immediate operation without mic permission or user speech.

- **Optional mode: Live Microphone**: Operator toggles "Enable Microphone" ON → mode switches to "Live Microphone" (cyan chip). Capture-engine calls `getUserMedia({audio: true})` → captures real audio. Proves real mic capture works.

- **Interfaces needed**: `startCapture(options)` or `startCaptureInMemory(options)` returns capture handle. Handle provides: `stop()`, `getStatus()` ({state, duration, chunkCount, watchdogRemaining}), event subscription (`on`, `off`).

- **Events needed**: `chunkEncoded` (payload: {seq, startTime, endTime, duration, blob, sizeBytes}), `captureError` (payload: {reason, detail}), `captureStopped` (no payload).

- **Visual proof**: Duration counter (climbs in real-time from PCM sample count), chunk tape (scrollable list of encoded chunks with Play buttons), watchdog countdown (10s → 0s, cancels after first chunk or expires for mic ghost), PCM buffer meter (optional).

- **Edge cases validation**: Mic ghost (watchdog timeout at 0s, error banner), final chunk < 4s (3 chunks: 4.0s, 4.1s, 2.3s), reset and prove in-memory (chunk tape clears, page reload → still empty).

- **Playback from RAM**: Each chunk in chunk tape has Play button. Demo plays chunk blob directly: `audioElement.src = URL.createObjectURL(blob)`. Proves MP3 encoding worked without requiring playback-engine.

- **UI panels**: Top Chrome Panel (data mode chip, mic toggle), Control Panel (Start/Stop/Reset buttons, duration counter, chunk count, watchdog countdown), Chunk Tape Panel (table with Play buttons), Event Feed Panel (collapsible, logs events).

- **Performance expectations**: `startCapture` returns < 50ms. `chunkEncoded` event fires < 100ms after chunk encodes. `stop()` returns < 50ms. `getStatus()` returns < 10ms (synchronous).

## Phase 05 Follow-Up

Phase 05 producer-response agent will write capture-engine's response in the same customer document, confirming how it will meet the Isolation Demo's request.
