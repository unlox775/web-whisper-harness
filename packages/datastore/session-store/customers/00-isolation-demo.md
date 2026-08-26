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

I'm the Isolation Demo for session-store. I'm the package factory floor—a standing founder/developer customer that proves session-store works independently. I need to exercise every interface, make data relationships visible, and validate that durable storage actually works. Here's what I need:

### Core Requirement: Sandbox Database Isolation

**Critical**: I operate on a **sandbox IndexedDB instance** (database name `"web-whisper-sandbox-db"`, separate from production `"web-whisper-db"`).

All writes are isolated to sandbox. Data persists across page reloads to prove durable storage works.

Session-store MUST provide configuration option to specify database name:
- Production mode: `sessionStore.init({databaseName: 'web-whisper-db'})`
- Sandbox mode (for demo): `sessionStore.init({databaseName: 'web-whisper-sandbox-db'})`

I will call `sessionStore.init({databaseName: 'web-whisper-sandbox-db'})` on demo page load.

### Data Mode Requirements

**Safe default**: **Fixture data entry**. I default to manual controls that require deliberate operator action:
- Click "Create Session" button → creates session
- Click "Write Chunk" button with fixture data → writes chunk
- Click "Write Volume Profile" button with fixture volume → writes profile

Data mode labeled **"FIXTURE DATA"** (cyan chip, visually unmistakable).

**Optional live integrations** (if session-store spec allows):
- **"LIVE CAPTURE"** (orange chip): I call `capture-engine.startCapture(sessionId)` → capture in-memory → flush chunks to sandbox DB via `writeChunk`
- **"COMPUTED VOLUME"** (purple chip): I call `volume-analyzer.analyzeVolume(sessionId)` → reads chunks from sandbox DB → writes volume profile

All data modes are visually labeled so operator can never mistake live capture for fixture data.

### Interfaces I Need

**`createSession()`**

When I call it: Operator clicks "Create Session" button in demo UI

Input: None

Output I expect: `{id: string}` or `{error: 'database_unavailable'}`

How I use it:
- Display "Last created: {sessionId}" in demo UI
- Add row to session list table with ID, Created At, Duration (0.0s), Chunks (0), Size (0 bytes)
- Enable "Write Chunk" button for this session

**`writeChunk(sessionId, chunkData)`**

When I call it: Operator clicks "Write Chunk" button with fixture data or live-from-capture flush

Input:
- `sessionId: string` (from session list table selected row)
- `chunkData: {seq: number, startTime: number, endTime: number, duration: number, blob: Blob, sizeBytes: number}`

Fixture data example:
- `seq: 0`, `startTime: 0.00`, `endTime: 4.12`, `duration: 4.12`, `blob: <fixture MP3 blob>`, `sizeBytes: 32768`

Output I expect: `{chunkId: string}` or error

How I use it:
- Update session row: Chunks (1), Size (32 KB), Duration (4.12s)
- Update storage stats: "Storage: 32 KB / 5.0 MB (0.6%)"
- Display success toast: "Chunk written: {chunkId}"

**`writeVolumeProfile(sessionId, volumeProfile)`**

When I call it: Operator clicks "Write Volume Profile" button with fixture data or computed-from-analyzer

Input:
- `sessionId: string`
- `volumeProfile: {chunkVolumes: [{chunkId: string, peakDb: number}]}`

Fixture data example:
- `chunkVolumes: [{chunkId: 'chunk_0', peakDb: -12.5}, {chunkId: 'chunk_1', peakDb: -45.2}]`

Output I expect: `{written: true}` or error

How I use it:
- Update session row: Volume? (green checkmark ✓)
- Display success toast: "Volume profile written"

**`writeSnip(sessionId, snipData)`**

When I call it: Operator clicks "Write Snips" button with fixture data

Input:
- `sessionId: string`
- `snipData: {startChunkIndex: number, endChunkIndex: number, startTime: number, endTime: number, duration: number, chunkIds: string[], confidence: number}`

Fixture data example:
- `startChunkIndex: 0`, `endChunkIndex: 1`, `startTime: 0.00`, `endTime: 8.24`, `duration: 8.24`, `chunkIds: ['chunk_0', 'chunk_1']`, `confidence: 0.95`

Output I expect: `{snipId: string}` or error

How I use it:
- Update session row: Snips? (shows "1", increments with each writeSnip)
- Display success toast: "Snip written: {snipId}"

**`writeTranscript(snipId, transcriptText)`**

When I call it: Operator enters text in transcript textarea, clicks "Write Transcript" button

Input:
- `snipId: string` (from snips list table selected row)
- `transcriptText: string` (from textarea, e.g., "Hello world, this is a test transcript.")

Output I expect: `{written: true}` or error

How I use it:
- Update session row: Transcripts? (shows "1", increments with each writeTranscript)
- Display success toast: "Transcript written for snip {snipId}"

**`listSessions(options?)`**

When I call it: Page load, after data changes (createSession, writeChunk, deleteSession, enforceRetentionPolicy)

Input: `options?: {limit?: number, offset?: number}` (default `{limit: 100, offset: 0}`)

Output I expect:
```javascript
{
  sessions: [
    {
      id: string,
      createdAt: string,
      duration: number,
      chunkCount: number,
      sizeBytes: number,
      hasVolumeProfile: boolean,
      hasSnips: boolean,
      hasTranscript: boolean
    },
    // ... more sessions, sorted by createdAt DESC
  ],
  total: number
}
```

How I use it:
- Populate session list table with rows (one row per session)
- Display columns: ID, Created At, Duration, Chunks, Size, Volume? (✓/✗), Snips? (#), Transcripts? (#), Actions (Details button, Delete button)
- If `total > 100`, display "Load More" button

**`getSession(sessionId)`**

When I call it: Operator clicks "Details" button on session row

Input: `sessionId: string`

Output I expect: Session object with full metadata or `null`

How I use it:
- Expand session row to show full metadata (createdAt, updatedAt, duration, chunkCount, sizeBytes, flags)
- Enable "Details" panel with tabs: Chunks, Volume Profile, Snips, Transcripts

**`getChunksForSession(sessionId)`**

When I call it: Operator clicks "Details" button → Chunks tab

Input: `sessionId: string`

Output I expect: `{chunks: [...]}` (NO blobs, metadata only, sorted by seq ASC)

How I use it:
- Display chunks table with columns: Seq, Start Time, End Time, Duration, Size, Read button
- Operator clicks "Read" button → I call `getChunk(chunkId)` to fetch blob

**`getChunk(chunkId)`**

When I call it: Operator clicks "Read" button on chunk row

Input: `chunkId: string`

Output I expect: Chunk object with blob or `null`

How I use it:
- Display chunk details: ID, sessionId, seq, startTime, endTime, duration, sizeBytes
- Optionally play blob: `audioElement.src = URL.createObjectURL(blob)` (if demo includes playback controls)
- Optionally download blob: `<a download="chunk_{seq}.mp3" href={URL.createObjectURL(blob)}>Download</a>`

**`getVolumeProfile(sessionId)`**

When I call it: Operator clicks "Details" button → Volume Profile tab

Input: `sessionId: string`

Output I expect: Volume profile object or `null`

How I use it:
- Display volume profile table with columns: Chunk ID, Peak dB
- If `null` → show "No volume profile" message

**`getSnipsForSession(sessionId)`**

When I call it: Operator clicks "Details" button → Snips tab

Input: `sessionId: string`

Output I expect: `{snips: [...]}` (sorted by startTime ASC)

How I use it:
- Display snips table with columns: Snip ID, Start Time, End Time, Duration, Confidence, Read button
- Operator clicks "Read" button → I call `getSnip(snipId)` to show full details

**`getSnip(snipId)`**

When I call it: Operator clicks "Read" button on snip row

Input: `snipId: string`

Output I expect: Snip object or `null`

How I use it:
- Display snip details: ID, sessionId, startChunkIndex, endChunkIndex, startTime, endTime, duration, chunkIds array, confidence

**`getTranscriptsForSession(sessionId)`**

When I call it: Operator clicks "Details" button → Transcripts tab

Input: `sessionId: string`

Output I expect: `{transcripts: [...]}`

How I use it:
- Display transcripts table with columns: Snip ID, Text Preview (first 50 chars), Read Full button
- Operator clicks "Read Full" button → I call `getTranscript(snipId)` to show full text

**`getTranscript(snipId)`**

When I call it: Operator clicks "Read Full" button on transcript row

Input: `snipId: string`

Output I expect: Transcript object or `null`

How I use it:
- Display transcript details: snipId, sessionId, full text, createdAt, updatedAt
- Optionally provide copy-to-clipboard button

**`deleteSession(sessionId)`**

When I call it: Operator clicks "Delete" button on session row, confirms in dialog

Input: `sessionId: string`

Output I expect: `{deleted: true}` or error

How I use it:
- Show confirm dialog: "Delete session {sessionId}? This will cascade delete all chunks, volume profile, snips, and transcripts. This cannot be undone."
- If confirmed → call `deleteSession(sessionId)`
- Remove row from session list table
- Update storage stats
- Display success toast: "Session deleted: {sessionId}"

**Cascade delete validation**: After delete, I inspect IndexedDB DevTools to verify:
- Session record deleted from `sessions` object store
- All chunk records deleted from `chunks` object store (where `sessionId` matches)
- Volume profile record deleted from `volume-profiles` object store (where `sessionId` matches)
- All snip records deleted from `snips` object store (where `sessionId` matches)
- All transcript records deleted from `transcripts` object store (where `snipId` matches any of deleted snips)

**`getStorageStats()`**

When I call it: Page load, after data changes (writeChunk, deleteSession, enforceRetentionPolicy)

Input: None

Output I expect: `{usedBytes: number, capBytes: number, sessionCount: number, chunkCount: number}`

How I use it:
- Display storage panel: "Storage: 1.2 MB / 5.0 MB (24%)"
- Display detail text: "3 sessions, 12 chunks"
- Display progress bar: 24% fill

**`enforceRetentionPolicy(capBytes)`**

When I call it: Operator sets storage cap input to low value (e.g., 0.5 MB), clicks "Enforce Retention Policy" button

Input: `capBytes: number` (from input field, e.g., 524288 for 0.5 MB)

Output I expect: `{deletedSessions: number, reclaimedBytes: number, newUsedBytes: number}`

How I use it:
- Display retention log: "Deleted {deletedSessions} session(s) to reclaim {reclaimedBytes} bytes. New usage: {newUsedBytes} bytes."
- Update session list table (deleted rows removed)
- Update storage stats display

**Retention policy validation**: I create 5 sessions (~1 MB each = 5 MB total), set cap to 2 MB, click "Enforce". Session-store MUST:
- Delete oldest 3 sessions (sorted by createdAt ASC)
- Keep newest 2 sessions
- Return `{deletedSessions: 3, reclaimedBytes: ~3 MB, newUsedBytes: ~2 MB}`

### Validation Walkthrough I Need to Execute

I prove session-store works by executing this walkthrough:

1. **Create session** → verify session ID returned, row appears in session list table
2. **Write 3 chunks** (fixture data) → verify chunk count increments (0 → 1 → 2 → 3), session duration/size update, storage stats update
3. **Write volume profile** (fixture data) → verify Volume? flag turns green ✓, Details → Volume Profile tab shows volume profile table
4. **Write 2 snips** (fixture data) → verify Snips? shows "2", Details → Snips tab shows snips table
5. **Write 2 transcripts** (manual text entry) → verify Transcripts? shows "2", Details → Transcripts tab shows transcripts table
6. **Read operations** → click Details button, verify all related data visible (chunks, volume, snips, transcripts)
7. **Delete session** → confirm dialog, verify row removed, storage stats decrease, IndexedDB DevTools shows cascade delete worked (all chunks/volume/snips/transcripts deleted)
8. **Enforce retention policy** → create 5 sessions (~5 MB), set cap to 2 MB, click Enforce, verify 3 oldest sessions deleted, retention log shows summary
9. **Reload page** → verify session list repopulates with same data (proves persistence), persistence status badge shows "Data persists across reloads ✓" (green)
10. **Inspect schema in IndexedDB DevTools** → verify 5 object stores exist (`sessions`, `chunks`, `volume-profiles`, `snips`, `transcripts`), verify indexes exist (`by-createdAt`, `by-sessionId`, `by-sessionId-seq`)

### UI Panels I Need

**Session List Panel** (always visible):
- Table with columns: ID, Created At, Duration, Chunks, Size, Volume?, Snips?, Transcripts?, Actions
- "Create Session" button
- "Load More" button (if total > 100)

**Write Operations Panel**:
- Session ID input (or dropdown from session list)
- Data mode selector: Fixture Data (default), Live from Capture (optional), Computed Volume (optional)
- "Write Chunk" button with fixture data form (seq, startTime, endTime, duration, blob file upload, sizeBytes)
- "Write Volume Profile" button with fixture data form (chunkVolumes JSON textarea)
- "Write Snips" button with fixture data form (startChunkIndex, endChunkIndex, startTime, endTime, duration, chunkIds JSON array, confidence)
- "Write Transcript" button with snip ID input + text textarea

**Storage Management Panel**:
- Current usage display: "Storage: 1.2 MB / 5.0 MB (24%)"
- Progress bar showing usage percentage
- Detail text: "3 sessions, 12 chunks"
- Storage cap input: number field (bytes) or preset buttons (1 MB, 2 MB, 5 MB, 10 MB)
- "Enforce Retention Policy" button
- Retention log: displays result of last enforceRetentionPolicy call

**Details Panel** (expands when "Details" button clicked):
- Tabs: Chunks, Volume Profile, Snips, Transcripts
- Each tab displays relevant table + Read buttons

**Persistence Status Badge** (top chrome):
- "Data persists across reloads ✓" (green chip) if data exists after page reload
- "Sandbox DB: web-whisper-sandbox-db" (cyan chip) to make isolation visible

### Error Handling Expectations

Session-store MUST return error objects (NOT throw exceptions) so I can display error toasts:

- `{error: 'session_not_found'}` → Toast: "Session not found. It may have been deleted."
- `{error: 'snip_not_found'}` → Toast: "Snip not found. Cannot write transcript."
- `{error: 'quota_exceeded', usedBytes, capBytes}` → Toast: "Storage full. Used: {usedBytes}, Cap: {capBytes}. Delete old sessions or increase cap."
- `{error: 'database_unavailable', reason}` → Toast: "Storage unavailable: {reason}. Check browser storage permissions."

All error objects include error code + optional detail fields. I log errors to browser console for debugging.

### Performance Expectations

Demo UI should feel snappy (not sluggish):

- `createSession`: < 50ms (instant button response)
- `writeChunk`: < 100ms (instant button response)
- `listSessions`: < 200ms for typical session counts (< 20 sessions in sandbox)
- `getSession`: < 50ms (details panel opens instantly)
- `deleteSession`: < 500ms (acceptable with cascade delete; confirm dialog gives user time expectation)
- `getStorageStats`: < 200ms (updates after every data change)

If listSessions takes > 500ms, demo UI feels broken. Session-store must optimize with IndexedDB indexes.

### What I Do NOT Need

- I do NOT need production PWA orchestration (I am standalone demo)
- I do NOT need real Groq API integration (I use manual text entry for transcripts)
- I do NOT need mic permissions (if I include live capture, it's optional feature clearly labeled "LIVE CAPTURE")
- I do NOT need automatic workflows (everything is manual button clicks for deliberate operator control)

### Summary of Interfaces

| Interface | Input | Output | Failure Result |
|-----------|-------|--------|----------------|
| `createSession()` | None | `{id: string}` | `{error: 'database_unavailable'}` |
| `writeChunk(sessionId, chunkData)` | sessionId, chunkData | `{chunkId: string}` | `{error: 'session_not_found'}` or `{error: 'quota_exceeded'}` or `{error: 'database_unavailable'}` |
| `writeVolumeProfile(sessionId, volumeProfile)` | sessionId, volumeProfile | `{written: true}` | `{error: 'session_not_found'}` or `{error: 'database_unavailable'}` |
| `writeSnip(sessionId, snipData)` | sessionId, snipData | `{snipId: string}` | `{error: 'session_not_found'}` or `{error: 'database_unavailable'}` |
| `writeTranscript(snipId, text)` | snipId, text | `{written: true}` | `{error: 'snip_not_found'}` or `{error: 'database_unavailable'}` |
| `listSessions(options?)` | options | `{sessions: [...], total: number}` | `{error: 'database_unavailable'}` |
| `getSession(sessionId)` | sessionId | Session object or `null` | N/A |
| `getChunksForSession(sessionId)` | sessionId | `{chunks: [...]}` | `{error: 'database_unavailable'}` |
| `getChunk(chunkId)` | chunkId | Chunk object with blob or `null` | N/A |
| `getVolumeProfile(sessionId)` | sessionId | Volume profile or `null` | N/A |
| `getSnipsForSession(sessionId)` | sessionId | `{snips: [...]}` | `{error: 'database_unavailable'}` |
| `getSnip(snipId)` | snipId | Snip object or `null` | N/A |
| `getTranscriptsForSession(sessionId)` | sessionId | `{transcripts: [...]}` | `{error: 'database_unavailable'}` |
| `getTranscript(snipId)` | snipId | Transcript object or `null` | N/A |
| `deleteSession(sessionId)` | sessionId | `{deleted: true}` | `{error: 'session_not_found'}` or `{error: 'database_unavailable'}` |
| `getStorageStats()` | None | `{usedBytes, capBytes, sessionCount, chunkCount}` | `{error: 'database_unavailable'}` |
| `enforceRetentionPolicy(capBytes)` | capBytes | `{deletedSessions, reclaimedBytes, newUsedBytes}` | `{error: 'database_unavailable'}` |

I exercise ALL interfaces to prove session-store works. Sandbox database isolation ensures demo never corrupts production data.

## Producer Response

I'm session-store. I accept your Isolation Demo customer request. You will operate as my factory floor—the standing human customer that proves session-store works independently. I will provide all requested interfaces with sandbox database isolation so you never corrupt production data. Here's exactly what I will ship in Phase 06:

### Sandbox Database Isolation (Accepted)

**Configuration interface**: `init(options)`

```javascript
sessionStore.init({
  databaseName: 'web-whisper-sandbox-db'  // Sandbox mode for demo
  // Production calls: sessionStore.init({databaseName: 'web-whisper-db'})
});
```

**Implementation**: IndexedDB `open(databaseName, version)` where `databaseName` is configurable. Default is `'web-whisper-db'` (production). Demo calls `init({databaseName: 'web-whisper-sandbox-db'})` on page load. Data persists across reloads within same database name. Sandbox and production databases are completely isolated (separate IndexedDB databases, no cross-contamination).

### Interfaces I Will Ship

**`createSession()`** → `{id: string}` or `{error: 'database_unavailable'}`

- Generates unique session ID: `sess_${timestamp}_${randomSuffix}` (e.g., `sess_20260826152037_abc123`)
- Creates session record: `{id, createdAt, updatedAt, duration: 0, chunkCount: 0, sizeBytes: 0, hasVolumeProfile: false, hasSnips: false, hasTranscript: false}`
- Writes to `sessions` object store via IndexedDB put
- Returns `{id}` on success
- Returns `{error: 'database_unavailable', reason}` if IndexedDB fails (catch exception, return error object)

**`writeChunk(sessionId, chunkData)`** → `{chunkId: string}` or error

Inputs: `sessionId` (string), `chunkData` (`{seq, startTime, endTime, duration, blob, sizeBytes}`)

- Validates `sessionId` exists (call internal `getSession`, if null → return `{error: 'session_not_found', sessionId}`)
- Checks quota: if `usedBytes + chunkData.sizeBytes > capBytes` → return `{error: 'quota_exceeded', usedBytes, capBytes}` WITHOUT writing
- Generates `chunkId`: `chunk_${sessionId}_${seq.toString().padStart(3, '0')}`
- Writes chunk to `chunks` object store: `{id: chunkId, sessionId, seq, startTime, endTime, duration, blob, sizeBytes, createdAt}`
- Updates session metadata atomically (same transaction): `session.chunkCount += 1`, `session.sizeBytes += chunkData.sizeBytes`, `session.duration = Math.max(session.duration, chunkData.endTime)`, `session.updatedAt = now`
- Returns `{chunkId}` on success
- Returns error object if validation fails or IndexedDB fails (NOT thrown exception)

**`writeVolumeProfile(sessionId, volumeProfile)`** → `{written: true}` or error

Inputs: `sessionId`, `volumeProfile` (`{chunkVolumes: [{chunkId, peakDb}]}`)

- Validates `sessionId` exists (if null → return `{error: 'session_not_found'}`)
- Writes/replaces volume profile to `volume-profiles` object store (key = sessionId, so put operation overwrites existing)
- Record: `{sessionId, chunkVolumes, createdAt}`
- Updates session: `session.hasVolumeProfile = true`, `session.updatedAt = now`
- Returns `{written: true}` on success

**`writeSnip(sessionId, snipData)`** → `{snipId: string}` or error

Inputs: `sessionId`, `snipData` (`{startChunkIndex, endChunkIndex, startTime, endTime, duration, chunkIds, confidence}`)

- Validates `sessionId` exists (if null → return `{error: 'session_not_found'}`)
- Generates `snipId`: `snip_${sessionId}_${snipIndex}` (snipIndex = current snip count for session)
- Writes snip to `snips` object store: `{id: snipId, sessionId, ...snipData, createdAt}`
- Updates session: `session.hasSnips = true`, `session.updatedAt = now`
- Returns `{snipId}` on success
- **Append behavior**: Multiple `writeSnip` calls for same sessionId append snips (unique snipId per write)

**`writeTranscript(snipId, transcriptText)`** → `{written: true}` or error

- Validates `snipId` exists (query `snips` object store, if not found → return `{error: 'snip_not_found', snipId}`)
- Gets `sessionId` from snip record
- Writes/replaces transcript to `transcripts` object store (key = snipId, so put operation overwrites)
- Record: `{snipId, sessionId, text: transcriptText, createdAt, updatedAt}`
- Updates session: `session.hasTranscript = true`, `session.updatedAt = now`
- Returns `{written: true}` on success

**`listSessions(options?)`** → `{sessions: [...], total: number}` or error

Options: `{limit = 100, offset = 0}`

- Queries `sessions` object store using `by-createdAt` index (DESC order, most recent first)
- Returns metadata only (NO chunks/volume-profiles/snips/transcripts in session records)
- Applies limit/offset (skip first `offset`, return next `limit`)
- Returns `{sessions: [...], total}` where `total` is count of ALL sessions (not limited to page)
- **NO BLOBS** in session records (performance requirement)

**`getSession(sessionId)`** → session object or `null`

- Single record read by primary key (`sessions` object store)
- Returns full session metadata or `null` if not found
- **Not an error object**: null is expected return for not-found

**`getChunksForSession(sessionId)`** → `{chunks: [...]}` or error

- Queries `chunks` object store using `by-sessionId-seq` index (ASC order by seq)
- Returns chunk metadata list (id, sessionId, seq, startTime, endTime, duration, sizeBytes)
- **NO BLOBS** in result (huge performance issue if blobs included; demo calls `getChunk` per chunk to fetch blobs separately)
- Sorted by seq ASC (critical for playback/volume-analysis ordering)

**`getChunk(chunkId)`** → chunk object with blob or `null`

- Single record read by primary key (`chunks` object store)
- Returns chunk metadata + blob: `{id, sessionId, seq, startTime, endTime, duration, blob, sizeBytes}`
- Returns `null` if not found (not an error object)

**`getVolumeProfile(sessionId)`** → volume profile or `null`

- Single record read by sessionId key (`volume-profiles` object store)
- Returns `{sessionId, chunkVolumes: [{chunkId, peakDb}], createdAt}` or `null`

**`getSnipsForSession(sessionId)`** → `{snips: [...]}` or error

- Queries `snips` object store using `by-sessionId` index
- Sorted by startTime ASC
- Returns snip list (id, sessionId, startChunkIndex, endChunkIndex, startTime, endTime, duration, chunkIds, confidence, createdAt)

**`getSnip(snipId)`** → snip object or `null`

- Single record read by primary key (`snips` object store)
- Returns full snip metadata or `null`

**`getTranscriptsForSession(sessionId)`** → `{transcripts: [...]}` or error

- Queries `transcripts` object store using `by-sessionId` index
- Returns transcript list (snipId, sessionId, text, createdAt, updatedAt)

**`getTranscript(snipId)`** → transcript object or `null`

- Single record read by snipId key (`transcripts` object store)
- Returns `{snipId, sessionId, text, createdAt, updatedAt}` or `null`

**`deleteSession(sessionId)`** → `{deleted: true}` or error

- Validates `sessionId` exists (if not found → return `{error: 'session_not_found'}`)
- **Cascade delete** (single transaction):
  1. Query transcripts for session → delete all
  2. Query snips for session → delete all
  3. Delete volume profile (if exists)
  4. Query chunks for session → delete all
  5. Delete session record
- Returns `{deleted: true}` on success
- IndexedDB DevTools will show all related records deleted (you validate in demo)

**`getStorageStats()`** → `{usedBytes, capBytes, sessionCount, chunkCount}` or error

- Counts sessions: `sessions` object store count
- Counts chunks: `chunks` object store count
- Sums chunk sizes: iterate all chunks, sum `sizeBytes` field * 1.1 (10% overhead estimate for IndexedDB metadata)
- Reads `capBytes` from localStorage `'web-whisper-storage-cap'` (default 200 MB = 209715200 bytes if not set)
- Returns `{usedBytes, capBytes, sessionCount, chunkCount}`

**`enforceRetentionPolicy(capBytes)`** → `{deletedSessions, reclaimedBytes, newUsedBytes}` or error

- Fetches sessions sorted by createdAt ASC (oldest first)
- Deletes oldest sessions until `usedBytes <= capBytes`
- Calls `deleteSession(sessionId)` per deleted session (cascade delete)
- Returns `{deletedSessions: count, reclaimedBytes: sum_of_sizes, newUsedBytes: remaining}`

### Error Handling (All Structured Objects, NOT Thrown Exceptions)

- `{error: 'database_unavailable', reason}` → IndexedDB operation failed (catch exception, return object)
- `{error: 'session_not_found', sessionId}` → Session does not exist (validation check before write)
- `{error: 'snip_not_found', snipId}` → Snip does not exist (validation check before transcript write)
- `{error: 'quota_exceeded', usedBytes, capBytes}` → Writing chunk would exceed cap (check before write)

**NOT thrown exceptions**. All errors returned as structured objects so demo can display error toasts without crashing.

### Performance Targets

- `createSession`: < 50ms
- `writeChunk`: < 100ms (includes session metadata update)
- `listSessions`: < 200ms for < 100 sessions
- `getSession`: < 50ms (single record by primary key)
- `getChunksForSession`: < 100ms for < 50 chunks (NO BLOBS)
- `getChunk`: < 50ms (single record, includes blob)
- `deleteSession`: 100–500ms (cascade delete, acceptable with confirm dialog)
- `getStorageStats`: < 200ms (aggregate calculation)

### IndexedDB Schema (5 Object Stores)

1. **sessions**: Primary key `id`, index `by-createdAt`
2. **chunks**: Primary key `id`, index `by-sessionId-seq` (compound index for sorted queries)
3. **volume-profiles**: Primary key `sessionId` (one profile per session)
4. **snips**: Primary key `id`, index `by-sessionId`
5. **transcripts**: Primary key `snipId`, index `by-sessionId`

### What I Will NOT Ship in Phase 06

- **`deleteSnipsForSession(sessionId)`**: Volume-analyzer requested this as optional. I will NOT ship it in Phase 06 (out of scope). Volume-analyzer can work around by calling `getSnipsForSession` + `deleteSnip` per snip if needed, OR PWA handles snip deletion before re-analysis. If this becomes load-bearing in Phase 07, add feedback spec.

- **Live data integrations for demo**: Isolation Demo requested optional capture-engine/volume-analyzer integrations ("LIVE CAPTURE" / "COMPUTED VOLUME" modes). These are demo conveniences, NOT session-store responsibilities. Demo can call capture-engine/volume-analyzer directly and pass results to session-store write interfaces. Session-store only provides write/read interfaces, not orchestration.

### Spec Status

Spec Status: unresolved (Phase 06 implementation not yet built)

Phase 06 will implement these interfaces, build Isolation Demo, validate with walkthrough, and mark spec resolved.
