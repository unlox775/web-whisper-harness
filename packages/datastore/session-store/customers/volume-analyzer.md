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

I'm volume-analyzer. I need session-store to provide read access to chunks (with blobs) for volume computation and write access for volume profiles and snips. I am the bridge between raw audio chunks and meaningful snips ready for transcription. Here's what I need:

### Core Interfaces I Need

**`getChunksForSession(sessionId)`** (first step of volume analysis)

When I call it: PWA calls my `analyzeVolume(sessionId)` or `proposeSnips(sessionId)`

Input: `sessionId: string` (from PWA)

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
- I decode each MP3 blob → compute peak dB → accumulate chunkVolumes array
- I call `writeVolumeProfile(sessionId, {chunkVolumes})` to persist results

Sorting requirement: **MUST be sorted by seq ASC**. I process chunks in sequential order for accurate volume profile computation.

**`getChunk(chunkId)`** (per-chunk blob fetch for volume analysis)

When I call it: After `getChunksForSession`, I iterate chunk list and call `getChunk` for each chunk

Input: `chunkId: string` (from chunk list)

Output I expect:
- Success: `{id: string, sessionId: string, seq: number, startTime: number, endTime: number, duration: number, blob: Blob, sizeBytes: number}`
- Not found: `null`

How I use it:
- I fetch chunk blob for volume computation
- I decode MP3 blob to PCM using Web Audio API (`audioContext.decodeAudioData(arrayBuffer)`)
- I compute peak dB from PCM samples: `peakDb = 20 * Math.log10(maxAbsSample)`
- If blob is missing or corrupt (decode fails) → I skip this chunk and log warning (volume profile will have gap for this chunkId)

**`writeVolumeProfile(sessionId, volumeProfile)`** (after volume computation completes)

When I call it: After analyzing all chunks, I persist volume profile to session-store

Input:
- `sessionId: string`
- `volumeProfile: {chunkVolumes: [{chunkId: string, peakDb: number}]}`
  - `chunkVolumes`: Array of per-chunk volume measurements
  - `peakDb`: Max decibel level in chunk, typically -50 to 0 dB range (0 dB = full scale, -50 dB = near silence)

Output I expect:
- Success: `{written: true}`
- Session not found: `{error: 'session_not_found', sessionId: string}`
- Failure: `{error: 'database_unavailable', reason?: string}`

How I use it:
- After computing chunkVolumes array → call `writeVolumeProfile(sessionId, {chunkVolumes})`
- If success → return success to PWA → PWA updates session card to show "Volume? ✓"
- If `session_not_found` → return error to PWA → PWA shows error toast "Session not found. Cannot save volume profile."
- If `database_unavailable` → return error to PWA → PWA shows error toast "Storage unavailable. Cannot save volume profile."

**Overwrite behavior requirement**: If volume profile already exists for this sessionId (e.g., user clicks "Recompute Volume" in developer mode), session-store MUST **replace** existing volume profile with new one (NOT error, NOT append). Volume profile object store uses sessionId as key (one volume profile per session), so IndexedDB put operation should naturally overwrite.

**`getVolumeProfile(sessionId)`** (for snip proposal)

When I call it: PWA calls my `proposeSnips(sessionId)` → I need existing volume profile to detect quiet regions

Input: `sessionId: string`

Output I expect:
- Success: `{sessionId: string, chunkVolumes: [{chunkId: string, peakDb: number}], createdAt: string}`
- Not found: `null` (no volume profile exists yet)

How I use it:
- I call `getVolumeProfile(sessionId)` first
- If null → I call my own `analyzeVolume(sessionId)` first (compute volume profile), then call `getVolumeProfile(sessionId)` again
- Once I have volume profile → I analyze chunkVolumes array → detect quiet regions (e.g., 3+ consecutive chunks with peakDb < -40 dB) → propose snip boundaries
- I call `writeSnip(sessionId, snipData)` for each proposed snip

**`writeSnip(sessionId, snipData)`** (after snip proposal completes)

When I call it: After analyzing volume profile and detecting quiet regions, I write each proposed snip

Input:
- `sessionId: string`
- `snipData: {startChunkIndex: number, endChunkIndex: number, startTime: number, endTime: number, duration: number, chunkIds: string[], confidence: number}`
  - `startChunkIndex`: Array index of first chunk in snip (e.g., 0)
  - `endChunkIndex`: Array index of last chunk in snip (e.g., 2 for snip spanning chunks 0–2)
  - `startTime`: Snip start time in seconds (e.g., 0.00s)
  - `endTime`: Snip end time in seconds (e.g., 12.34s)
  - `duration`: Snip duration in seconds (e.g., 12.34s), `endTime - startTime`
  - `chunkIds`: Array of chunk IDs in snip range (e.g., `['chunk_0', 'chunk_1', 'chunk_2']`)
  - `confidence`: Snip quality score 0.0–1.0 (e.g., 0.95 = high confidence quiet boundary, 0.60 = low confidence noisy boundary)

Output I expect:
- Success: `{snipId: string}` (unique snip ID generated by session-store, format like `snip_sess_20260826152037_abc123_0`)
- Session not found: `{error: 'session_not_found', sessionId: string}`
- Failure: `{error: 'database_unavailable', reason?: string}`

How I use it:
- I call `writeSnip(sessionId, snipData)` once per proposed snip (e.g., 3 snips → 3 separate writeSnip calls)
- Session-store MUST **append** each snip (NOT replace all snips for session)
- If success → accumulate snipIds, return to PWA → PWA shows "Snips? 3" indicator
- If error → return error to PWA → PWA shows error toast

**Append behavior requirement**: Multiple `writeSnip` calls for the same sessionId MUST append snips (NOT replace). Snips object store uses unique snipId as key, so multiple snips for the same sessionId coexist.

### Snip Replacement Pattern (for "Recompute Snips" feature)

**Optional interface I need**: `deleteSnipsForSession(sessionId)` (if session-store provides this)

Use case: User clicks "Recompute Snips" button in PWA → old snips are stale → I need to delete old snips before writing new ones

Proposed workflow:
1. PWA calls my `proposeSnips(sessionId, {replace: true})`
2. I call `deleteSnipsForSession(sessionId)` → session-store deletes all snips for this session → returns `{deleted: number}`
3. I compute new snips → call `writeSnip(sessionId, snipData)` per new snip

Alternative (if session-store does NOT provide `deleteSnipsForSession`):
1. PWA calls `getSnipsForSession(sessionId)` → gets all existing snip IDs
2. PWA calls `deleteSnip(snipId)` per existing snip (if session-store provides per-snip delete)
3. PWA calls my `proposeSnips(sessionId)` → I write new snips

**Decision for Phase 04**: I will request `deleteSnipsForSession(sessionId)` interface for convenience. If session-store does NOT provide it in Phase 05, I can work around by letting PWA handle snip deletion before calling me.

### Error Handling Patterns

**`{error: 'session_not_found'}`**:

When this happens: Session was deleted between PWA's call and my writeVolumeProfile/writeSnip call

What I do:
- Return error to PWA with details: `{error: 'session_not_found', sessionId}`
- PWA shows error toast: "Session not found. Cannot save volume profile/snips."

**`{error: 'database_unavailable'}`**:

When this happens: IndexedDB write/read fails (browser storage error, permissions issue, disk full, etc.)

What I do:
- Return error to PWA with details: `{error: 'database_unavailable', reason}`
- PWA shows error toast: "Storage unavailable. Cannot save volume profile/snips."

**Null return from `getChunk`** (chunk not found or blob missing):

When this happens: Chunk was deleted or corrupted between getChunksForSession and getChunk call

What I do:
- Log warning: "Chunk {chunkId} not found or blob missing. Skipping volume computation for this chunk."
- Continue processing remaining chunks (volume profile will have gap for missing chunk)
- If ALL chunks return null → return error to PWA: `{error: 'no_chunks_available', sessionId}`

### Performance Requirements

- `getChunksForSession`: < 100ms for typical chunk counts (< 50 chunks)
- `getChunk`: < 50ms per call (I call this once per chunk sequentially)
- `writeVolumeProfile`: < 50ms (volume profile is small: ~50 floats = ~200 bytes JSON)
- `writeSnip`: < 50ms per snip (snip is small metadata)
- `getVolumeProfile`: < 50ms (single record read)

If `getChunk` is slow (> 100ms per chunk), volume analysis becomes sluggish for long sessions (100+ chunks). Optimize with IndexedDB by-id index (primary key lookup).

### Data Validation Requirements

**Chunk list MUST be sorted by seq ASC**: I rely on sequential processing for accurate volume profile. If chunks are out of order, volume profile will be incorrect (wrong chunk-to-peakDb mapping).

**Chunk blobs MUST be valid MP3 format**: I decode MP3 to PCM using Web Audio API. If blob is corrupt or wrong format, decode fails → I skip chunk and log warning.

**Session MUST exist before writes**: I assume PWA created session and capture-engine wrote chunks before PWA calls my `analyzeVolume`. If session does not exist, session-store MUST return `{error: 'session_not_found'}` (NOT crash, NOT write orphan data).

### What I Do NOT Need

- I do NOT need `createSession` (PWA does that)
- I do NOT need `listSessions` (PWA does that)
- I do NOT need `writeChunk` (capture-engine does that during recording; I only read chunks)
- I do NOT need `writeTranscript` (PWA does that after transcription-client completes)
- I do NOT need `deleteSession` (PWA does that)
- I do NOT need `enforceRetentionPolicy` (PWA does that)
- I do NOT need playback interfaces (playback-engine does that)

I am a **batch processor**: read chunks → compute volume profile → write volume profile → read volume profile → propose snips → write snips. Session-store must provide fast chunk reads and reliable profile/snip writes.

### Summary of Interfaces

| Interface | Input | Output | Failure Result |
|-----------|-------|--------|----------------|
| `getChunksForSession(sessionId)` | sessionId (string) | `{chunks: [...]}` (NO blobs, sorted by seq ASC) | `{error: 'database_unavailable'}` |
| `getChunk(chunkId)` | chunkId (string) | Chunk object with blob or `null` | N/A (null is expected return) |
| `writeVolumeProfile(sessionId, volumeProfile)` | sessionId (string), volumeProfile ({chunkVolumes}) | `{written: true}` | `{error: 'session_not_found'}` or `{error: 'database_unavailable'}` |
| `getVolumeProfile(sessionId)` | sessionId (string) | Volume profile object or `null` | N/A (null is expected return) |
| `writeSnip(sessionId, snipData)` | sessionId (string), snipData ({startChunkIndex, endChunkIndex, startTime, endTime, duration, chunkIds, confidence}) | `{snipId: string}` | `{error: 'session_not_found'}` or `{error: 'database_unavailable'}` |
| `deleteSnipsForSession(sessionId)` (optional) | sessionId (string) | `{deleted: number}` | `{error: 'database_unavailable'}` |

All write errors returned as structured objects (NOT thrown exceptions). Read interfaces return null for not-found (NOT error objects).

## Producer Response

(To be filled by Phase 05 producer-response agent for session-store)

Session-store will respond here: how it will meet volume-analyzer's request, what interfaces it will provide, how it will handle volume profile overwrites (replace existing or error if exists), how it will handle snip writes (append or replace all snips for session), what error formats it will return.
