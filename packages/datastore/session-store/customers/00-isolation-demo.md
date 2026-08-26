# Customer: Isolation Demo (Standing Human Customer)

The Isolation Demo is a standing founder/developer customer that operates session-store by itself, without the production PWA.

## Producer's Understanding of This Customer

**Identity**: The Isolation Demo is the package factory floor—a standing founder/developer customer that operates session-store independently without the production PWA.

**Core need**: Prove that session-store's IndexedDB schema, write operations, read operations, delete operations, and retention policy work correctly in isolation. The demo must make visible what would normally be hidden inside the PWA: schema structure, data relationships, referential integrity, cascade deletes, storage quota calculations, and retention policy mechanics.

**Data mode requirements**: The demo operates on a **sandbox IndexedDB instance** (database name "web-whisper-sandbox-db", separate from production "web-whisper-db"). All writes are isolated to the sandbox database. Data persists across page reloads to prove durable storage works.

**Safe default**: **Fixture data entry**. The demo defaults to manual controls: click "Create Session" button to create session, click "Write Chunk" button with fixture data to write chunk, click "Write Volume Profile" button with fixture volume to write profile, etc. This is the safe default because it requires deliberate operator action (click button) rather than automatic live capture/analysis.

**Optional live integrations**: The demo MAY optionally include capture-engine and volume-analyzer as dependencies for testing integrated write flows:
- **capture-engine integration**: "Live from Capture-Engine" data source option in Write Chunk panel. When selected, operator clicks "Start Capture" → capture-engine captures audio in-memory → operator clicks "Stop Capture + Flush Chunks to Store" → chunks written to sandbox DB via session-store's writeChunk interface. Data mode labeled "LIVE CAPTURE" (orange chip).
- **volume-analyzer integration**: "Compute via Volume-Analyzer" data source option in Write Volume Profile panel. When selected, operator clicks "Compute Volume Profile" → volume-analyzer reads chunks from sandbox DB → computes volume profile → writes to sandbox DB via session-store's writeVolumeProfile interface. Data mode labeled "COMPUTED VOLUME" (purple chip).

**Data mode labels** (makes real vs sample data visually unmistakable):
- "FIXTURE DATA" (cyan chip, default): Manually created fixture chunks/volume-profiles/snips, NOT live capture/analysis
- "LIVE CAPTURE" (orange chip, optional): Real audio captured via capture-engine, written to sandbox DB
- "COMPUTED VOLUME" (purple chip, optional): Real volume profile computed via volume-analyzer from sandbox DB chunks
- "MANUAL ENTRY" (gray chip): Manual text input for transcripts

**Interfaces needed from session-store**:

1. **createSession()**: Click "Create Session" button → session-store creates new session in sandbox DB → returns session ID → demo displays "Last created: ses_abc123" and adds row to session list table
2. **writeChunk(sessionId, chunkData)**: Click "Write Chunk" button → session-store validates sessionId exists → writes chunk to sandbox DB → updates session metadata (chunkCount, sizeBytes, duration) → returns chunkId or error (session_not_found, quota_exceeded)
3. **writeVolumeProfile(sessionId, volumeProfile)**: Click "Write Volume Profile" button → session-store validates sessionId exists → writes/replaces volume profile to sandbox DB → updates session.hasVolumeProfile = true → returns confirmation or error
4. **writeSnip(sessionId, snipData)**: Click "Write Snips" button → session-store validates sessionId exists → writes snip to sandbox DB → updates session.hasSnips = true → returns snipId or error
5. **writeTranscript(snipId, transcriptText)**: Enter text in transcript text area → click "Write Transcript" button → session-store validates snipId exists → writes/replaces transcript to sandbox DB → updates session.hasTranscript = true → returns confirmation or error
6. **listSessions(options)**: Page load or after data changes → session-store queries sandbox DB sessions via by-createdAt index DESC → returns session list sorted by createdAt desc → demo populates session list table (columns: ID, Created At, Duration, Chunks, Size, Volume?, Snips?, Transcripts?, Actions)
7. **getSession(sessionId)**: Click "Details" button on session row → session-store reads session metadata from sandbox DB → returns `{id, createdAt, duration, chunkCount, sizeBytes, hasVolumeProfile, hasSnips, hasTranscript}` or null → demo expands row to show full metadata
8. **getChunksForSession(sessionId)**: Click "Details" button → session-store queries chunks via by-sessionId-seq index ASC → returns chunk list sorted by seq (NO blobs for performance) → demo displays chunks table (columns: Seq, Start Time, End Time, Size, Read button)
9. **getChunk(chunkId)**: Click "Read" button on chunk row → session-store reads chunk blob + metadata from sandbox DB → returns `{id, sessionId, seq, startTime, endTime, duration, blob, sizeBytes}` or null → demo can play blob or download
10. **getVolumeProfile(sessionId)**: Click "Details" button → session-store reads volume profile from sandbox DB → returns `{sessionId, chunkVolumes: [{chunkId, peakDb}], createdAt}` or null → demo displays volume profile table (columns: Chunk ID, Peak dB)
11. **getSnipsForSession(sessionId)**: Click "Details" button → session-store queries snips via by-sessionId index → returns snip list sorted by startTime → demo displays snips table (columns: Snip ID, Start Time, End Time, Duration, Read button)
12. **getSnip(snipId)**: Click "Read" button on snip row → session-store reads snip metadata from sandbox DB → returns `{id, sessionId, startChunkIndex, endChunkIndex, startTime, endTime, duration, chunkIds, confidence, createdAt}` or null → demo shows full snip details
13. **getTranscriptsForSession(sessionId)**: Click "Details" button → session-store queries transcripts via by-sessionId index → returns transcript list → demo displays transcripts table (columns: Snip ID, Text Preview, Read Full button)
14. **getTranscript(snipId)**: Click "Read Full" button on transcript row → session-store reads transcript from sandbox DB → returns `{snipId, sessionId, text, createdAt, updatedAt}` or null → demo shows full transcript text
15. **deleteSession(sessionId)**: Click "Delete" button on session row → confirm dialog → session-store cascades delete (transcripts → snips → volume-profile → chunks → session) → returns confirmation → demo removes row from table, updates storage stats
16. **getStorageStats()**: Page load or after data changes → session-store counts sessions, counts chunks, sums chunk sizeBytes * 1.1 overhead → returns `{usedBytes, capBytes, sessionCount, chunkCount}` → demo displays "Storage: 1.2 MB / 5.0 MB (24%)" in top chrome and storage management panel
17. **enforceRetentionPolicy(capBytes)**: Set storage cap input to low value (e.g., 0.5 MB) → click "Enforce Retention Policy" button → session-store fetches sessions sorted by createdAt asc, deletes oldest until usedBytes <= capBytes, cascades delete for each session → returns `{deletedSessions, reclaimedBytes, newUsedBytes}` → demo displays retention log ("Deleted 3 sessions to reclaim 3.5 MB"), updates session list (deleted rows removed), updates storage stats

**Validation expectations**:

The Isolation Demo proves session-store works by exercising all interfaces in this walkthrough:
1. Create session → verify session ID returned, row appears in session list
2. Write 3 chunks → verify chunk count increments, session duration/size update, storage stats update
3. Write volume profile → verify Volume? flag turns green, Details view shows volume profile
4. Write 2 snips → verify Snips? shows "2", Details view shows snips table
5. Write 2 transcripts → verify Transcripts? shows "2", Details view shows transcripts table
6. Read operations → click Details button, verify all related data visible (chunks, volume, snips, transcripts)
7. Delete session → confirm dialog, verify row removed, storage stats decrease, IndexedDB DevTools shows cascade delete worked
8. Enforce retention policy → create 5 sessions (~5 MB), set cap to 2 MB, click Enforce, verify 3 oldest sessions deleted, retention log shows summary
9. Reload page → verify session list repopulates with same data (proves persistence), persistence status badge shows "Data persists across reloads ✓" (green)
10. Inspect schema in IndexedDB DevTools → verify 5 object stores exist (sessions, chunks, volume-profiles, snips, transcripts), verify indexes exist (by-createdAt, by-sessionId, by-sessionId-seq)

**What the demo does NOT need**:

- Does NOT need PWA orchestration (PWA is a separate customer)
- Does NOT need capture logic implemented in session-store (capture-engine does that; demo may include capture-engine as optional dependency for testing integrated writes)
- Does NOT need volume analysis logic implemented in session-store (volume-analyzer does that; demo may include volume-analyzer as optional dependency for testing integrated writes)
- Does NOT need transcription logic (transcription-client does that; demo uses manual text input)
- Does NOT need playback logic (playback-engine does that; demo may have "Read" buttons to fetch blobs, but playback itself is not in session-store)

**Summary**: The Isolation Demo is a **store inspector** that proves session-store's core logic (schema, writes, reads, deletes, retention policy) works independently. It operates on a sandbox database (isolated from production), uses labeled data modes (fixture default, optional live integrations clearly marked), and exercises all session-store interfaces with manual operator controls. The demo must make visible what would normally be hidden: data relationships, referential integrity, cascade deletes, storage calculations, and retention policy mechanics.

## Customer Request

(To be filled by Phase 04 customer-request agent for isolation-demo → session-store)

The isolation-demo customer will write its request here: what interfaces it needs from session-store (createSession, writeChunk, getSession, listSessions, deleteSession, enforceRetentionPolicy, getStorageStats), what inputs it will provide (session IDs, chunk blobs, volume profiles, snip data, transcript text), what outputs it expects (session metadata, chunk lists, volume profiles, snips, transcripts), and what validation it needs to see to trust the package.

## Producer Response

(To be filled by Phase 05 producer-response agent for session-store)

Session-store will respond here: how it will meet the isolation-demo's request, what interfaces it will expose for demo use, how the sandbox database is isolated from production, and how the demo proves the package works independently.
