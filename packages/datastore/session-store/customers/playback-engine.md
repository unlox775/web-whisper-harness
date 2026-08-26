# Customer: packages/lib/playback-engine

Playback-engine is a customer of session-store for reading sessions, chunks, and snips for playback.

## Producer's Understanding of This Customer

**Identity**: Playback-engine is a lib package that plays audio from sessions, chunks, or snips. It reads session metadata, chunks (with blobs), and snips from session-store, concatenates audio blobs if needed, and plays via HTML5 Audio API or Web Audio API.

**Core need**: Read-only access to sessions, chunks (with blobs), and snips for playback. Playback-engine needs session-store to provide fast single-record reads (getSession, getChunk, getSnip) and ordered chunk reads (getChunksForSession sorted by seq). Playback-engine NEVER writes anything; it is a read-only customer.

**When playback-engine calls session-store**:

1. **PWA calls playback-engine.playSession(sessionId)**:
   - Playback-engine calls `getSession(sessionId)` → session-store returns session metadata `{id, createdAt, duration, chunkCount, sizeBytes, ...}` or null
   - If null → playback-engine returns error to PWA → PWA displays "Session not found"
   - Playback-engine calls `getChunksForSession(sessionId)` → session-store returns chunk list (metadata only, NO blobs)
   - Playback-engine iterates chunk list sorted by seq → calls `getChunk(chunkId)` for each chunk → session-store returns chunk blob + metadata
   - Playback-engine concatenates MP3 blobs (or uses MediaSource API for streaming) → plays audio via HTML5 `<audio>` element or Web Audio API

2. **PWA calls playback-engine.playChunk(chunkId)** (developer mode or chunk inspector):
   - Playback-engine calls `getChunk(chunkId)` → session-store returns chunk blob + metadata or null
   - If null → playback-engine returns error to PWA → PWA displays "Chunk not found"
   - Playback-engine plays single chunk blob via HTML5 Audio

3. **PWA calls playback-engine.playSnip(snipId)**:
   - Playback-engine calls `getSnip(snipId)` → session-store returns snip metadata `{id, sessionId, startChunkIndex, endChunkIndex, startTime, endTime, duration, chunkIds, ...}` or null
   - If null → playback-engine returns error to PWA → PWA displays "Snip not found"
   - Playback-engine iterates snip.chunkIds → calls `getChunk(chunkId)` for each chunk in snip → session-store returns chunk blobs
   - Playback-engine concatenates chunk blobs in range → plays audio (optionally trims start/end based on snip.startTime/endTime if needed)

**Inputs playback-engine will provide**:

1. **getSession(sessionId)** input: `sessionId: string`
2. **getChunksForSession(sessionId)** input: `sessionId: string`
3. **getChunk(chunkId)** input: `chunkId: string` (from getChunksForSession or snip.chunkIds)
4. **getSnip(snipId)** input: `snipId: string`

**Outputs playback-engine expects**:

1. **getSession(sessionId)** → `{id, createdAt, updatedAt, duration, chunkCount, sizeBytes, hasVolumeProfile, hasSnips, hasTranscript}` or null if not found
2. **getChunksForSession(sessionId)** → `{chunks: [{id, sessionId, seq, startTime, endTime, duration, sizeBytes}]}` (NO blobs, metadata only, sorted by seq asc) or error `{error: "database_unavailable"}`
3. **getChunk(chunkId)** → `{id, sessionId, seq, startTime, endTime, duration, blob: Blob, sizeBytes}` or null if not found
4. **getSnip(snipId)** → `{id, sessionId, startChunkIndex, endChunkIndex, startTime, endTime, duration, chunkIds: string[], confidence, createdAt}` or null if not found

**Error handling expectations**:

Playback-engine will check return values for null or error field. If error/null:
- `null` from getSession → playback-engine returns error to PWA → PWA displays "Session not found. Cannot play."
- `null` from getChunk → playback-engine emits `playbackError` event to PWA → PWA displays "Chunk missing. Playback failed."
- `null` from getSnip → playback-engine returns error to PWA → PWA displays "Snip not found. Cannot play."
- `database_unavailable` from getChunksForSession → playback-engine returns error to PWA → PWA displays "Storage unavailable. Cannot play."

Playback-engine will handle missing blobs gracefully:
- If `getChunk` returns chunk metadata but `blob` field is null or undefined (corrupted data) → playback-engine skips this chunk and continues to next chunk (plays available chunks only)
- If ALL chunks return null or missing blobs → playback-engine emits `playbackError` event to PWA → PWA displays "Session has no playable audio"

Session-store must return null for not-found records (NOT error object) so playback-engine can distinguish "not found" (null) from "database failure" (error object).

**Blob format expectations**:

Chunks are stored as MP3 blobs. Session-store returns `blob: Blob` field (JavaScript Blob object, MIME type "audio/mpeg").

Playback-engine will:
- Use `URL.createObjectURL(blob)` to create playable URL for HTML5 `<audio>` element
- OR use Blob directly with Web Audio API (decode blob to AudioBuffer)
- OR concatenate multiple blobs for session/snip playback (use MediaSource API or concatenate blob byte arrays)

Session-store does NOT need to transform blobs (e.g., convert MP3 to WAV). Playback-engine handles all audio format conversions if needed.

**Performance expectations**:

- `getSession` should be fast (< 50ms) since it is a single-record read by primary key.
- `getChunksForSession` should return quickly (< 100ms for 50 chunks) with metadata only (NO blobs).
- `getChunk` will be called once per chunk in sequence for playback → playback-engine will buffer chunks in memory. Acceptable latency: < 50ms per getChunk call. Playback-engine may implement lookahead buffering (pre-fetch next 5 chunks while playing current chunk).
- `getSnip` should be fast (< 50ms) since snip is small metadata.

**Referential integrity expectations**:

Playback-engine assumes sessions/chunks/snips exist (PWA lists sessions, user taps session card to play). However, edge cases exist:
- Session was deleted between list and play (PWA shows session card, user taps, but another tab deleted session) → getSession returns null → playback-engine returns error to PWA
- Chunk was deleted or corrupted → getChunk returns null → playback-engine skips chunk and continues playback with remaining chunks

Session-store does NOT need to enforce chunk existence for playback (playback-engine handles missing chunks gracefully). Session-store only needs to return null for not-found records.

**What playback-engine does NOT need from session-store**:

- Does NOT need session creation (PWA does that)
- Does NOT need session listing (PWA does that)
- Does NOT need ANY writes (playback is read-only)
- Does NOT need volume profile reads (playback does not display volume histogram; PWA or volume-analyzer reads volume profile for UI display)
- Does NOT need transcript reads (playback does not display transcripts; PWA reads transcripts for UI display)

**Playback-only read paths** (no writes, no deletes):

Playback-engine calls:
- `getSession(sessionId)` → read session metadata
- `getChunksForSession(sessionId)` → read chunk metadata list
- `getChunk(chunkId)` → read chunk blob + metadata (called once per chunk for session/snip playback)
- `getSnip(snipId)` → read snip metadata + chunkIds (for snip playback)

Playback-engine NEVER calls:
- `createSession`, `deleteSession`, `listSessions`
- `writeChunk`, `writeVolumeProfile`, `writeSnip`, `writeTranscript`
- `enforceRetentionPolicy`, `getStorageStats`

**Summary**: Playback-engine is a read-only customer. It needs fast single-record reads (getSession, getChunk, getSnip) and ordered chunk metadata reads (getChunksForSession sorted by seq). Session-store must return chunk blobs (Blob objects, MIME type "audio/mpeg") for playback. Playback-engine handles missing chunks gracefully (skips and continues playback) and does NOT write anything. Session-store must return null for not-found records (not error objects) so playback-engine can distinguish "not found" from "database failure".

## Customer Request

(To be filled by Phase 04 customer-request agent for playback-engine → session-store)

Playback-engine customer will write its request here: exact interfaces it needs (`getSession`, `getChunksForSession`, `getChunk`, `getSnip`), what inputs it will provide (sessionId, chunkId, snipId), what outputs it expects (session metadata, chunk list with blobs, single chunk blob + metadata, snip metadata + chunkIds), error handling expectations (what errors are possible: session/chunk/snip not found, blob missing, blob corrupt).

## Producer Response

(To be filled by Phase 05 producer-response agent for session-store)

Session-store will respond here: how it will meet playback-engine's request, what interfaces it will provide, what data formats it will return (session metadata structure, chunk structure with blob, snip structure with chunkIds), what error formats it will return, and how it will handle blob reads (IndexedDB blob retrieval, URL.createObjectURL if needed).
