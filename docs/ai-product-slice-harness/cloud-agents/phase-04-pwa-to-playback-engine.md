# Phase 04 Customer Request: PWA → Playback-Engine

**Consumer**: apps/web-whisper-pwa
**Producer**: packages/lib/playback-engine
**Relationship**: PWA → playback-engine

## Phase Runner Record

**Phase**: 04 (Customer Requests)
**Date**: 2026-08-26
**Agent Type**: customer-request
**Consumer Package**: apps/web-whisper-pwa
**Producer Package**: packages/lib/playback-engine

## Task

Write the customer request section (middle third) of `packages/lib/playback-engine/customers/web-whisper-pwa.md`.

## Customer Request Summary

The PWA needs playback-engine to provide programmatic audio playback interfaces for sessions, chunks, and snips with:

### Core Interfaces

1. **`playSession(sessionId)`** → Returns playback handle with play/pause/seek/stop methods and event subscriptions
2. **`playChunk(chunkId)`** → Returns playback handle for single chunk playback (developer mode)
3. **`playSnip(snipId)`** → Returns playback handle for snip playback (session detail, transcription preview)

### Playback Control Methods (on handle)

- `pause()` → Pause audio
- `resume()` → Resume from paused position
- `seek(time)` → Jump to specific time in seconds
- `stop()` → Stop playback, reset to 0:00, release handle

### Events (emitted by handle)

- `playing(currentTime, duration)` → Audio started/resumed
- `paused(currentTime)` → Audio paused
- `timeupdate(currentTime)` → Every ~250ms during playback
- `seeked(currentTime)` → Seek completed
- `ended()` → Playback reached end
- `stopped()` → Stop called
- `playbackError(reason, detail)` → HTML5 audio error or chunk missing

### Requirements

- **Seamless multi-chunk playback**: No gaps or time skips between chunks
- **Seek across chunks**: Seek works transparently in multi-chunk sessions
- **Error returns**: Pre-playback errors (session not found) return structured error objects (NOT thrown exceptions)
- **Runtime errors**: Playback errors during playback emit `playbackError` event
- **Handle lifecycle**: PWA must call `stop()` before releasing handle if user navigates away

### Session-Store Integration

Playback-engine reads from session-store:
- `getSession(sessionId)` → session metadata
- `getChunksForSession(sessionId)` → chunk list (metadata only)
- `getChunk(chunkId)` → chunk blob + metadata
- `getSnip(snipId)` → snip metadata + chunk refs

Playback-engine NEVER writes to session-store (read-only customer).

## Result

Customer request successfully written to `packages/lib/playback-engine/customers/web-whisper-pwa.md`.
