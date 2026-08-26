# Customer: apps/web-whisper-pwa

The Web Whisper PWA is the primary customer of session-store. The PWA calls session-store for all session/chunk/snip/transcript operations: creating sessions, listing sessions, reading session details, deleting sessions, enforcing retention policy, getting storage stats.

## Producer's Understanding of This Customer

(To be filled by Phase 03 product-spec agent for session-store)

The PWA needs session-store to:
- Create sessions (user taps "Start Recording" → PWA calls `createSession()` → returns session ID → PWA passes to capture-engine)
- List sessions (home screen session list → PWA calls `listSessions()` → displays session cards with createdAt, duration, size)
- Read session details (user taps session card → PWA calls `getSession(sessionId)` + `getChunksForSession(sessionId)` + `getSnipsForSession(sessionId)` + `getTranscriptsForSession(sessionId)` → displays session detail screen with playback controls, transcript text)
- Delete sessions (user taps "Delete" button on session card → PWA calls `deleteSession(sessionId)` → session + all chunks + volume profile + snips + transcripts deleted)
- Enforce retention policy (after recording completes → PWA calls `enforceRetentionPolicy()` → deletes oldest sessions if storage quota exceeded)
- Get storage stats (settings screen → PWA calls `getStorageStats()` → displays "1.2 MB / 200 MB" storage usage chip)

The PWA does NOT directly write chunks, volume profiles, snips, or transcripts (lib packages do those):
- Capture-engine writes chunks during recording (`writeChunk` called by capture-engine, not PWA)
- Volume-analyzer writes volume profiles + snips after recording (`writeVolumeProfile`, `writeSnip` called by volume-analyzer, not PWA)
- PWA writes transcripts after transcription-client returns text (`writeTranscript` called by PWA after `transcribeAudio` completes)

## Customer Request

(To be filled by Phase 04 customer-request agent for web-whisper-pwa → session-store)

The PWA customer will write its request here: exact interfaces it needs (createSession, getSession, listSessions, deleteSession, getChunksForSession, getSnipsForSession, getTranscriptsForSession, getStorageStats, enforceRetentionPolicy), error handling expectations (what errors are possible, how to recover), performance expectations (how fast should listSessions return for 100 sessions, should it paginate), data format expectations (session metadata structure, chunk structure, snip structure, transcript structure).

## Producer Response

(To be filled by Phase 05 producer-response agent for session-store)

Session-store will respond here: how it will meet the PWA's request, what interfaces it will provide, what error formats it will return, how it will implement pagination for large session lists, what data formats it will use, and how it will ensure referential integrity (session exists before chunks/snips/transcripts written).
