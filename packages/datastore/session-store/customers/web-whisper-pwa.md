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

I'm the Web Whisper PWA. I need session-store to be the single source of truth for all session data and to provide clean, high-level interfaces for managing recording sessions as user-facing artifacts. Session-store governs all durable data. Here's what I need:

### Core Interfaces I Need

**`createSession()`** (when user taps "Start Recording")

When I call it: User taps red "Start Recording" button on home screen

Input: None (session-store generates unique ID + createdAt timestamp)

Output I expect:
- Success: `{id: string}` (e.g., `{id: "sess_20260826152037_abc123"}`)
- Failure: `{error: 'database_unavailable', reason?: string}`

How I use it:
- I call `createSession()` immediately when user taps "Start Recording"
- I receive session ID back
- I pass that session ID to `capture-engine.startCapture(sessionId)`
- Capture-engine writes chunks to that session (I do NOT call `writeChunk` directly)
- Session is now visible in home screen session list immediately (even if no chunks yet)

**`listSessions(options?)`** (home screen load/refresh)

When I call it: Home screen loads, user pulls to refresh, user navigates back to home from detail view

Input: `options?: {limit?: number, offset?: number}` (default: `{limit: 100, offset: 0}`)

Output I expect:
```javascript
{
  sessions: [
    {
      id: string,
      createdAt: string, // ISO 8601 or Unix ms
      duration: number, // seconds (float)
      chunkCount: number,
      sizeBytes: number, // total size of all chunks
      hasVolumeProfile: boolean,
      hasSnips: boolean,
      hasTranscript: boolean
    },
    // ... more sessions
  ],
  total: number // total session count (not limited to current page)
}
```

Sorting requirement: **MUST be sorted by createdAt DESC** (most recent first). I display session cards top-to-bottom, newest first.

Failure: `{error: 'database_unavailable', reason?: string}`

How I use it:
- Default call: `listSessions()` → returns first 100 sessions
- If `total > 100`, I show "Load More" button → call `listSessions({limit: 100, offset: 100})` → append next 100 to list
- I display each session as a card with: formatted timestamp, formatted duration, formatted size, indicators (🔊 if hasVolumeProfile, ✂️ if hasSnips, 📝 if hasTranscript)

**`getSession(sessionId)`** (session detail view load)

When I call it: User taps session card to open detail view

Input: `sessionId: string` (from session card)

Output I expect:
- Success: `{id: string, createdAt: string, updatedAt: string, duration: number, chunkCount: number, sizeBytes: number, hasVolumeProfile: boolean, hasSnips: boolean, hasTranscript: boolean}`
- Not found: `null`
- Failure: `{error: 'database_unavailable', reason?: string}`

How I use it:
- I check if return value is `null` → show error toast "Session not found. It may have been deleted." → navigate back to home
- If session exists → display session detail header with full metadata
- I use `hasVolumeProfile`, `hasSnips`, `hasTranscript` flags to decide which detail sections to display

**`getChunksForSession(sessionId)`** (session detail view, playback preparation)

When I call it: User opens session detail view (I need to display chunk list in developer mode)

Input: `sessionId: string`

Output I expect:
```javascript
{
  chunks: [
    {
      id: string,
      sessionId: string,
      seq: number, // 0-indexed
      startTime: number, // seconds (float)
      endTime: number, // seconds (float)
      duration: number, // seconds (float), endTime - startTime
      sizeBytes: number
      // NO BLOB for performance (playback-engine will call getChunk for blobs)
    },
    // ... more chunks, sorted by seq ASC
  ]
}
```

Failure: `{error: 'database_unavailable', reason?: string}`

Critical requirement: **NO BLOBS in return value**. Returning blobs would be too slow for sessions with 100+ chunks. I only need metadata. Playback-engine will call `getChunk(chunkId)` separately to fetch blobs for playback.

How I use it:
- In developer mode: Display chunk list in detail view (seq, startTime, duration, size)
- Not in developer mode: I still call it to prepare playback (check chunkCount > 0 before showing play button)

**`getSnipsForSession(sessionId)`** (session detail view snip list)

When I call it: User opens session detail view after snips exist (after volume-analyzer completes)

Input: `sessionId: string`

Output I expect:
```javascript
{
  snips: [
    {
      id: string,
      sessionId: string,
      startTime: number, // seconds (float)
      endTime: number, // seconds (float)
      duration: number, // seconds (float)
      chunkIds: string[], // IDs of chunks this snip spans
      confidence: number, // 0.0–1.0
      createdAt: string // ISO 8601 or Unix ms
    },
    // ... more snips, sorted by startTime ASC
  ]
}
```

Failure: `{error: 'database_unavailable', reason?: string}`

How I use it:
- Display snip list in session detail (one row per snip: "Snip 1: 0:00–0:15 (15s)")
- Each snip row has "Play" button (calls `playback-engine.playSnip(snipId)`)
- Each snip row has "Transcribe" button if no transcript yet (calls `transcription-client.transcribeAudio(snipAudioBlob)`)
- If snips list is empty, I hide snips section or show "No snips detected" message

**`getTranscriptsForSession(sessionId)`** (session detail view transcript display)

When I call it: User opens session detail view after transcripts exist (after transcription-client completes + I call writeTranscript)

Input: `sessionId: string`

Output I expect:
```javascript
{
  transcripts: [
    {
      snipId: string,
      sessionId: string,
      text: string, // transcript text from Groq
      createdAt: string, // ISO 8601 or Unix ms
      updatedAt: string // ISO 8601 or Unix ms
    },
    // ... more transcripts (one per snip)
  ]
}
```

Failure: `{error: 'database_unavailable', reason?: string}`

How I use it:
- Display transcript text in session detail (one paragraph per transcript, labeled "Snip 1: [text]")
- If transcripts list is empty, I show "No transcripts" message or hide transcript section
- I may implement copy-to-clipboard button for each transcript

**`writeTranscript(snipId, transcriptText)`** (after transcription-client completes)

When I call it: Transcription-client returns transcript text for a snip, I write it to session-store

Input: `snipId: string`, `transcriptText: string`

Output I expect:
- Success: `{written: true}`
- Snip not found: `{error: 'snip_not_found', snipId: string}`
- Failure: `{error: 'database_unavailable', reason?: string}`

How I use it:
- After `transcription-client.transcribeAudio(snipAudioBlob)` resolves with `{text: string}`
- I call `writeTranscript(snipId, transcriptText)`
- If success → update session card to show "Transcripts? ✓" indicator
- If `snip_not_found` error → show error toast "Snip not found. Cannot save transcript."
- If `database_unavailable` error → show error toast "Storage unavailable. Transcript not saved."

**`deleteSession(sessionId)`** (user deletes session)

When I call it: User taps "Delete" button on session card, confirms deletion in dialog

Input: `sessionId: string`

Output I expect:
- Success: `{deleted: true}`
- Not found: `{error: 'session_not_found', sessionId: string}`
- Failure: `{error: 'database_unavailable', reason?: string}`

How I use it:
- Show confirm dialog: "Delete this recording? This cannot be undone."
- If user confirms → call `deleteSession(sessionId)`
- If success → remove session card from home screen, call `getStorageStats()` to update storage display
- If `session_not_found` → show error toast "Session not found. It may have been deleted already." (then remove card anyway, since it's gone)
- If `database_unavailable` → show error toast "Storage unavailable. Cannot delete session."

Cascade delete requirement: **Session-store MUST cascade delete all related data**: transcripts → snips → volume-profile → chunks → session. I should NOT have to call separate delete functions for chunks/snips/transcripts. One `deleteSession(sessionId)` call deletes everything.

**`getStorageStats()`** (settings screen, post-recording retention check)

When I call it: 
- Settings screen loads (user taps ⚙️ icon)
- After recording stops (to check if retention policy needs enforcement)
- After session deletion (to update storage display)

Input: None

Output I expect:
```javascript
{
  usedBytes: number, // total size of all chunks across all sessions
  capBytes: number, // storage cap from settings (e.g., 200 MB default)
  sessionCount: number, // total number of sessions
  chunkCount: number // total number of chunks across all sessions
}
```

Failure: `{error: 'database_unavailable', reason?: string}`

How I use it:
- Settings screen: Display "Storage: 45 MB / 200 MB (22%)" chip
- Settings screen: Display "5 sessions, 72 chunks" detail text
- Post-recording: Check if `usedBytes > capBytes` → call `enforceRetentionPolicy(capBytes)` automatically

**`enforceRetentionPolicy(capBytes)`** (automatic retention after recording)

When I call it: After recording stops, if `getStorageStats()` shows `usedBytes > capBytes`

Input: `capBytes: number` (storage cap setting from PWA's localStorage, e.g., 200 MB = 200 * 1024 * 1024 = 209715200 bytes)

Output I expect:
```javascript
{
  deletedSessions: number, // how many sessions were deleted
  reclaimedBytes: number, // how much space was freed
  newUsedBytes: number // new usedBytes after deletion
}
```

Failure: `{error: 'database_unavailable', reason?: string}`

How I use it:
- After recording stops → call `getStorageStats()`
- If `usedBytes > capBytes` → call `enforceRetentionPolicy(capBytes)`
- If `deletedSessions > 0` → show toast notification: "Deleted {deletedSessions} old session(s) to free space"
- Update home screen session list (removed sessions no longer appear)
- Update storage stats display in settings

Deletion order requirement: **Session-store MUST delete oldest sessions first** (sorted by createdAt ASC, delete until usedBytes <= capBytes). I do NOT want newest sessions deleted.

### Error Handling Patterns

**Pre-operation errors** (before operation starts):
- `{error: 'database_unavailable'}` → I show error toast "Storage unavailable. Check browser storage permissions." + log error to console
- `{error: 'session_not_found'}` → I show error toast "Session not found. It may have been deleted." + remove stale session card from UI
- `{error: 'snip_not_found'}` → I show error toast "Snip not found. Cannot save transcript." + log error to console

Session-store MUST return error objects (NOT throw exceptions). If session-store throws exception, my PWA crashes. Return structured errors so I can handle gracefully.

**IndexedDB quota exceeded** (during write operations like `writeChunk`, `writeTranscript`):
- Session-store returns `{error: 'quota_exceeded', attemptedBytes?: number}`
- I show error toast "Storage full. Delete old sessions to free space."
- I may automatically call `enforceRetentionPolicy(capBytes)` and retry write (one retry only, to avoid infinite loop)

**Null return values**:
- `getSession(sessionId)` returns `null` if session does not exist → I treat this as "not found" error + navigate back to home
- Do NOT return `{error: 'session_not_found'}` for `getSession` (null is cleaner for single-record reads)

### Performance Expectations

- `createSession()`: < 50ms (single IndexedDB write, primary key insert)
- `listSessions({limit: 100})`: < 100ms for typical session counts (< 100 sessions), < 500ms for large session counts (100–1000 sessions)
  - Use IndexedDB by-createdAt index for efficient sorted scan
  - Do NOT load all sessions into memory then sort in JavaScript (too slow for 1000+ sessions)
- `getSession(sessionId)`: < 50ms (single IndexedDB read by primary key)
- `getChunksForSession(sessionId)`: < 100ms for typical chunk counts (< 30 chunks), < 500ms for large chunk counts (30–100 chunks)
  - Use IndexedDB by-sessionId-seq index for efficient query
  - **NO BLOBS in return value** (huge performance issue if blobs included)
- `getSnipsForSession(sessionId)`: < 100ms (typical session has 0–10 snips)
- `getTranscriptsForSession(sessionId)`: < 100ms (typical session has 0–10 transcripts)
- `deleteSession(sessionId)`: 100–500ms for large sessions (cascade delete many chunks/snips/transcripts is slower, but acceptable since infrequent user action with confirm dialog)
- `getStorageStats()`: < 200ms (aggregate calculation over all sessions/chunks)
- `enforceRetentionPolicy(capBytes)`: 500–2000ms (deletes multiple sessions, acceptable since automatic background operation or triggered by user in settings)

If listSessions takes > 500ms for 100 sessions, home screen feels sluggish. Optimize with IndexedDB indexes.

### Data Format Expectations

**Timestamps**: ISO 8601 strings (e.g., `"2026-08-26T15:20:37.000Z"`) OR Unix milliseconds (e.g., `1724687437000`). I will format for display (e.g., "Aug 26, 2026 3:20 PM"). Session-store should be consistent (pick one format, use it everywhere).

**Sizes**: Bytes (number). I will format for display (e.g., "1.2 MB", "450 KB", "12.5 MB"). Session-store returns raw bytes.

**Durations**: Seconds (number, float). I will format for display (e.g., "12.5s", "1m 23s", "45m 12s"). Session-store returns raw seconds.

**Session ID format**: String with prefix `sess_` + timestamp + random suffix (e.g., `sess_20260826152037_abc123`). Session-store generates unique IDs (I do NOT provide IDs).

**Chunk ID format**: String with prefix `chunk_` + session ID + seq (e.g., `chunk_sess_20260826152037_abc123_000`). Session-store generates unique IDs.

**Snip ID format**: String with prefix `snip_` + session ID + index (e.g., `snip_sess_20260826152037_abc123_0`). Session-store generates unique IDs.

### What I Do NOT Call Directly

- `writeChunk(sessionId, seq, audioBlob, startTime, endTime)` → Capture-engine calls this during recording (I do NOT call it)
- `writeVolumeProfile(sessionId, volumeProfile)` → Volume-analyzer calls this post-recording (I do NOT call it)
- `writeSnip(sessionId, snipData)` → Volume-analyzer calls this after snip proposal (I do NOT call it)
- `getChunk(chunkId)` → Playback-engine calls this to fetch chunk blobs for playback (I do NOT call it; I call `playback-engine.playSession(sessionId)` which internally calls `getChunk`)

I am the orchestrator, but I delegate chunk/volume/snip writes to lib packages. I only write transcripts (after transcription-client completes).

### Session-Store Data Integrity Requirements

**Referential integrity**:
- Session must exist before chunks/volume-profile/snips/transcripts can be written
- Snip must exist before transcript can be written
- Cascade delete must maintain integrity (no orphan chunks/snips/transcripts after session deletion)

**Session metadata consistency**:
- `session.duration` MUST equal sum of chunk durations (or max endTime of last chunk)
- `session.sizeBytes` MUST equal sum of chunk sizeByte values
- `session.chunkCount` MUST equal number of chunks for that session
- `session.hasVolumeProfile` MUST be true if volume-profile exists for that session
- `session.hasSnips` MUST be true if any snips exist for that session
- `session.hasTranscript` MUST be true if any transcripts exist for that session

Session-store MUST update session metadata when chunks/snips/transcripts are written. I should NOT have to manually update session metadata (session-store owns that).

### Isolation Demo → session-store Requirements

(Separate customer document covers this, but briefly: Isolation Demo needs read-only access to all session-store interfaces to display live data in demo UI. Isolation Demo does NOT write sessions/chunks/snips/transcripts; it only reads.)

### Summary of Interfaces

| Interface | Input | Output | Failure Result |
|-----------|-------|--------|----------------|
| `createSession()` | None | `{id: string}` | `{error: 'database_unavailable'}` |
| `listSessions(options?)` | `{limit?: number, offset?: number}` | `{sessions: [...], total: number}` | `{error: 'database_unavailable'}` |
| `getSession(sessionId)` | sessionId (string) | Session object or `null` | `{error: 'database_unavailable'}` |
| `getChunksForSession(sessionId)` | sessionId (string) | `{chunks: [...]}` (NO blobs) | `{error: 'database_unavailable'}` |
| `getSnipsForSession(sessionId)` | sessionId (string) | `{snips: [...]}` | `{error: 'database_unavailable'}` |
| `getTranscriptsForSession(sessionId)` | sessionId (string) | `{transcripts: [...]}` | `{error: 'database_unavailable'}` |
| `writeTranscript(snipId, text)` | snipId (string), text (string) | `{written: true}` | `{error: 'snip_not_found'}` or `{error: 'database_unavailable'}` |
| `deleteSession(sessionId)` | sessionId (string) | `{deleted: true}` | `{error: 'session_not_found'}` or `{error: 'database_unavailable'}` |
| `getStorageStats()` | None | `{usedBytes, capBytes, sessionCount, chunkCount}` | `{error: 'database_unavailable'}` |
| `enforceRetentionPolicy(capBytes)` | capBytes (number) | `{deletedSessions, reclaimedBytes, newUsedBytes}` | `{error: 'database_unavailable'}` |

All pre-operation errors returned as structured objects (NOT thrown exceptions). Runtime errors during IndexedDB operations should be caught and returned as `{error: 'database_unavailable', reason: string}` with specific reason.

## Producer Response

(To be filled by Phase 05 producer-response agent for session-store)

Session-store will respond here: how it will meet the PWA's request, what interfaces it will provide, what error formats it will return, how it will implement pagination for large session lists, what data formats it will use, and how it will ensure referential integrity (session exists before chunks/snips/transcripts written).
