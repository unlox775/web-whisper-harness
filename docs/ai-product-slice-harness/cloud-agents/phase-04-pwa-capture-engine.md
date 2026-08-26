# Phase 04: PWA → capture-engine Customer Request

**Date**: 2026-08-26  
**Phase**: 04 (Customer Requests)  
**Relationship**: apps/web-whisper-pwa → packages/lib/capture-engine  
**Customer Document**: `packages/lib/capture-engine/customers/web-whisper-pwa.md`

## Relationship Summary

The Web Whisper PWA is the primary customer of capture-engine. The PWA orchestrates recording sessions by calling capture-engine's `startCapture` interface when the user taps "Start Recording", subscribing to chunk-encoded events to update UI, and handling capture errors to display user-facing error messages.

## Customer Request Content

The PWA's customer request in `packages/lib/capture-engine/customers/web-whisper-pwa.md` specifies:

- **`startCapture(sessionId)` interface**: Called when user taps "Start Recording" button. PWA passes session ID (from prior session-store `createSession` call). Returns capture handle with `stop()` method.

- **Event subscriptions**: PWA subscribes to `chunkEncoded`, `captureError`, `captureStopped`, and `durationUpdate` events to update recording UI in real-time.

- **Mic ghost detection expectations**: Watchdog timer (10s) cancels after first chunk encodes. If no chunks encoded within 10s, capture-engine emits `captureError('mic_ghost')` → PWA stops recording and displays error toast.

- **Final chunk flush expectation**: When user taps "Stop Recording", PWA calls `handle.stop()` → capture-engine flushes remaining PCM buffer as final chunk (< 4s duration).

- **Error handling patterns**: All errors emitted as events (NOT thrown exceptions). PWA displays error toasts for `mic_ghost`, `quota_exceeded`, `mic_permission_denied`, `watchdog_timeout`.

- **Session-store integration delegation**: PWA does NOT call session-store `writeChunk` directly. Capture-engine writes chunks to session-store during recording. PWA only creates session (before recording) and reads sessions (after recording).

## Phase 05 Follow-Up

Phase 05 producer-response agent will write capture-engine's response in the same customer document, confirming how it will meet the PWA's request.
