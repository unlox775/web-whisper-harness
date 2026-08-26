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

I'm playback-engine. I need session-store to provide read-only access to sessions, chunks (with blobs), and snips for audio playback. Playback is the proof of recording: if users can't play it, they didn't record it. Here's what I need:

### Core Interfaces I Need

**`getSession(sessionId)`** (playback preparation)

When I call it: PWA calls my `playSession(sessionId)`, I need session metadata first

Input: `sessionId: string` (from PWA)

Output I expect:
- Success: `{id: string, createdAt: string, updatedAt: string, duration: number, chunkCount: number, sizeBytes: number, hasVolumeProfile: boolean, hasSnips: boolean, hasTranscript: boolean}`
- Not found: `null`

How I use it:
- I validate session exists before starting playback
- If `null` → I return error to PWA: `{error: 'session_not_found', sessionId}`
- PWA shows error toast: "Session not found. Cannot play."
- If session exists → I use `session.duration` for playback UI (total duration display)
- I use `session.chunkCount` to validate expected number of chunks

**`getChunksForSession(sessionId)`** (chunk list for session/snip playback)

When I call it: PWA calls my `playSession(sessionId)`, I need ordered chunk list to assemble audio

Input: `sessionId: string`

Output I expect:
```javascript
{
  chunks: [
    {
      id: string,
      sessionId: string,
      seq: number, // 0-indexed, sorted by seq ASC
      startTime: number, // seconds (float)
      endTime: number, // seconds (float)
      duration: number, // seconds (float)
      sizeBytes: number
      // NO BLOB for performance (I'll call getChunk per chunk to fetch blobs)
    },
    // ... more chunks, sorted by seq ASC
  ]
}
```

Failure: `{error: 'database_unavailable', reason?: string}`

How I use it:
- I get chunk list (metadata only, fast query)
- I iterate chunk list → call `getChunk(chunkId)` for each chunk to fetch blob
- I concatenate MP3 blobs: `new Blob([blob1, blob2, blob3], {type: 'audio/mpeg'})`
- I play concatenated blob via HTML5 `<audio>` element: `audioElement.src = URL.createObjectURL(concatenatedBlob)`

Sorting requirement: **MUST be sorted by seq ASC**. If chunks are out of order, concatenated playback will sound scrambled.

**`getChunk(chunkId)`** (per-chunk blob fetch for playback)

When I call it: After `getChunksForSession`, I iterate chunk list and call `getChunk` for each chunk

Input: `chunkId: string` (from chunk list or snip.chunkIds)

Output I expect:
- Success: `{id: string, sessionId: string, seq: number, startTime: number, endTime: number, duration: number, blob: Blob, sizeBytes: number}`
- Not found: `null`

Blob format requirement: `blob` field MUST be JavaScript Blob object with MIME type `'audio/mpeg'`. I will use `URL.createObjectURL(blob)` for HTML5 Audio or `audioContext.decodeAudioData()` for Web Audio API.

How I use it:
- I fetch chunk blob for playback
- If `null` (chunk not found or blob missing):
  - I log warning: "Chunk {chunkId} not found. Skipping."
  - I continue with remaining chunks (play available chunks only, skip missing ones)
  - If ALL chunks return null → I emit `playbackError('chunks_missing')` to PWA → PWA shows error toast "Session has no playable audio."
- If blob is corrupt (HTML5 audio decode fails):
  - I emit `playbackError('audio_decode_failed', {chunkId})` to PWA → PWA shows error toast "Playback failed: audio decode error"
  - I may skip corrupt chunk and continue with remaining chunks (graceful degradation)

**`getSnip(snipId)`** (snip playback)

When I call it: PWA calls my `playSnip(snipId)`, I need snip metadata (chunkIds) to assemble audio

Input: `snipId: string` (from PWA)

Output I expect:
- Success: `{id: string, sessionId: string, startChunkIndex: number, endChunkIndex: number, startTime: number, endTime: number, duration: number, chunkIds: string[], confidence: number, createdAt: string}`
- Not found: `null`

How I use it:
- I validate snip exists before starting playback
- If `null` → I return error to PWA: `{error: 'snip_not_found', snipId}`
- PWA shows error toast: "Snip not found. Cannot play."
- If snip exists → I iterate `snip.chunkIds` → call `getChunk(chunkId)` for each chunk
- I concatenate chunk blobs → play via HTML5 Audio
- I may trim start/end of concatenated audio based on `snip.startTime` and `snip.endTime` if needed (optional optimization, NOT required for Phase 04)

### Error Handling Patterns

**`null` from `getSession`** (session not found):

When this happens: Session was deleted between PWA's listSessions call and my playSession call

What I do:
- Return error to PWA: `{error: 'session_not_found', sessionId}`
- PWA shows error toast: "Session not found. Cannot play."

**`null` from `getChunk`** (chunk not found or blob missing):

When this happens: Chunk was deleted, corrupted, or blob is missing

What I do:
- Log warning: "Chunk {chunkId} not found. Skipping."
- Continue with remaining chunks (play available chunks only)
- If ALL chunks return null → emit `playbackError('chunks_missing', {sessionId})` to PWA
- PWA shows error toast: "Session has no playable audio."

**`null` from `getSnip`** (snip not found):

When this happens: Snip was deleted between PWA's getSnipsForSession call and my playSnip call

What I do:
- Return error to PWA: `{error: 'snip_not_found', snipId}`
- PWA shows error toast: "Snip not found. Cannot play."

**`{error: 'database_unavailable'}`** from `getChunksForSession`:

When this happens: IndexedDB read fails (browser storage error, permissions issue, etc.)

What I do:
- Return error to PWA: `{error: 'database_unavailable', reason}`
- PWA shows error toast: "Storage unavailable. Cannot play."

**HTML5 Audio decode error** (during playback, not pre-playback):

When this happens: Blob is corrupt or unsupported format, HTML5 Audio element emits `error` event

What I do:
- Emit `playbackError('audio_decode_failed', {chunkId or sessionId})` to PWA
- PWA shows error toast: "Playback failed: audio decode error"
- I may skip corrupt chunk and continue with remaining chunks (graceful degradation)

### Blob Concatenation Requirements

For session playback (multiple chunks):
- I call `getChunksForSession(sessionId)` → get chunk list
- I iterate chunk list → call `getChunk(chunkId)` for each → collect blobs
- I concatenate MP3 blobs: `new Blob([blob1, blob2, ...], {type: 'audio/mpeg'})`
- I play concatenated blob: `audioElement.src = URL.createObjectURL(concatenatedBlob)`

**Critical requirement**: Chunks MUST be sorted by seq ASC. If chunks are out of order, concatenated audio will sound scrambled (chunk 2 plays before chunk 1, etc.).

**Seamless playback requirement**: MP3 chunks concatenated as single blob MUST play seamlessly with NO audible gaps between chunks. HTML5 Audio element treats concatenated blob as single continuous stream.

Alternative (sequential chunk playback with `ended` event chaining): NOT acceptable because it introduces gaps between chunks. I MUST use blob concatenation.

### Performance Requirements

- `getSession`: < 50ms (single record read by primary key)
- `getChunksForSession`: < 100ms for typical chunk counts (< 50 chunks)
- `getChunk`: < 50ms per call (I may implement lookahead buffering: pre-fetch next 5 chunks while playing current chunk to avoid playback stalls)
- `getSnip`: < 50ms (single record read)

If `getChunk` is slow (> 100ms per chunk), playback startup becomes sluggish (user waits 5+ seconds for 50-chunk session to load). Optimize with IndexedDB by-id index (primary key lookup).

### Blob Format Requirements

**Chunk blobs MUST be valid MP3 format**: I use HTML5 `<audio>` element or Web Audio API to decode/play. If blob is corrupt or wrong format, decode fails → playback error.

**Blob MIME type**: Blob should have `type: 'audio/mpeg'` (not required, but helpful for debugging).

**Blob size**: I expect `blob.size` to match `chunk.sizeBytes` metadata. If mismatch, I log warning (may indicate blob corruption).

### What I Do NOT Need

- I do NOT need `createSession` (PWA does that)
- I do NOT need `listSessions` (PWA does that)
- I do NOT need ANY write operations (I am read-only customer)
  - Do NOT need `writeChunk` (capture-engine does that)
  - Do NOT need `writeVolumeProfile` or `writeSnip` (volume-analyzer does that)
  - Do NOT need `writeTranscript` (PWA does that)
- I do NOT need `deleteSession` (PWA does that)
- I do NOT need `enforceRetentionPolicy` (PWA does that)
- I do NOT need `getVolumeProfile` (I do NOT display volume histogram; PWA reads volume profile for UI display)
- I do NOT need `getTranscriptsForSession` (I do NOT display transcripts; PWA reads transcripts for UI display)

I am a **read-only playback customer**: read sessions → read chunks → concatenate blobs → play audio. Session-store must provide fast single-record reads and ordered chunk reads with blobs.

### Graceful Degradation for Missing Chunks

**Edge case**: Session has 10 chunks, but chunks 3 and 7 are missing (deleted or corrupted)

What I do:
- Call `getChunksForSession(sessionId)` → get list of 10 chunks
- Iterate list → call `getChunk(chunkId)` for each
- Chunks 3 and 7 return `null` → I log warning, skip them
- I concatenate remaining 8 chunks → play audio with gaps where chunks 3 and 7 should be
- User hears "jumps" in playback (audio skips from chunk 2 end to chunk 4 start)
- This is acceptable behavior (better than failing playback entirely)

Alternative (strict mode): If ANY chunk is missing → I emit `playbackError('chunks_missing')` and refuse to play. This is NOT required for Phase 04 (graceful degradation is preferred).

### Summary of Interfaces

| Interface | Input | Output | Failure Result |
|-----------|-------|--------|----------------|
| `getSession(sessionId)` | sessionId (string) | Session object or `null` | N/A (null is expected return) |
| `getChunksForSession(sessionId)` | sessionId (string) | `{chunks: [...]}` (NO blobs, sorted by seq ASC) | `{error: 'database_unavailable'}` |
| `getChunk(chunkId)` | chunkId (string) | Chunk object with blob or `null` | N/A (null is expected return) |
| `getSnip(snipId)` | snipId (string) | Snip object or `null` | N/A (null is expected return) |

All pre-playback errors returned as null (NOT error objects, for single-record reads) or structured error objects (for queries). Runtime playback errors (audio decode failures) handled by HTML5 Audio error events (I emit `playbackError` to PWA).

## Producer Response

(To be filled by Phase 05 producer-response agent for session-store)

Session-store will respond here: how it will meet playback-engine's request, what interfaces it will provide, what data formats it will return (session metadata structure, chunk structure with blob, snip structure with chunkIds), what error formats it will return, and how it will handle blob reads (IndexedDB blob retrieval, URL.createObjectURL if needed).
