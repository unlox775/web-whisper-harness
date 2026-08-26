# Phase 04: volume-analyzer → session-store Customer Request

**Date**: 2026-08-26  
**Phase**: 04 (Customer Requests)  
**Relationship**: packages/lib/volume-analyzer → packages/datastore/session-store  
**Customer Document**: `packages/datastore/session-store/customers/volume-analyzer.md`

## Relationship Summary

Volume-analyzer is a batch-read-then-write customer. It reads chunks from session-store (with blobs) for volume computation, writes volume profiles, and writes snips. Volume-analyzer never creates or deletes sessions; it only processes existing sessions post-recording.

## Customer Request Content

The volume-analyzer's customer request in `packages/datastore/session-store/customers/volume-analyzer.md` specifies:

- **`getChunksForSession(sessionId)` interface**: Called first step of volume analysis. Returns chunk list (metadata only, NO blobs, sorted by seq ASC). Volume-analyzer uses this to iterate chunks.

- **`getChunk(chunkId)` interface**: Called once per chunk (sequentially) to fetch blob for volume computation. Returns chunk object with blob or null. If null, volume-analyzer skips chunk and logs warning (volume profile will have gap for missing chunk).

- **`writeVolumeProfile(sessionId, volumeProfile)` interface**: Called after analyzing all chunks. Input: volumeProfile ({chunkVolumes: [{chunkId, peakDb}]}). Output: `{written: true}` or error. If volume profile already exists, session-store MUST replace (NOT append, NOT error).

- **`getVolumeProfile(sessionId)` interface**: Called for snip proposal. Returns volume profile or null. If null, volume-analyzer calls its own `analyzeVolume` first, then re-calls `getVolumeProfile`.

- **`writeSnip(sessionId, snipData)` interface**: Called once per proposed snip. Session-store MUST append each snip (NOT replace all snips for session). Multiple `writeSnip` calls for same sessionId coexist (unique snipId per write).

- **Optional `deleteSnipsForSession(sessionId)` interface** (for "Recompute Snips" feature): Deletes all snips for session before writing new ones. If session-store does NOT provide this, volume-analyzer can work around by letting PWA handle snip deletion.

- **Data validation requirements**: Chunk list MUST be sorted by seq ASC (volume-analyzer relies on sequential processing). Chunk blobs MUST be valid MP3 format (volume-analyzer decodes MP3 to PCM using Web Audio API). Session MUST exist before writes (session-store returns `{error: 'session_not_found'}` if session does not exist).

- **Performance requirements**: `getChunksForSession` < 100ms for < 50 chunks. `getChunk` < 50ms per call. `writeVolumeProfile` < 50ms (volume profile is small: ~50 floats = ~200 bytes JSON). `writeSnip` < 50ms per snip.

- **Error handling patterns**: All write errors returned as structured objects. Read interfaces return null for not-found (NOT error objects for single-record reads).

## Phase 05 Follow-Up

Phase 05 producer-response agent will write session-store's response in the same customer document, confirming how it will meet volume-analyzer's request.
