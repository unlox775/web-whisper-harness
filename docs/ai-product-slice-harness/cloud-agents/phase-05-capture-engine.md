# Phase 05: capture-engine Producer Responses

**Date**: 2026-08-26  
**Phase**: 05 (Producer Responses)  
**Producer**: packages/lib/capture-engine  
**Customer Documents**: 2 customer files in `packages/lib/capture-engine/customers/`

## Producer Summary

Capture-engine is the lib package that handles the microphone-to-durable-chunk pipeline. It acquires mic, captures PCM, encodes MP3 chunks every ~4s, and writes them to session-store immediately. It has 2 customers:

1. **Isolation Demo** (`00-isolation-demo.md`): Standing human customer that proves capture works independently without session-store persistence (in-memory mode)
2. **web-whisper-pwa** (`web-whisper-pwa.md`): Primary production customer (iPhone PWA) that orchestrates recording workflow

## Producer Response Content

Capture-engine's producer responses specify:

### Core Interface

**`startCapture(sessionId, options?)`** → Returns capture handle (synchronous)

- Throws `CaptureError("permission_denied")` if mic denied (PWA catches and shows permission reminder)
- Throws `CaptureError("invalid_session")` if sessionId doesn't exist
- Throws `CaptureError("already_capturing")` if sessionId already has active capture
- Options: `{watchdogTimeout?: number, inMemory?: boolean}` (watchdogTimeout default 10s, inMemory for demo)

### Capture Handle

- `handle.stop()` → Returns Promise with `{chunksWritten, totalDuration, hasAudio, sessionId}`
- `handle.getStatus()` → Returns `{isActive, chunksEncoded, currentDuration, watchdogActive}` (< 10ms, synchronous)
- `handle.on(event, callback)` / `handle.off(event, callback)` → Event subscription

### Events

- `chunkEncoded` → `{sessionId, seq, duration, byteLength}` (every ~4s, includes blob in in-memory mode)
- `captureError` → `{sessionId, reason, details?}` (reasons: `no_audio_received`, `store_write_failed`, `encoding_failed`)
- `captureStopped` → `{sessionId, chunksWritten, totalDuration, hasAudio}`

### Key Design Decisions

- **In-memory mode for demo**: When `options.inMemory === true`, skip session-store writes, accumulate chunks in RAM, emit events with blobs
- **Audio source modes**: Simulated PCM stream (safe default, no mic permission) and Live Microphone (optional, for testing)
- **Sample-based duration (load-bearing)**: `currentDuration` from `samplesProcessed / sampleRate`, NOT wall clock. Lesson from existing Web Whisper.
- **Watchdog timer (10s)**: Detects iOS mic ghost. If no audio callbacks for 10s → emit `captureError('no_audio_received')`, auto-stop, return `hasAudio: false`.
- **Session-store integration**: Calls `session-store.writeChunk(sessionId, chunkData)` automatically every ~4s. If fails, emit `captureError('store_write_failed')` and continue (next chunk tries again).
- **Final chunk flush**: Flushes remaining PCM buffer (< 4s) on stop, encodes final chunk with actual duration.

### What Capture-Engine Will NOT Ship in Phase 06

- **Pause/resume**: Out of scope. Recording is start-to-stop only.
- **Automatic retry on store write failure**: PWA decides whether to retry after quota_exceeded.
- **Chunk buffering during store failures**: Some chunks may be lost if writeChunk fails repeatedly. Acceptable—PWA shows "Recording may be incomplete" warning.

## Phase 06 Follow-Up

Phase 06 implementation agent will build capture-engine with production + in-memory modes, integrate with session-store, build Isolation Demo, validate mic ghost detection and final flush.
