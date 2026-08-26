# Phase 04: PWA → session-store Customer Request

**Date**: 2026-08-26  
**Phase**: 04 (Customer Requests)  
**Relationship**: apps/web-whisper-pwa → packages/datastore/session-store  
**Customer Document**: `packages/datastore/session-store/customers/web-whisper-pwa.md`

## Relationship Summary

The PWA is the primary orchestrator customer of session-store. The PWA calls session-store for all session-level operations: creating sessions, listing sessions, reading session details, deleting sessions, enforcing retention policy, and getting storage stats. Session-store is the single source of truth for all durable session data.

## Customer Request Content

The PWA's customer request in `packages/datastore/session-store/customers/web-whisper-pwa.md` specifies:

- **`createSession()` interface**: Called when user taps "Start Recording". Returns `{id: string}`. PWA passes session ID to capture-engine's `startCapture(sessionId)`. Session visible in home screen session list immediately (even if no chunks yet).

- **`listSessions(options?)` interface**: Called when home screen loads or refreshes. Returns session list sorted by createdAt DESC (most recent first). PWA displays session cards with metadata (timestamp, duration, size, indicators for volume/snips/transcripts).

- **`getSession(sessionId)` interface**: Called when user opens session detail view. Returns session metadata or null. PWA uses metadata to populate session detail header.

- **`getChunksForSession(sessionId)` interface**: Called in session detail view for chunk list display (developer mode). Returns chunk metadata only (NO blobs for performance). PWA passes chunk list to playback-engine.

- **`getSnipsForSession(sessionId)` interface**: Called in session detail view for snip list display. Returns snip list sorted by startTime. PWA displays snips with "Play" and "Transcribe" buttons.

- **`getTranscriptsForSession(sessionId)` interface**: Called in session detail view for transcript display. Returns transcript list. PWA displays transcript text (one paragraph per transcript).

- **`writeTranscript(snipId, transcriptText)` interface**: Called after transcription-client returns transcript text. PWA writes transcript to session-store, updates session card to show "Transcripts? ✓" indicator.

- **`deleteSession(sessionId)` interface**: Called when user taps "Delete" button on session card, confirms deletion in dialog. Session-store MUST cascade delete all related data (transcripts → snips → volume-profile → chunks → session).

- **`getStorageStats()` interface**: Called in settings screen load, post-recording retention check, post-deletion. Returns `{usedBytes, capBytes, sessionCount, chunkCount}`. PWA displays "Storage: 45 MB / 200 MB (22%)".

- **`enforceRetentionPolicy(capBytes)` interface**: Called post-recording if `usedBytes > capBytes`. Session-store MUST delete oldest sessions first (sorted by createdAt ASC) until `usedBytes <= capBytes`. PWA displays toast: "Deleted N old session(s) to free space".

- **Data format expectations**: Timestamps as ISO 8601 strings or Unix ms. Sizes in bytes. Durations in seconds (float). Session-store should be consistent (pick one format, use everywhere).

- **Performance expectations**: `listSessions` < 100ms for < 100 sessions, `getSession` < 50ms, `deleteSession` 100–500ms (cascade delete acceptable since infrequent user action).

## Phase 05 Follow-Up

Phase 05 producer-response agent will write session-store's response in the same customer document, confirming how it will meet the PWA's request.
