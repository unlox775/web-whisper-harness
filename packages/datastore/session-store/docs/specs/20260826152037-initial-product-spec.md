Spec Status: unresolved
Spec Type: initial-product-spec
Created: 2026-08-26T15:20:37Z
Product: packages/datastore/session-store

# Session Store — Initial Product Spec

## Product Goal

Provide IndexedDB schema and durable storage authority for all Web Whisper data. Owns sessions, chunks, volume profiles, snips, transcripts. Enforces retention policy (storage cap, deletion). Does NOT implement capture, volume analysis, transcription, or playback logic (lib packages do those).

## Boundary

- **Owns**: IndexedDB schema (database "web-whisper-db", object stores: sessions, chunks, volume-profiles, snips, transcripts), all create/read/update/delete operations, storage quota enforcement (200 MB default cap, configurable via PWA settings), retention policy (delete oldest sessions when quota exceeded), data integrity (session existence validation before chunk/snip/transcript writes, referential integrity for chunks/snips/transcripts pointing to sessions)
- **Does NOT own**: Audio capture logic (capture-engine), volume computation logic (volume-analyzer), transcription logic (transcription-client), playback logic (playback-engine), UI (PWA), settings persistence (PWA uses localStorage or separate IndexedDB table for settings)

## IndexedDB Schema

**Database name**: `web-whisper-db` (production), `web-whisper-sandbox-db` (Isolation Demo)

**Object stores**:

1. **sessions**
   - Key path: `id`
   - Indexes:
     - `by-createdAt`: index on `createdAt` field (for sorting in listSessions)
   - Schema: `{id, createdAt, updatedAt, duration, chunkCount, sizeBytes, hasVolumeProfile, hasSnips, hasTranscript}`

2. **chunks**
   - Key path: `id`
   - Indexes:
     - `by-sessionId`: index on `sessionId` field (for getChunksForSession queries)
     - `by-sessionId-seq`: compound index on `[sessionId, seq]` (for ordered chunk reads)
   - Schema: `{id, sessionId, seq, startTime, endTime, duration, blob, sizeBytes}`

3. **volume-profiles**
   - Key path: `sessionId` (one volume profile per session)
   - Schema: `{sessionId, chunkVolumes: [{chunkId, peakDb}], createdAt}`

4. **snips**
   - Key path: `id`
   - Indexes:
     - `by-sessionId`: index on `sessionId` field (for getSnipsForSession queries)
   - Schema: `{id, sessionId, startChunkIndex, endChunkIndex, startTime, endTime, duration, chunkIds: [], confidence, createdAt}`

5. **transcripts**
   - Key path: `snipId` (one transcript per snip, snipId is the key)
   - Indexes:
     - `by-sessionId`: index on `sessionId` field (for getTranscriptsForSession queries)
   - Schema: `{snipId, sessionId, text, createdAt, updatedAt}`

**ID generation**: Use UUIDs (or timestamp + random suffix) for session IDs, chunk IDs, snip IDs. Snip ID becomes the transcript key.

## Main Interfaces

### Session Operations

**`createSession()` → session ID**
- Input: none (or optional metadata like user-provided title)
- Output: `{id: string}` (newly created session ID)
- Store changed: sessions (inserts new session record with createdAt = now, duration = 0, chunkCount = 0, sizeBytes = 0, hasVolumeProfile = false, hasSnips = false, hasTranscript = false)
- Failure: IndexedDB open failure → return error `{error: "database_unavailable"}`

**`getSession(sessionId)` → session metadata**
- Input: `sessionId: string`
- Output: `{id, createdAt, updatedAt, duration, chunkCount, sizeBytes, hasVolumeProfile, hasSnips, hasTranscript}` or null if not found
- Store read: sessions (reads one session by id)
- Failure: session not found → return null (NOT an error, PWA checks `if (session === null)`)

**`listSessions(options)` → session list**
- Input: `options: {limit?: number, offset?: number}` (default limit = 100, offset = 0 for pagination)
- Output: `{sessions: [{id, createdAt, duration, chunkCount, sizeBytes, hasVolumeProfile, hasSnips, hasTranscript}], total: number}` (sessions sorted by createdAt desc, most recent first)
- Store read: sessions (index scan via by-createdAt index, DESC order)
- Failure: IndexedDB failure → return error `{error: "database_unavailable"}`

**`deleteSession(sessionId)` → void**
- Input: `sessionId: string`
- Output: void (or `{deleted: true}` confirmation)
- Store changed: sessions (deletes session record), chunks (deletes all chunks with this sessionId), volume-profiles (deletes volume profile with this sessionId), snips (deletes all snips with this sessionId), transcripts (deletes all transcripts with this sessionId via by-sessionId index)
- Cascade delete order: transcripts first (depends on snips), then snips (depends on chunks), then chunks (depends on session), then volume-profiles (depends on session), then session
- Failure: session not found → return error `{error: "session_not_found"}`, IndexedDB failure → return error `{error: "database_unavailable"}`

### Chunk Operations

**`writeChunk(sessionId, chunkData)` → chunk ID**
- Input: `sessionId: string, chunkData: {seq: number, startTime: number, endTime: number, duration: number, blob: Blob, sizeBytes: number}`
- Output: `{chunkId: string}` (newly created chunk ID) or error
- Store read: sessions (validates sessionId exists before writing chunk)
- Store changed: chunks (inserts new chunk record), sessions (updates session.chunkCount += 1, session.sizeBytes += chunkData.sizeBytes, session.duration = max(session.duration, chunkData.endTime), session.updatedAt = now)
- Failure: session not found → return error `{error: "session_not_found"}`, quota exceeded → return error `{error: "quota_exceeded", usedBytes, capBytes}`, IndexedDB failure → return error `{error: "database_unavailable"}`
- Referential integrity: session MUST exist before chunk write; if not, return error (do not silently create session)

**`getChunk(chunkId)` → chunk blob + metadata**
- Input: `chunkId: string`
- Output: `{id, sessionId, seq, startTime, endTime, duration, blob, sizeBytes}` or null if not found
- Store read: chunks (reads one chunk by id)
- Failure: chunk not found → return null

**`getChunksForSession(sessionId)` → chunk list**
- Input: `sessionId: string`
- Output: `{chunks: [{id, sessionId, seq, startTime, endTime, duration, sizeBytes}]}` (chunks sorted by seq asc, NO blobs in list for performance; use getChunk to fetch blob individually)
- Store read: chunks (index scan via by-sessionId-seq compound index, ASC order on seq)
- Failure: IndexedDB failure → return error `{error: "database_unavailable"}`

### Volume Profile Operations

**`writeVolumeProfile(sessionId, volumeProfile)` → void**
- Input: `sessionId: string, volumeProfile: {chunkVolumes: [{chunkId: string, peakDb: number}]}`
- Output: void (or `{written: true}` confirmation)
- Store read: sessions (validates sessionId exists before writing volume profile)
- Store changed: volume-profiles (inserts or replaces volume profile record with sessionId as key), sessions (updates session.hasVolumeProfile = true, session.updatedAt = now)
- Failure: session not found → return error `{error: "session_not_found"}`, IndexedDB failure → return error `{error: "database_unavailable"}`

**`getVolumeProfile(sessionId)` → volume profile**
- Input: `sessionId: string`
- Output: `{sessionId, chunkVolumes: [{chunkId, peakDb}], createdAt}` or null if not found
- Store read: volume-profiles (reads one volume profile by sessionId key)
- Failure: volume profile not found → return null

### Snip Operations

**`writeSnip(sessionId, snipData)` → snip ID**
- Input: `sessionId: string, snipData: {startChunkIndex: number, endChunkIndex: number, startTime: number, endTime: number, duration: number, chunkIds: string[], confidence: number}`
- Output: `{snipId: string}` (newly created snip ID) or error
- Store read: sessions (validates sessionId exists before writing snip)
- Store changed: snips (inserts new snip record), sessions (updates session.hasSnips = true, session.updatedAt = now)
- Failure: session not found → return error `{error: "session_not_found"}`, IndexedDB failure → return error `{error: "database_unavailable"}`

**`getSnipsForSession(sessionId)` → snip list**
- Input: `sessionId: string`
- Output: `{snips: [{id, sessionId, startChunkIndex, endChunkIndex, startTime, endTime, duration, chunkIds, confidence, createdAt}]}` (snips sorted by startTime asc)
- Store read: snips (index scan via by-sessionId index, manual sort by startTime)
- Failure: IndexedDB failure → return error `{error: "database_unavailable"}`

**`getSnip(snipId)` → snip metadata + chunk IDs**
- Input: `snipId: string`
- Output: `{id, sessionId, startChunkIndex, endChunkIndex, startTime, endTime, duration, chunkIds, confidence, createdAt}` or null if not found
- Store read: snips (reads one snip by id)
- Failure: snip not found → return null

### Transcript Operations

**`writeTranscript(snipId, transcriptText)` → void**
- Input: `snipId: string, transcriptText: string`
- Output: void (or `{written: true}` confirmation)
- Store read: snips (validates snipId exists before writing transcript, also reads snip.sessionId for cross-reference)
- Store changed: transcripts (inserts or replaces transcript record with snipId as key, also stores sessionId for by-sessionId index), sessions (updates session.hasTranscript = true, session.updatedAt = now)
- Failure: snip not found → return error `{error: "snip_not_found"}`, IndexedDB failure → return error `{error: "database_unavailable"}`

**`getTranscript(snipId)` → transcript text**
- Input: `snipId: string`
- Output: `{snipId, sessionId, text, createdAt, updatedAt}` or null if not found
- Store read: transcripts (reads one transcript by snipId key)
- Failure: transcript not found → return null

**`getTranscriptsForSession(sessionId)` → transcript list**
- Input: `sessionId: string`
- Output: `{transcripts: [{snipId, sessionId, text, createdAt, updatedAt}]}` (transcripts sorted by snip startTime via joined snip query or manual sort)
- Store read: transcripts (index scan via by-sessionId index)
- Failure: IndexedDB failure → return error `{error: "database_unavailable"}`

### Storage Management

**`getStorageStats()` → storage stats**
- Input: none
- Output: `{usedBytes: number, capBytes: number, sessionCount: number, chunkCount: number}` (usedBytes = sum of all chunk sizeBytes + IndexedDB overhead estimate)
- Store read: sessions (count all sessions), chunks (count all chunks, sum all sizeBytes)
- Failure: IndexedDB failure → return error `{error: "database_unavailable"}`
- Storage cap source: PWA provides storage cap setting (stored in PWA's localStorage or separate IndexedDB settings table, NOT owned by session-store); session-store enforceRetentionPolicy receives cap as input

**`enforceRetentionPolicy(capBytes)` → retention summary**
- Input: `capBytes: number` (storage cap in bytes, provided by caller/PWA)
- Output: `{deletedSessions: number, reclaimedBytes: number, newUsedBytes: number}` (summary of what was deleted)
- Store read: sessions (fetch all sessions sorted by createdAt asc, oldest first), chunks (sum sizeBytes for current usage calculation)
- Store changed: sessions (deletes oldest sessions + cascade delete all related data until usedBytes <= capBytes)
- Algorithm:
  1. Calculate current usedBytes (sum all chunk sizeBytes)
  2. If usedBytes <= capBytes → return immediately `{deletedSessions: 0, reclaimedBytes: 0, newUsedBytes: usedBytes}`
  3. Fetch all sessions sorted by createdAt asc (oldest first)
  4. For each session (starting with oldest):
     - If usedBytes <= capBytes → stop (quota satisfied)
     - Call deleteSession(sessionId) to cascade delete session + chunks + volume-profile + snips + transcripts
     - Subtract session.sizeBytes from usedBytes
     - Increment deletedSessions counter, add session.sizeBytes to reclaimedBytes
  5. Return `{deletedSessions, reclaimedBytes, newUsedBytes: usedBytes}`
- Failure: IndexedDB failure → return error `{error: "database_unavailable"}`

## Isolation Demo

**Runtime**: Web app (local dev server, desktop browser viewport, factory floor operating surface)
**Launch**: `cd packages/datastore/session-store/isolation-demo && npm start`
**Database**: Sandbox IndexedDB (database name "web-whisper-sandbox-db", separate from production "web-whisper-db")

**Data mode**: **Sandbox writes** (all write operations go to sandbox database, NOT production database). Data persists across page reloads (proves durable storage). Operator can write sessions, chunks, volume profiles, snips, transcripts via fixture data OR via optional live integrations (capture-engine for chunks, volume-analyzer for volume profiles + snips).

**Safe default**: **Read-only inspection of labeled data modes**. The demo defaults to manual fixture data entry (click buttons to create/write, NOT live capture/analysis). Real data mode (if included via capture-engine/volume-analyzer integrations) is CLEARLY LABELED with data mode chips (e.g., "FIXTURE DATA" cyan vs "LIVE CAPTURE" orange vs "COMPUTED VOLUME" purple). Writes are isolated to sandbox database (never production).

### Isolation Demo Purpose

The Isolation Demo is a **store inspector** that proves session-store's core logic works:
1. **Schema validation**: IndexedDB database + 5 object stores + indexes exist
2. **Write operations**: Create sessions, write chunks/volume-profiles/snips/transcripts, data persists
3. **Read operations**: List sessions, read session metadata, read chunks/volume-profiles/snips/transcripts
4. **Delete operations**: Delete session with cascade delete (all related data removed)
5. **Retention policy**: Enforce storage cap, delete oldest sessions to reclaim space
6. **Storage stats**: Calculate used bytes, session count, chunk count accurately

### Panel-Based Layout (5 regions)

**See `isolation-demo/README.md` for full panel details.**

Summary:
1. **Top Chrome Panel**: Database name chip ("SANDBOX DB"), storage stats display
2. **Write Operations Panel**: Create Session button, Write Chunk button with data source toggle (Fixture / Upload / Live-from-Capture-Engine), Write Volume Profile button with data source toggle (Fixture / Compute-via-Volume-Analyzer), Write Snips button with data source toggle (Fixture / Propose-via-Volume-Analyzer), Write Transcript button with manual text input
3. **Session List Panel**: Table with session metadata (ID, Created At, Duration, Chunks, Size, Volume?, Snips?, Transcripts?), Details button to expand, Delete button, sorted by createdAt desc
4. **Storage Management Panel**: Storage cap input, Update Cap button, storage stats display, Enforce Retention Policy button, retention log
5. **Reload Test Panel**: Reload Page button, persistence status badge

**Data mode labels**:
- Fixture data: "FIXTURE DATA" (cyan chip, default mode)
- Live capture: "LIVE CAPTURE" (orange chip, if capture-engine included)
- Computed volume: "COMPUTED VOLUME" (purple chip, if volume-analyzer included)
- Manual entry: "MANUAL ENTRY" (gray chip, for transcript text input)

**Before state** (page load, sandbox DB empty):
- Session list: Empty, placeholder text "No sessions yet. Click 'Create Session' to start."
- Storage stats: "0 B / 5.0 MB (0%)"
- Write operations: All inputs empty, Create Session button enabled

**After state** (after Create Session → Write 3 Chunks → Write Volume Profile → Write 2 Snips → Write 2 Transcripts):
- Session list: 1 row (ses_abc123, Duration 12.5s, Chunks 3, Size 1.2 MB, Volume? ✓, Snips? 2, Transcripts? 2)
- Storage stats: "1.2 MB / 5.0 MB (24%)"
- Write operations: "Last created: ses_abc123", chunk count 3, snip count 2

**After state** (after Reload Page):
- Session list: Same 1 row (data persisted)
- Persistence status: "Data persists across reloads ✓" (green)

**After state** (after storage cap reduced to 0.5 MB, Enforce Retention Policy):
- Session list: Empty (ses_abc123 deleted by retention policy)
- Storage stats: "0 B / 0.5 MB (0%)"
- Retention log: "Deleted 1 session (ses_abc123) to reclaim 1.2 MB"

### Walkthrough Value

**What the demo proves**:
- Founder/developer can create sessions and see them listed with metadata
- Founder/developer can write chunks (fixture or live-from-capture-engine) and see session duration/size update
- Founder/developer can write volume profiles and see Volume? flag turn green
- Founder/developer can write snips and see Snip count update
- Founder/developer can write transcripts and see Transcript count update
- Founder/developer can read session details (expand Details view, see chunks/volume/snips/transcripts)
- Founder/developer can delete sessions and see cascade delete work (all related data removed)
- Founder/developer can enforce retention policy and see oldest sessions deleted to meet storage cap
- Founder/developer can reload page and see data persists (proves durable storage)
- Founder/developer can inspect IndexedDB schema in browser DevTools (verify object stores + indexes exist)

**What the demo does NOT do**:
- Does NOT implement capture logic (capture-engine does that; demo may optionally include capture-engine as dependency for testing integrated chunk writes)
- Does NOT implement volume analysis logic (volume-analyzer does that; demo may optionally include volume-analyzer as dependency for testing integrated volume profile/snip writes)
- Does NOT implement transcription logic (transcription-client does that; demo uses manual text input for transcripts)
- Does NOT implement playback logic (playback-engine does that; demo may have "Read" buttons to fetch blobs, but playback itself is not in session-store)
- Session-store's public interface is the datastore authority for all data; this demo exercises the CORE LOGIC (IndexedDB schema, writes, reads, deletes, retention policy) without the PWA orchestration

## Data Integrity Rules

**Referential integrity enforcement:**

1. **Before writing chunk**: Validate sessionId exists via getSession(sessionId). If null, return error `{error: "session_not_found"}`.
2. **Before writing volume profile**: Validate sessionId exists via getSession(sessionId). If null, return error `{error: "session_not_found"}`.
3. **Before writing snip**: Validate sessionId exists via getSession(sessionId). If null, return error `{error: "session_not_found"}`.
4. **Before writing transcript**: Validate snipId exists via getSnip(snipId). If null, return error `{error: "snip_not_found"}`. Also read snip.sessionId for transcript's by-sessionId index.

**Cascade deletion order** (when deleteSession called):
1. Delete all transcripts for this session (via by-sessionId index on transcripts)
2. Delete all snips for this session (via by-sessionId index on snips)
3. Delete volume profile for this session (direct key delete via sessionId)
4. Delete all chunks for this session (via by-sessionId index on chunks)
5. Delete session record itself (direct key delete via sessionId)

**Session metadata updates** (automatic, triggered by write operations):
- writeChunk updates: session.chunkCount += 1, session.sizeBytes += chunk.sizeBytes, session.duration = max(session.duration, chunk.endTime), session.updatedAt = now
- writeVolumeProfile updates: session.hasVolumeProfile = true, session.updatedAt = now
- writeSnip updates: session.hasSnips = true, session.updatedAt = now
- writeTranscript updates: session.hasTranscript = true, session.updatedAt = now

## Storage Quota Calculation

**Used bytes**: Sum of all chunk.sizeBytes across all sessions. Chunks are the dominant storage consumer (audio blobs). Volume profiles, snips, transcripts are small (metadata + text).

**IndexedDB overhead estimate**: Add 10% overhead to chunk.sizeBytes sum for IndexedDB internal structures, indexes, metadata. For example, if sum(chunk.sizeBytes) = 100 MB, report usedBytes = 110 MB.

**Quota exceeded detection**: When writeChunk called, check if (usedBytes + newChunk.sizeBytes) > capBytes. If so, return error `{error: "quota_exceeded", usedBytes, capBytes}`. Caller (capture-engine or PWA) can then call enforceRetentionPolicy(capBytes) to reclaim space and retry.

## Retention Policy Algorithm

**Goal**: Delete oldest sessions until usedBytes <= capBytes.

**Algorithm** (enforceRetentionPolicy):
1. Calculate current usedBytes = sum(all chunk.sizeBytes) * 1.1 (10% overhead)
2. If usedBytes <= capBytes → return immediately `{deletedSessions: 0, reclaimedBytes: 0, newUsedBytes: usedBytes}`
3. Fetch all sessions via listSessions (sorted by createdAt asc, oldest first, no pagination limit)
4. Initialize deletedSessions = 0, reclaimedBytes = 0
5. For each session (starting with oldest):
   - If usedBytes <= capBytes → stop (quota satisfied)
   - reclaimedBytes += session.sizeBytes
   - Call deleteSession(session.id) to cascade delete
   - usedBytes -= session.sizeBytes
   - deletedSessions += 1
6. Return `{deletedSessions, reclaimedBytes, newUsedBytes: usedBytes}`

**When to call**: PWA should call enforceRetentionPolicy after recording completes (to reclaim space preemptively), or after writeChunk returns quota_exceeded error (to reclaim space reactively).

## Validation Plan

**Manual Isolation Demo walkthrough** (proves all interfaces work):

1. **Schema validation**:
   - Open Isolation Demo → check IndexedDB (browser DevTools → Application → IndexedDB → web-whisper-sandbox-db) → verify 5 object stores exist (sessions, chunks, volume-profiles, snips, transcripts)
   - Verify indexes exist (sessions.by-createdAt, chunks.by-sessionId, chunks.by-sessionId-seq, snips.by-sessionId, transcripts.by-sessionId)

2. **Create session**:
   - Click "Create Session" button → verify session ID returned and displayed ("Last created: ses_abc123")
   - Verify session list panel shows new row (Duration 0s, Chunks 0, Size 0 B, Volume? —, Snips? —, Transcripts? —)

3. **Write chunks**:
   - Select fixture chunk data source → write 3 chunks → verify chunk count increments to 3
   - Verify session list updates (Duration ~12s, Chunks 3, Size ~1.2 MB)
   - Click "Details" on session row → verify chunks list shows 3 rows (seq 0, 1, 2 with start/end times, sizes)

4. **Write volume profile**:
   - Select fixture volume data source → write volume profile → verify session list updates (Volume? ✓ green)
   - Click "Details" on session row → verify volume profile section shows chunkVolumes list

5. **Write snips**:
   - Select fixture snips data source → write 2 snips → verify snip count increments to 2
   - Verify session list updates (Snips? 2)
   - Click "Details" on session row → verify snips list shows 2 rows

6. **Write transcripts**:
   - Get snip ID from snips list (Details view) → write transcript for snip 1 → write transcript for snip 2
   - Verify session list updates (Transcripts? 2)
   - Click "Details" on session row → verify transcripts list shows 2 rows with text previews

7. **Read operations**:
   - getSession: Details view shows session metadata (duration, chunk count, size, flags)
   - getChunksForSession: Details view shows chunks list sorted by seq
   - getVolumeProfile: Details view shows volume profile if exists
   - getSnipsForSession: Details view shows snips list
   - getTranscriptsForSession: Details view shows transcripts list

8. **Delete session**:
   - Click "Delete" button on session row → confirm dialog → verify session row removed from list
   - Verify storage stats update (Used bytes decrease, session count -= 1, chunk count -= 3)
   - Open IndexedDB DevTools → verify session deleted + all chunks deleted + volume profile deleted + snips deleted + transcripts deleted (cascade delete worked)

9. **Enforce retention policy**:
   - Create 5 sessions with chunks (each ~1 MB) → total ~5 MB used
   - Set storage cap to 2 MB → click "Enforce Retention Policy" button
   - Verify retention log shows "Deleted 3 sessions (oldest 3) to reclaim ~3 MB"
   - Verify session list shows only 2 newest sessions remaining
   - Verify storage stats show "Used: ~2 MB / 2.0 MB"

10. **Persistence test**:
    - Create sessions + write chunks → click "Reload Page" button → verify session list repopulates with same data after page reload
    - Verify persistence status badge shows "Data persists across reloads ✓" (green)

## Implementation Checklist

**Phase 06 implementation tasks**:

- [ ] Initialize IndexedDB database ("web-whisper-db" for production, "web-whisper-sandbox-db" for demo)
- [ ] Create 5 object stores with key paths and indexes (sessions, chunks, volume-profiles, snips, transcripts)
- [ ] Implement createSession (generate UUID, insert session record, return session ID)
- [ ] Implement getSession (read session by id, return metadata or null)
- [ ] Implement listSessions (index scan via by-createdAt DESC, paginated, return session list + total)
- [ ] Implement deleteSession (cascade delete: transcripts → snips → volume-profile → chunks → session)
- [ ] Implement writeChunk (validate session exists, insert chunk, update session metadata, return chunk ID or quota_exceeded error)
- [ ] Implement getChunk (read chunk by id, return blob + metadata or null)
- [ ] Implement getChunksForSession (index scan via by-sessionId-seq ASC, return chunks sorted by seq, NO blobs for performance)
- [ ] Implement writeVolumeProfile (validate session exists, insert/replace volume profile, update session.hasVolumeProfile)
- [ ] Implement getVolumeProfile (read volume profile by sessionId key, return or null)
- [ ] Implement writeSnip (validate session exists, insert snip, update session.hasSnips, return snip ID)
- [ ] Implement getSnipsForSession (index scan via by-sessionId, sort by startTime ASC, return snips)
- [ ] Implement getSnip (read snip by id, return metadata or null)
- [ ] Implement writeTranscript (validate snip exists, read snip.sessionId, insert/replace transcript, update session.hasTranscript)
- [ ] Implement getTranscript (read transcript by snipId key, return or null)
- [ ] Implement getTranscriptsForSession (index scan via by-sessionId, return transcripts)
- [ ] Implement getStorageStats (count sessions, count chunks, sum chunk.sizeBytes * 1.1 overhead, return stats)
- [ ] Implement enforceRetentionPolicy (fetch sessions sorted by createdAt asc, delete oldest until usedBytes <= capBytes, return summary)
- [ ] Implement Isolation Demo web app (5 panels: top chrome, write operations, session list, storage management, reload test)
- [ ] Isolation Demo: Write operations panel (Create Session, Write Chunk with fixture/upload/live-from-capture-engine, Write Volume Profile with fixture/compute-via-volume-analyzer, Write Snips with fixture/propose-via-volume-analyzer, Write Transcript with manual text input)
- [ ] Isolation Demo: Session list panel (table with session metadata, Details button to expand, Delete button with confirm dialog, sorted by createdAt desc)
- [ ] Isolation Demo: Details expansion view (chunks list with Read button, volume profile display, snips list, transcripts list with text preview)
- [ ] Isolation Demo: Storage management panel (storage cap input, Update Cap button, storage stats display, Enforce Retention Policy button, retention log)
- [ ] Isolation Demo: Reload test panel (Reload Page button, persistence status badge)
- [ ] Manual validation walkthrough (follow Validation Plan above, verify all operations work)

## Event and Telemetry Expectations

**External events** (for other packages to subscribe to): NONE. Session-store is a data authority, not an event publisher. Callers (PWA, capture-engine, volume-analyzer, playback-engine) call session-store interfaces synchronously and receive return values or errors.

**Internal telemetry** (for Isolation Demo debugging): Isolation Demo may include a collapsible event feed panel (similar to capture-engine Isolation Demo) showing:
- `sessionCreated(sessionId, createdAt)`
- `chunkWritten(chunkId, sessionId, seq, sizeBytes)`
- `volumeProfileWritten(sessionId, chunkCount)`
- `snipWritten(snipId, sessionId, startTime, endTime)`
- `transcriptWritten(snipId, textLength)`
- `sessionDeleted(sessionId, cascadeDeletedCounts: {chunks, snips, transcripts})`
- `retentionPolicyEnforced(deletedSessions, reclaimedBytes, newUsedBytes)`
- `error(operation, errorCode, details)`

Telemetry is Isolation Demo-only; production session-store does not emit events or logs (callers log success/failure based on return values).

## Customer Relationships

Customers of session-store:
- `apps/web-whisper-pwa` (see `customers/web-whisper-pwa.md`)
- `packages/lib/capture-engine` (see `customers/capture-engine.md`)
- `packages/lib/volume-analyzer` (see `customers/volume-analyzer.md`)
- `packages/lib/playback-engine` (see `customers/playback-engine.md`)
- Isolation Demo (see `customers/00-isolation-demo.md`)

Customer request sections will be filled by Phase 04 customer-request agents.
