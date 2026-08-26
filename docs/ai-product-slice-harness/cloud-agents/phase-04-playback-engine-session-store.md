# Phase 04: playback-engine → session-store Customer Request

**Date**: 2026-08-26  
**Phase**: 04 (Customer Requests)  
**Relationship**: packages/lib/playback-engine → packages/datastore/session-store  
**Customer Document**: `packages/datastore/session-store/customers/playback-engine.md`

## Relationship Summary

Playback-engine is a read-only customer. It reads sessions, chunks (with blobs), and snips from session-store for audio playback. Playback-engine NEVER writes anything; it only reads data for playback.

## Customer Request Content

The playback-engine's customer request in `packages/datastore/session-store/customers/playback-engine.md` specifies:

- **`getSession(sessionId)` interface**: Called for playback preparation. Returns session metadata or null. If null, playback-engine returns error to PWA.

- **`getChunksForSession(sessionId)` interface**: Called for session/snip playback. Returns chunk list (metadata only, NO blobs, sorted by seq ASC). Playback-engine iterates list, calls `getChunk` per chunk to fetch blobs.

- **`getChunk(chunkId)` interface**: Called once per chunk for playback. Returns chunk object with blob or null. If null, playback-engine skips chunk and continues with remaining chunks (graceful degradation). If ALL chunks return null, playback-engine emits `playbackError('chunks_missing')`.

- **`getSnip(snipId)` interface**: Called for snip playback. Returns snip metadata (chunkIds array) or null. Playback-engine iterates chunkIds, calls `getChunk` per chunk, concatenates blobs.

- **Blob format requirements**: Chunk blobs MUST be valid MP3 format. Blob should have `type: 'audio/mpeg'` (not required, but helpful). Playback-engine uses `URL.createObjectURL(blob)` for HTML5 `<audio>` element or Web Audio API decode.

- **Blob concatenation requirement**: For multi-chunk sessions/snips, chunks MUST be sorted by seq ASC. Playback-engine concatenates blobs: `new Blob([blob1, blob2, blob3], {type: 'audio/mpeg'})`. HTML5 Audio plays concatenated blob as single continuous stream (seamless playback, no gaps).

- **Seek across chunks requirement**: Seek must work transparently. Playback-engine calculates offset into concatenated blob. PWA calls `handle.seek(480)` (8:00) → playback-engine sets HTML5 `<audio>` `.currentTime = 480`. PWA does NOT need to know which chunk contains 8:00.

- **Performance requirements**: `getSession` < 50ms. `getChunksForSession` < 100ms for < 50 chunks. `getChunk` < 50ms per call. `getSnip` < 50ms.

- **Error handling expectations**: Session-store returns null for not-found records (NOT error objects for single-record reads). Playback-engine checks for null, emits `playbackError` or returns error to PWA. If `getChunksForSession` returns `{error: 'database_unavailable'}`, playback-engine returns error to PWA.

- **Graceful degradation**: If some chunks missing (e.g., session has 10 chunks, chunks 3 and 7 return null), playback-engine skips missing chunks and plays remaining 8 chunks. User hears "jumps" in playback (audio skips from chunk 2 end to chunk 4 start). This is acceptable (better than failing playback entirely).

## Phase 05 Follow-Up

Phase 05 producer-response agent will write session-store's response in the same customer document, confirming how it will meet playback-engine's request.
