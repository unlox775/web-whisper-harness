# Customer: packages/lib/volume-analyzer

Volume-analyzer is a customer of session-store for reading chunks (to compute volume), writing volume profiles, and writing snips.

## Producer's Understanding of This Customer

**Identity**: Volume-analyzer is a lib package that computes volume profiles from audio chunks and proposes snip boundaries based on quiet regions. It reads chunks from session-store, processes them, and writes volume profiles + snips back to session-store.

**Core need**: Read access to all chunks for a session (with blobs) for volume computation, write access for volume profiles and snips. Volume-analyzer needs session-store to provide ordered chunk reads (sorted by seq) with blobs included (unlike PWA's metadata-only reads). It also needs the ability to overwrite volume profiles (if user clicks "Recompute Volume" in developer mode) and append snips (multiple snip-write calls for the same session should accumulate snips, not replace).

**When volume-analyzer calls session-store**:

1. **PWA calls volume-analyzer.analyzeVolume(sessionId) post-recording**:
   - Volume-analyzer calls `getChunksForSession(sessionId)` → session-store returns chunk list (metadata only, NO blobs for performance)
   - Volume-analyzer iterates chunk list → calls `getChunk(chunkId)` for each chunk → session-store returns chunk blob + metadata
   - Volume-analyzer decodes each MP3 blob to PCM → computes peak dB per chunk → accumulates chunkVolumes array
   - Volume-analyzer calls `writeVolumeProfile(sessionId, {chunkVolumes: [{chunkId, peakDb}]})` → session-store validates sessionId exists → writes/replaces volume profile → updates session.hasVolumeProfile = true → returns confirmation

2. **PWA calls volume-analyzer.proposeSnips(sessionId) post-recording**:
   - Volume-analyzer calls `getVolumeProfile(sessionId)` → session-store returns volume profile or null
   - If null → volume-analyzer calls `analyzeVolume(sessionId)` first (see above), then re-calls `getVolumeProfile(sessionId)`
   - Volume-analyzer analyzes volume profile → detects quiet regions → proposes snip boundaries (e.g., snip 0: chunks 0–2, snip 1: chunks 3–5)
   - Volume-analyzer calls `writeSnip(sessionId, snipData)` per snip → session-store validates sessionId exists → writes snip (appends to existing snips) → updates session.hasSnips = true → returns snipId

**Inputs volume-analyzer will provide**:

1. **getChunksForSession(sessionId)** input: `sessionId: string`
2. **getChunk(chunkId)** input: `chunkId: string` (from getChunksForSession result)
3. **writeVolumeProfile(sessionId, volumeProfile)** inputs:
   - `sessionId: string`
   - `volumeProfile: {chunkVolumes: [{chunkId: string, peakDb: number}]}` (one entry per chunk, peakDb is max dB in chunk, typically -50 to 0 dB range)
4. **getVolumeProfile(sessionId)** input: `sessionId: string`
5. **writeSnip(sessionId, snipData)** inputs:
   - `sessionId: string`
   - `snipData: {startChunkIndex: number, endChunkIndex: number, startTime: number, endTime: number, duration: number, chunkIds: string[], confidence: number}` (startChunkIndex/endChunkIndex are array indices, startTime/endTime are seconds, duration is seconds, chunkIds is array of chunk IDs in snip range, confidence is 0.0–1.0 float representing snip quality)

**Outputs volume-analyzer expects**:

1. **getChunksForSession(sessionId)** → `{chunks: [{id, sessionId, seq, startTime, endTime, duration, sizeBytes}]}` (NO blobs, metadata only, sorted by seq asc) or error `{error: "database_unavailable"}`
2. **getChunk(chunkId)** → `{id, sessionId, seq, startTime, endTime, duration, blob: Blob, sizeBytes}` or null if not found
3. **writeVolumeProfile(sessionId, volumeProfile)** → `{written: true}` or error `{error: "session_not_found"}` or error `{error: "database_unavailable"}`
4. **getVolumeProfile(sessionId)** → `{sessionId, chunkVolumes: [{chunkId, peakDb}], createdAt}` or null if not found
5. **writeSnip(sessionId, snipData)** → `{snipId: string}` or error `{error: "session_not_found"}` or error `{error: "database_unavailable"}`

**Error handling expectations**:

Volume-analyzer will check return values for error field. If error exists:
- `session_not_found`: Volume-analyzer returns error to PWA → PWA displays "Session not found. Cannot analyze volume."
- `database_unavailable`: Volume-analyzer returns error to PWA → PWA displays "Storage unavailable. Cannot analyze volume."

Session-store must return error objects (NOT throw exceptions) so volume-analyzer can propagate gracefully to PWA.

**Referential integrity requirements**:

Volume-analyzer will NOT create sessions itself. PWA creates session, capture-engine writes chunks, then PWA calls volume-analyzer post-recording. Volume-analyzer assumes session exists and has chunks when it starts analysis.

Session-store MUST validate sessionId exists before writing volume profile or snip. If sessionId does not exist, return `{error: "session_not_found"}`.

**Volume profile overwrite behavior**:

Volume-analyzer may call `writeVolumeProfile` multiple times for the same sessionId (e.g., user clicks "Recompute Volume" button in developer mode, or PWA re-runs analysis after chunk corrections).

Session-store MUST **replace** existing volume profile with new one (NOT append, NOT error if exists). Volume profile object store uses sessionId as key (one volume profile per session), so IndexedDB put operation naturally overwrites.

When overwriting, session-store should update `session.updatedAt = now` but keep `session.hasVolumeProfile = true` (already set by first write).

**Snip append behavior**:

Volume-analyzer may call `writeSnip` multiple times for the same sessionId (e.g., call writeSnip once per proposed snip: writeSnip(sessionId, snip0), writeSnip(sessionId, snip1), writeSnip(sessionId, snip2)).

Session-store MUST **append** each snip (NOT replace all snips for session). Snips object store uses snip.id as key (unique snip ID generated per write), so multiple snips for the same sessionId coexist.

**When should volume-analyzer replace all snips** (TBD for Phase 04/05):
If volume-analyzer wants to replace all snips for a session (e.g., user clicks "Recompute Snips" button, old snips are stale), volume-analyzer should:
1. Call `getSnipsForSession(sessionId)` → get all existing snip IDs
2. Call `deleteSnip(snipId)` per existing snip (NOT YET IN SESSION-STORE INTERFACE; Phase 04 customer-request should request this if needed)
3. Call `writeSnip(sessionId, snipData)` per new snip

OR session-store could provide `replaceSnipsForSession(sessionId, snipDataArray)` that deletes all existing snips and writes new ones atomically. Phase 04 customer-request agent will decide.

**Performance expectations**:

- `getChunksForSession` should return quickly (< 100ms for 50 chunks) with metadata only (NO blobs).
- `getChunk` will be called once per chunk in sequence → volume-analyzer will accumulate blobs in memory for analysis. Acceptable latency: < 50ms per getChunk call.
- `writeVolumeProfile` should be fast (< 50ms) since volume profile is small (one peakDb float per chunk, e.g., 50 chunks = 50 floats = ~200 bytes JSON).
- `writeSnip` should be fast (< 50ms per snip) since snip is small metadata.

**What volume-analyzer does NOT need from session-store**:

- Does NOT need session creation (PWA does that)
- Does NOT need session listing/reading (PWA does that)
- Does NOT need chunk writes (capture-engine does that)
- Does NOT need transcript writes (PWA does that)
- Does NOT need session deletion (PWA does that)
- Does NOT need retention policy enforcement (PWA does that)

**Summary**: Volume-analyzer is a batch-read-then-write customer. It needs ordered chunk reads with blobs (via getChunksForSession + getChunk per chunk), write access for volume profiles (replace if exists), and write access for snips (append per snip). Session-store must provide fast single-chunk reads, volume profile overwrites, and snip appends. Volume-analyzer calls session-store synchronously (NOT streaming/reactive), processes data in memory, and writes results back.

## Customer Request

(To be filled by Phase 04 customer-request agent for volume-analyzer → session-store)

Volume-analyzer customer will write its request here: exact interfaces it needs (`getChunksForSession`, `writeVolumeProfile`, `getVolumeProfile`, `writeSnip`), what inputs it will provide (sessionId, volumeProfile: {chunkVolumes: [{chunkId, peakDb}]}, snipData: {startChunkIndex, endChunkIndex, startTime, endTime, duration, chunkIds}), what outputs it expects (chunk list with blobs, volume profile, snip IDs), error handling expectations (what errors are possible: session not found, chunks missing, volume profile missing).

## Producer Response

(To be filled by Phase 05 producer-response agent for session-store)

Session-store will respond here: how it will meet volume-analyzer's request, what interfaces it will provide, how it will handle volume profile overwrites (replace existing or error if exists), how it will handle snip writes (append or replace all snips for session), what error formats it will return.
