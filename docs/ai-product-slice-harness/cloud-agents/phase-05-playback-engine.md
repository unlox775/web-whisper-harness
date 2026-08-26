# Phase 05: playback-engine Producer Responses

**Date**: 2026-08-26  
**Phase**: 05 (Producer Responses)  
**Producer**: packages/lib/playback-engine  
**Customer Documents**: 2 customer files in `packages/lib/playback-engine/customers/`

## Producer Summary

Playback-engine is the lib package that plays audio from sessions, chunks, or snips. It reads session/chunk/snip metadata and blobs from session-store, concatenates MP3 blobs if needed, and plays via HTML5 Audio API. It has 2 customers:

1. **Isolation Demo** (`00-isolation-demo.md`): Standing human customer that proves playback works with fixture chunks (no session-store dependency)
2. **web-whisper-pwa** (`web-whisper-pwa.md`): Primary orchestrator that calls playback-engine to play sessions/chunks/snips

## Producer Response Content

Playback-engine's producer responses specify:

### Interfaces for Isolation Demo (Fixture-First)

**`playSession(chunks)` or `playChunks(chunks)`** → Playback handle

- Input: `chunks: Array<{seq, blob}>` (fixture chunks from demo, sorted by seq)
- Concatenates MP3 blobs, creates HTML5 Audio element, returns handle

**`playChunk(blob)`** → Playback handle

- Input: single chunk blob from fixture
- Plays single chunk via HTML5 Audio element

### Interfaces for PWA (Session-Store Integration)

**`playSession(sessionId)`** → Playback handle or error

- Reads session and chunks from session-store, concatenates blobs, plays audio
- Pre-playback errors: `{error: 'session_not_found'}`, `{error: 'chunks_missing'}`
- Graceful degradation: If some chunks missing, concatenates available chunks and plays with gaps (better than failing entirely)

**`playChunk(chunkId)`** → Playback handle or error

- Reads single chunk from session-store, plays audio
- Pre-playback error: `{error: 'chunk_not_found'}`

**`playSnip(snipId)`** → Playback handle or error

- Reads snip metadata (chunkIds array) from session-store, fetches chunk blobs, concatenates, plays
- Pre-playback errors: `{error: 'snip_not_found'}`, `{error: 'snip_chunks_missing'}`

### Playback Handle Interface

Methods:
- `handle.pause()` → Pause playback
- `handle.resume()` → Resume playback
- `handle.seek(time)` → Seek to time in seconds
- `handle.stop()` → Stop playback, release resources

Properties:
- `handle.duration` (number): Total duration
- `handle.currentTime` (number): Current position
- `handle.state` (string): 'playing' | 'paused' | 'stopped'

Events:
- `handle.on('ended', callback)` → Playback completed
- `handle.on('playbackError', callback)` → Runtime error (decode failed)
- `handle.on('timeupdate', callback)` → Current time updated (~100ms)

### Key Design Decisions

- **Seamless blob concatenation**: MP3 chunks concatenated as single blob play seamlessly with NO audible gaps (HTML5 Audio handles MP3 frame concatenation).
- **Graceful degradation for missing chunks**: If some chunks missing (but not all), concatenates available chunks and plays with gaps. User hears "jumps" where chunks missing. Better than failing entirely.
- **Read-only customer**: Playback-engine NEVER writes to session-store. Only reads sessions/chunks/snips.
- **Session-store integration**: Calls `getSession`, `getChunksForSession`, `getChunk`, `getSnip` automatically. PWA doesn't call session-store directly for playback.

### What Playback-Engine Will NOT Ship in Phase 06

- **Volume control**: HTML5 Audio has default volume controls (browser chrome). No custom volume slider in handle.
- **Playback speed control**: No `setPlaybackRate(rate)` method.
- **Waveform visualization**: Provides audio playback only, not waveform rendering.
- **Session-store integration in Isolation Demo**: Demo operates with fixture blobs only (no session-store dependency).

## Phase 06 Follow-Up

Phase 06 implementation agent will build playback-engine with fixture and session-store modes, validate seamless concatenation playback, handle missing chunks gracefully, build Isolation Demo.
