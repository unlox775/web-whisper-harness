# Phase 06: Session Store Implementation

**Date**: 2026-08-26  
**Agent**: Cloud Agent (cursor/session-store-implementation-3369)  
**Package**: packages/datastore/session-store

## Summary

Implemented the session-store library and Isolation Demo as specified in Phase 01–05 planning documents.

## What Was Implemented

### 1. Session Store Library (`packages/datastore/session-store/src/`)

**Core modules:**
- `db.js` - IndexedDB initialization, schema setup, ID generation
- `sessions.js` - Session CRUD operations (create, get, list, delete with cascade)
- `chunks.js` - Chunk write/read operations (writeChunk, getChunk, getChunksForSession)
- `volume-profiles.js` - Volume profile write/read (writeVolumeProfile, getVolumeProfile)
- `snips.js` - Snip write/read (writeSnip, getSnipsForSession, getSnip)
- `transcripts.js` - Transcript write/read (writeTranscript, getTranscript, getTranscriptsForSession)
- `storage.js` - Storage stats and retention policy enforcement (getStorageStats, enforceRetentionPolicy)
- `index.js` - Main exports with init() for database name configuration

**IndexedDB Schema:**
- Database: `web-whisper-db` (production) or `web-whisper-sandbox-db` (demo)
- Object stores: sessions, chunks, volume-profiles, snips, transcripts
- Indexes: by-createdAt (sessions), by-sessionId + by-sessionId-seq (chunks), by-sessionId (snips, transcripts)

**Key Features:**
- Structured error objects (not thrown exceptions): `{error: 'session_not_found'}`, `{error: 'quota_exceeded'}`, `{error: 'database_unavailable'}`
- Referential integrity: validates session exists before writing chunks/volume/snips, validates snip exists before writing transcripts
- Cascade delete: deleteSession removes all related data (transcripts → snips → volume-profile → chunks → session)
- Automatic session metadata updates: chunkCount, sizeBytes, duration, hasVolumeProfile, hasSnips, hasTranscript flags
- Storage cap enforcement: enforceRetentionPolicy deletes oldest sessions until under cap
- ID generation: timestamp + random suffix (ses_, chunk_, snip_ prefixes)

### 2. Isolation Demo (`packages/datastore/session-store/isolation-demo/`)

**Desktop factory-floor store inspector** with 5-panel layout:

1. **Top Chrome Panel**: Database name chip ("SANDBOX DB"), live storage stats
2. **Write Operations Panel**: Create Session, Write Chunk (fixture data), Write Volume Profile (fixture), Write Snips (fixture), Write Transcript (manual text entry)
3. **Session List Panel**: Table with session metadata (ID, Created At, Duration, Chunks, Size, Volume?, Snips?, Transcripts?), Details/Delete buttons, expandable details view with tabs (Chunks, Volume Profile, Snips, Transcripts)
4. **Storage Management Panel**: Storage cap input, storage stats detail, Enforce Retention Policy button, retention log
5. **Reload Test Panel**: Reload Page button, persistence status badge

**Data Mode:** Fixture data (FIXTURE DATA labeled, cyan chip) - manual operator controls, sandbox database isolation

**Launch Command:**
```bash
cd packages/datastore/session-store/isolation-demo
npm start
```

Opens Vite dev server at `http://localhost:5173/`

**Validation Coverage:**
- ✅ Create sessions, write chunks/volume-profiles/snips/transcripts
- ✅ Read operations (list sessions, get session details, get chunks/volume/snips/transcripts)
- ✅ Delete session with cascade (verified via session list refresh)
- ✅ Enforce retention policy (delete oldest sessions to meet storage cap)
- ✅ Data persistence across page reloads (persistence status badge shows "Data persists across reloads ✓")
- ✅ Storage stats calculation (used bytes, cap bytes, session count, chunk count)

## Interfaces Shipped

All interfaces from producer responses are implemented:

### Session Operations
- `init({databaseName})` - Initialize database (required before other operations)
- `createSession()` → `{id: string}`
- `getSession(sessionId)` → session object or null
- `listSessions(options)` → `{sessions: Array, total: number}`
- `deleteSession(sessionId)` → `{deleted: true}` (cascade deletes all related data)

### Chunk Operations
- `writeChunk(sessionId, chunkData)` → `{chunkId: string}` or error
- `getChunk(chunkId)` → chunk object with blob or null
- `getChunksForSession(sessionId)` → `{chunks: Array}` (metadata only, no blobs)

### Volume Profile Operations
- `writeVolumeProfile(sessionId, volumeProfile)` → `{written: true}` or error
- `getVolumeProfile(sessionId)` → volume profile object or null

### Snip Operations
- `writeSnip(sessionId, snipData)` → `{snipId: string}` or error
- `getSnipsForSession(sessionId)` → `{snips: Array}` (sorted by startTime)
- `getSnip(snipId)` → snip object or null

### Transcript Operations
- `writeTranscript(snipId, transcriptText)` → `{written: true}` or error
- `getTranscript(snipId)` → transcript object or null
- `getTranscriptsForSession(sessionId)` → `{transcripts: Array}`

### Storage Management
- `getStorageStats()` → `{usedBytes, capBytes, sessionCount, chunkCount}`
- `enforceRetentionPolicy(capBytes)` → `{deletedSessions, reclaimedBytes, newUsedBytes}`

## How to Run the Demo

```bash
# From workspace root
cd packages/datastore/session-store/isolation-demo
npm start
```

Opens at `http://localhost:5173/`

**Demo Walkthrough:**
1. Click "Create Session" → session ID appears, row added to session list
2. Click "Write Chunk" 3 times → chunk count increments, session duration/size updates
3. Click "Write Volume Profile" → Volume? flag turns green ✓
4. Click "Write Snips" → Snips? shows "2"
5. Enter snip ID and text, click "Write Transcript" → Transcripts? shows count
6. Click "Details" on session row → tabs show chunks, volume profile, snips, transcripts
7. Click "Delete" on session row → confirm dialog → row removed, storage stats decrease
8. Create 5 sessions (~5 MB total), set cap to 2 MB, click "Enforce Retention Policy" → 3 oldest sessions deleted, retention log shows summary
9. Click "Reload Page" → session list repopulates with same data, persistence badge shows green ✓

## Branch and PR

**Branch:** cursor/session-store-implementation-3369  
**Status:** Committed, ready for PR creation

## Next Steps

1. Create PR for review
2. Phase 07 agents can consume session-store via ESM imports: `import * as sessionStore from '../datastore/session-store/src/index.js'`
3. Downstream packages (capture-engine, volume-analyzer, playback-engine, PWA) will integrate session-store in their respective Phase 06 implementations

## Known Gaps / Future Work

- No capture-engine integration in demo (fixture data only) - capture-engine is a separate Phase 06 package
- No volume-analyzer integration in demo (fixture volume data only) - volume-analyzer is a separate Phase 06 package
- No playback controls in demo (chunks are stored but not played back) - playback-engine is a separate Phase 06 package
- Quota exceeded error check in writeChunk is not yet implemented (needs storage cap config from caller)
- Phase 07 may request additional interfaces like deleteSnipsForSession (see volume-analyzer customer request)

All main paths exercised by Isolation Demo. Spec status can be marked resolved.
