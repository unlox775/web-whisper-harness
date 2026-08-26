# Phase 05: session-store Producer Responses

**Date**: 2026-08-26  
**Phase**: 05 (Producer Responses)  
**Producer**: packages/datastore/session-store  
**Customer Documents**: 5 customer files in `packages/datastore/session-store/customers/`

## Producer Summary

Session-store is the datastore package that owns all durable recording data (sessions, chunks, volume profiles, snips, transcripts). It has 5 customers requesting interfaces:

1. **Isolation Demo** (`00-isolation-demo.md`): Standing human customer that proves session-store works independently with sandbox database isolation
2. **capture-engine** (`capture-engine.md`): High-frequency writer during recording (writes chunks every ~4s)
3. **volume-analyzer** (`volume-analyzer.md`): Batch processor that reads chunks, writes volume profiles and snips
4. **playback-engine** (`playback-engine.md`): Read-only customer that fetches sessions/chunks/snips for audio playback
5. **web-whisper-pwa** (`web-whisper-pwa.md`): Primary orchestrator that manages sessions, writes transcripts, enforces retention policy

## Producer Response Content

Session-store's producer responses in each customer document specify:

### Common Patterns Across All Customers

- **Sandbox database isolation**: `init({databaseName})` configuration allows demo to use `'web-whisper-sandbox-db'` separate from production `'web-whisper-db'`
- **Error handling**: All errors returned as structured objects (NOT thrown exceptions). Error codes: `session_not_found`, `snip_not_found`, `quota_exceeded`, `database_unavailable`
- **Performance targets**: Fast single-record reads (< 50ms), efficient queries with IndexedDB indexes, chunk writes < 100ms
- **IndexedDB schema**: 5 object stores (sessions, chunks, volume-profiles, snips, transcripts) with compound indexes for sorted queries

### Key Interface Decisions

- **`writeChunk`**: Validates sessionId exists, checks quota BEFORE write, updates session metadata atomically. Returns `{chunkId}` on success or structured error. Does NOT automatically enforce retention policy (PWA's responsibility).
- **`writeVolumeProfile`**: REPLACE existing volume profile (overwrite if exists, NOT error). Volume profiles object store uses sessionId as key.
- **`writeSnip`**: APPEND snips (multiple calls for same sessionId append snips, NOT replace). Unique snipId per write.
- **`deleteSession`**: CASCADE delete in single transaction (transcripts → snips → volume-profile → chunks → session). No orphan data.
- **`listSessions`**: Sorted by createdAt DESC (most recent first). Pagination via limit/offset. NO BLOBS in session records (performance).
- **`getChunksForSession`**: Returns metadata only (NO BLOBS). Sorted by seq ASC (critical for playback/volume-analysis ordering).
- **`getChunk`**: Returns chunk with blob for playback or volume analysis (single record read, includes blob).

### What Session-Store Will NOT Ship in Phase 06

- **`deleteSnipsForSession`**: Volume-analyzer requested this as optional. Out of scope. Workaround: PWA calls `getSnipsForSession` + per-snip delete if needed.
- **Live data integrations for demo**: Isolation Demo requested optional capture-engine/volume-analyzer integrations. Demo conveniences, NOT session-store responsibilities.

## Phase 06 Follow-Up

Phase 06 implementation agent will build session-store with these interfaces, create Isolation Demo, and validate with walkthrough.
