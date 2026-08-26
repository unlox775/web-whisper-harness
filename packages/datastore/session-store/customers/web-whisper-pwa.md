# Customer: apps/web-whisper-pwa

The Web Whisper PWA is the primary customer of session-store. The PWA calls session-store for all session/chunk/snip/transcript operations: creating sessions, listing sessions, reading session details, deleting sessions, enforcing retention policy, getting storage stats.

## Producer's Understanding of This Customer

**Identity**: The Web Whisper PWA is the primary customer and orchestrator of session-store. The PWA is the end-user-facing iPhone Progressive Web App that manages the full recording-to-transcription workflow. It calls session-store for all session-level operations: creating sessions, listing sessions, reading session details, deleting sessions, enforcing retention policy, and getting storage stats.

**Core need**: High-level session management and storage governance. The PWA needs session-store to provide a clean, reliable interface for managing recording sessions as user-facing artifacts. The PWA displays session cards on the home screen, session detail views with playback controls, and storage usage in settings. It orchestrates the workflow: create session → pass to capture-engine → display session list → open session → read chunks/snips/transcripts → transcribe → write transcripts → enforce retention policy.

**When PWA calls session-store**:

1. **User taps "Start Recording"**:
   - PWA calls `createSession()` → session-store creates new session in IndexedDB → returns session ID
   - PWA passes session ID to capture-engine's `startCapture(sessionId)`
   - Capture-engine writes chunks via `writeChunk` (NOT called by PWA directly)

2. **Home screen loads or refreshes**:
   - PWA calls `listSessions({limit: 100, offset: 0})` → session-store queries sessions via by-createdAt index DESC → returns session list sorted by most recent first
   - PWA displays session cards with: createdAt timestamp, duration, size, chunk count, volume/snips/transcripts indicators

3. **User taps session card to open detail view**:
   - PWA calls `getSession(sessionId)` → session-store reads session metadata → returns `{id, createdAt, duration, chunkCount, sizeBytes, hasVolumeProfile, hasSnips, hasTranscript}` or null
   - PWA calls `getChunksForSession(sessionId)` → session-store queries chunks via by-sessionId-seq index ASC → returns chunk list (NO blobs, metadata only)
   - PWA calls `getSnipsForSession(sessionId)` → session-store queries snips via by-sessionId index → returns snip list sorted by startTime
   - PWA calls `getTranscriptsForSession(sessionId)` → session-store queries transcripts via by-sessionId index → returns transcript list
   - PWA displays session detail screen with: playback controls (calls playback-engine, not session-store), snip list, transcript text

4. **User taps "Delete" on session card**:
   - PWA shows confirm dialog ("Delete this recording?")
   - If confirmed → PWA calls `deleteSession(sessionId)` → session-store cascades delete (transcripts → snips → volume-profile → chunks → session) → returns confirmation
   - PWA removes session card from home screen, updates storage stats

5. **After recording completes (PWA orchestration)**:
   - PWA calls `getStorageStats()` → session-store calculates usedBytes, returns stats
   - PWA calls `enforceRetentionPolicy(capBytes)` → session-store deletes oldest sessions until usedBytes <= capBytes → returns summary
   - PWA optionally displays toast notification ("1 old session deleted to free space")

6. **Settings screen loads**:
   - PWA calls `getStorageStats()` → session-store returns `{usedBytes, capBytes, sessionCount, chunkCount}`
   - PWA displays "Storage: 45 MB / 200 MB (22%)" chip
   - PWA displays "5 sessions, 72 chunks" detail text

7. **After transcription completes (PWA orchestration)**:
   - PWA receives transcript text from transcription-client
   - PWA calls `writeTranscript(snipId, transcriptText)` → session-store validates snipId exists, writes transcript, updates session.hasTranscript = true → returns confirmation
   - PWA updates session card UI to show "Transcripts? ✓"

**Inputs PWA will provide**:
- `sessionId: string` (from createSession return value or session list)
- `snipId: string` (from getSnipsForSession return value)
- `transcriptText: string` (from transcription-client)
- `capBytes: number` (storage cap setting from PWA's localStorage, e.g., 200 MB default or user-configured value)
- `options: {limit?: number, offset?: number}` (for listSessions pagination if > 100 sessions)

**Outputs PWA expects**:

1. **createSession()** → `{id: string}` or error `{error: "database_unavailable"}`
2. **listSessions(options)** → `{sessions: [{id, createdAt, duration, chunkCount, sizeBytes, hasVolumeProfile, hasSnips, hasTranscript}], total: number}` (sorted by createdAt desc) or error `{error: "database_unavailable"}`
3. **getSession(sessionId)** → `{id, createdAt, updatedAt, duration, chunkCount, sizeBytes, hasVolumeProfile, hasSnips, hasTranscript}` or null if not found
4. **getChunksForSession(sessionId)** → `{chunks: [{id, sessionId, seq, startTime, endTime, duration, sizeBytes}]}` (NO blobs for performance, sorted by seq asc) or error `{error: "database_unavailable"}`
5. **getSnipsForSession(sessionId)** → `{snips: [{id, sessionId, startChunkIndex, endChunkIndex, startTime, endTime, duration, chunkIds, confidence, createdAt}]}` (sorted by startTime asc) or error `{error: "database_unavailable"}`
6. **getTranscriptsForSession(sessionId)** → `{transcripts: [{snipId, sessionId, text, createdAt, updatedAt}]}` or error `{error: "database_unavailable"}`
7. **deleteSession(sessionId)** → `{deleted: true}` or error `{error: "session_not_found"}` or error `{error: "database_unavailable"}`
8. **getStorageStats()** → `{usedBytes: number, capBytes: number, sessionCount: number, chunkCount: number}` or error `{error: "database_unavailable"}`
9. **enforceRetentionPolicy(capBytes)** → `{deletedSessions: number, reclaimedBytes: number, newUsedBytes: number}` or error `{error: "database_unavailable"}`
10. **writeTranscript(snipId, transcriptText)** → `{written: true}` or error `{error: "snip_not_found"}` or error `{error: "database_unavailable"}`

**Error handling expectations**:

PWA will check return values for error field. If error exists:
- `database_unavailable`: Display user-facing error toast "Storage unavailable. Check browser storage permissions."
- `session_not_found`: Display error toast "Session not found. It may have been deleted."
- `snip_not_found`: Display error toast "Snip not found. Cannot write transcript."
- `quota_exceeded` (from writeChunk, not called by PWA directly): Capture-engine emits `captureError`, PWA displays error toast "Storage full. Delete old sessions to free space."

Session-store must return error objects (NOT throw exceptions) so PWA can handle gracefully without crashing.

**Pagination expectations**:

PWA will call `listSessions({limit: 100, offset: 0})` by default. If `total > 100`, PWA may implement "Load More" button → call `listSessions({limit: 100, offset: 100})` → append next 100 sessions to list.

Session-store must:
- Sort sessions by createdAt desc (most recent first)
- Return `total` field (total session count, NOT limited to current page)
- Apply limit/offset correctly (skip first `offset` sessions, return next `limit` sessions)

**Performance expectations**:

- `listSessions` should return quickly for typical session counts (< 100 sessions: < 100ms, 100–1000 sessions: < 500ms). Use IndexedDB by-createdAt index for efficient sorted scan.
- `getSession` should be fast (< 50ms) since it is a single-record read by primary key.
- `getChunksForSession` should return metadata only (NO blobs) for performance. PWA will call playback-engine to fetch/play blobs when needed.
- `deleteSession` cascade delete may take longer (100–500ms for large sessions with many chunks/snips/transcripts) but is acceptable since it is infrequent user action with confirm dialog.

**Data format expectations**:

All timestamps should be ISO 8601 strings (e.g., "2026-08-26T15:20:37.000Z") or Unix milliseconds (e.g., 1724687437000). PWA will format timestamps for display (e.g., "Aug 26, 2026 3:20 PM").

Session size should be in bytes (number). PWA will format for display (e.g., "1.2 MB", "450 KB").

Session duration should be in seconds (number, float). PWA will format for display (e.g., "12.5s", "1m 23s").

**What PWA does NOT do directly**:

- Does NOT call `writeChunk` (capture-engine does that during recording)
- Does NOT call `writeVolumeProfile` or `writeSnip` (volume-analyzer does that post-recording)
- Does NOT call `getChunk` for playback (playback-engine does that; PWA calls playback-engine, which calls session-store's getChunk internally)

**Orchestration flow** (PWA's role):

1. User taps "Start Recording" → PWA calls createSession → PWA calls capture-engine.startCapture(sessionId) → capture-engine writes chunks → user taps "Stop" → capture-engine stops → PWA calls getStorageStats → PWA calls enforceRetentionPolicy if needed
2. After recording → PWA calls volume-analyzer.analyzeChunks(sessionId) → volume-analyzer writes volume profile + snips
3. If Groq key valid → PWA calls volume-analyzer.proposeSnips(sessionId) → PWA calls transcription-client.transcribeSnip(snipAudioBlob) for each snip → PWA calls writeTranscript(snipId, transcriptText) for each transcript
4. User opens home screen → PWA calls listSessions → displays session cards
5. User opens session detail → PWA calls getSession + getChunksForSession + getSnipsForSession + getTranscriptsForSession → displays detail view
6. User taps "Delete" → PWA calls deleteSession → removes card from home screen

**Summary**: PWA is the primary orchestrator customer. It needs high-level session management (create, list, read, delete), storage governance (stats, retention policy), and transcript writes (after transcription-client completes). PWA does NOT directly write chunks/volume-profiles/snips (lib packages do those). Session-store must provide clean error returns (not exceptions), efficient listSessions with pagination, fast single-record reads, and reliable cascade deletes. PWA displays session-store data to end users as session cards, detail views, and storage stats.

## Customer Request

(To be filled by Phase 04 customer-request agent for web-whisper-pwa → session-store)

The PWA customer will write its request here: exact interfaces it needs (createSession, getSession, listSessions, deleteSession, getChunksForSession, getSnipsForSession, getTranscriptsForSession, getStorageStats, enforceRetentionPolicy), error handling expectations (what errors are possible, how to recover), performance expectations (how fast should listSessions return for 100 sessions, should it paginate), data format expectations (session metadata structure, chunk structure, snip structure, transcript structure).

## Producer Response

(To be filled by Phase 05 producer-response agent for session-store)

Session-store will respond here: how it will meet the PWA's request, what interfaces it will provide, what error formats it will return, how it will implement pagination for large session lists, what data formats it will use, and how it will ensure referential integrity (session exists before chunks/snips/transcripts written).
