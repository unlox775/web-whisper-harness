# Session Store

IndexedDB schema and durable storage authority for all Web Whisper data. Owns sessions, chunks, volume profiles, snips, transcripts. Enforces retention policy (storage cap, deletion).

## Boundary

- **Owns**: IndexedDB schema (object stores: sessions, chunks, volume-profiles, snips, transcripts), all create/read/update/delete operations, storage quota enforcement (200 MB default cap, configurable), retention policy (delete oldest sessions when quota exceeded), data integrity (session existence validation, referential integrity for chunks/snips/transcripts)
- **Does NOT own**: Audio capture logic (capture-engine), volume computation logic (volume-analyzer), transcription logic (transcription-client), playback logic (playback-engine), UI (PWA)

## Main Callable Interfaces

(Planning names, not frozen APIs)

### Session Operations

- `createSession()` → returns session ID
- `getSession(sessionId)` → returns session metadata `{id, createdAt, duration, chunkCount, sizeBytes, hasVolumeProfile, hasSnips, hasTranscript}`
- `listSessions(options)` → returns session list (sorted by createdAt desc, paginated)
- `deleteSession(sessionId)` → deletes session + all chunks + volume profile + snips + transcripts

### Chunk Operations

- `writeChunk(sessionId, chunkData)` → writes chunk (called by capture-engine during recording)
- `getChunk(chunkId)` → returns chunk blob + metadata
- `getChunksForSession(sessionId)` → returns chunk list for session (ordered by seq)

### Volume Profile Operations

- `writeVolumeProfile(sessionId, volumeProfile)` → writes volume profile (called by volume-analyzer)
- `getVolumeProfile(sessionId)` → returns volume profile `{chunkVolumes: [{chunkId, peakDb}]}`

### Snip Operations

- `writeSnip(sessionId, snipData)` → writes snip (called by volume-analyzer)
- `getSnipsForSession(sessionId)` → returns snip list for session (ordered by startTime)
- `getSnip(snipId)` → returns snip metadata + chunk IDs

### Transcript Operations

- `writeTranscript(snipId, transcriptText)` → writes transcript (called by PWA after transcription-client returns text)
- `getTranscript(snipId)` → returns transcript text
- `getTranscriptsForSession(sessionId)` → returns transcript list for session (one per snip)

### Storage Management

- `getStorageStats()` → returns `{usedBytes, capBytes, sessionCount, chunkCount}`
- `enforceRetentionPolicy()` → deletes oldest sessions if quota exceeded (called by PWA after recording, or by periodic background task)

## Isolation Demo

See `isolation-demo/README.md` for the package-local runnable demo. The demo operates on a sandbox IndexedDB instance (not production data). It allows operator to: create sessions, write chunks (optionally via capture-engine in-memory → flush to store), write volume profiles + snips, write transcripts, read sessions, list sessions, delete sessions, enforce retention policy. It proves: schema works, writes work, reads work, retention policy works, storage cap is enforced.

## Product Specs

See `docs/specs/` for detailed implementation specs and work orders.

## Customers

- `apps/web-whisper-pwa` (primary customer; see `customers/web-whisper-pwa.md`)
- `packages/lib/capture-engine` (customer for chunk writes; see `customers/capture-engine.md`)
- `packages/lib/volume-analyzer` (customer for volume profile + snip writes; see `customers/volume-analyzer.md`)
- `packages/lib/playback-engine` (customer for session + chunk + snip reads; see `customers/playback-engine.md`)
- Isolation Demo (standing human customer; see `customers/00-isolation-demo.md`)
