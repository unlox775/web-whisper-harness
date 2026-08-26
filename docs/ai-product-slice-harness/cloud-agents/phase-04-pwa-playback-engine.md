# Phase 04: PWA → playback-engine Customer Request

**Date**: 2026-08-26  
**Phase**: 04 (Customer Requests)  
**Relationship**: apps/web-whisper-pwa → packages/lib/playback-engine  
**Customer Document**: `packages/lib/playback-engine/customers/web-whisper-pwa.md`

## Relationship Summary

The PWA calls playback-engine to play sessions, chunks (developer mode), and snips. Playback-engine reads chunks from session-store, concatenates MP3 blobs, and plays via HTML5 Audio API. Playback is the proof of recording: if users can't play it, they didn't record it.

## Customer Request Content

The PWA's customer request in `packages/lib/playback-engine/customers/web-whisper-pwa.md` specifies:

- **`playSession(sessionId)` interface**: Called when user opens session detail and taps "Play Session" button. Returns playback handle with control methods and event subscription.

- **`playChunk(chunkId)` interface** (developer mode): Called when user clicks "Play" button on chunk row in chunk list. Plays single chunk.

- **`playSnip(snipId)` interface**: Called when user clicks "Play" button on snip row in session detail. Plays snip (concatenates chunks in snip range).

- **Playback handle methods**: `pause()`, `resume()`, `seek(time)`, `stop()`. PWA calls these when user clicks playback controls.

- **Playback events**: `playing`, `paused`, `timeupdate`, `seeked`, `ended`, `stopped`, `playbackError`. PWA subscribes to events to update UI (play/pause button states, time display, progress bar).

- **Seamless multi-chunk playback requirement**: Sessions with multiple chunks MUST play continuously with NO gaps or time skips between chunks. Blob concatenation (`new Blob([blob1, blob2, blob3])`) creates single audio stream for HTML5 `<audio>` element.

- **Seek transparency**: Seek must work transparently across chunk boundaries. User seeks to 8:00 in 12-minute session → playback-engine calculates offset into concatenated blob → audio jumps to 8:00 (may be chunk 120 of long session). PWA does NOT need to know which chunk contains 8:00.

- **Error handling patterns**: Pre-playback errors returned as structured objects (`{error: 'session_not_found'}`). Runtime errors emitted as `playbackError` events. PWA displays error toasts, resets UI to idle state.

- **Handle lifecycle management**: PWA MUST call `stop()` in component cleanup if playback still active (user navigates away). If not called, audio continues playing in background and handle leaks (blob URL not revoked).

## Phase 05 Follow-Up

Phase 05 producer-response agent will write playback-engine's response in the same customer document, confirming how it will meet the PWA's request.
