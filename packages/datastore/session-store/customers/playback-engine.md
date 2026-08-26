# Customer: packages/lib/playback-engine

Playback-engine is a customer of session-store for reading sessions, chunks, and snips for playback.

## Producer's Understanding of This Customer

(To be filled by Phase 03 product-spec agent for session-store)

Playback-engine needs session-store to:
- Read session metadata for session playback (PWA calls `playSession(sessionId)` → playback-engine calls `getSession(sessionId)` → reads session metadata: duration, chunkCount → then calls `getChunksForSession(sessionId)` → reads all chunk blobs → concatenates MP3s → plays audio)
- Read single chunk for chunk playback (PWA calls `playChunk(chunkId)` → playback-engine calls `getChunk(chunkId)` → reads chunk blob + metadata → plays audio)
- Read snip metadata + chunks for snip playback (PWA calls `playSnip(snipId)` → playback-engine calls `getSnip(snipId)` → reads snip metadata: startChunkIndex, endChunkIndex, chunkIds → then calls `getChunk` per chunk in range → concatenates MP3s → plays audio)
- Validate existence (before reading, session-store should validate sessionId/chunkId/snipId exists; if not, return error "Session not found" / "Chunk not found" / "Snip not found")

Playback-engine will:
- NOT write anything (playback is read-only)
- Handle missing data gracefully (if chunk blob missing or corrupt, playback-engine will emit `playbackError` event to caller; PWA displays "Playback failed" to user)

## Customer Request

(To be filled by Phase 04 customer-request agent for playback-engine → session-store)

Playback-engine customer will write its request here: exact interfaces it needs (`getSession`, `getChunksForSession`, `getChunk`, `getSnip`), what inputs it will provide (sessionId, chunkId, snipId), what outputs it expects (session metadata, chunk list with blobs, single chunk blob + metadata, snip metadata + chunkIds), error handling expectations (what errors are possible: session/chunk/snip not found, blob missing, blob corrupt).

## Producer Response

(To be filled by Phase 05 producer-response agent for session-store)

Session-store will respond here: how it will meet playback-engine's request, what interfaces it will provide, what data formats it will return (session metadata structure, chunk structure with blob, snip structure with chunkIds), what error formats it will return, and how it will handle blob reads (IndexedDB blob retrieval, URL.createObjectURL if needed).
