# Session Store

IndexedDB schema and durable storage authority for all Web Whisper data. Owns sessions, chunks, volume profiles, snips, transcripts. Enforces retention policy (storage cap, deletion).

## Boundary

- **Owns**: IndexedDB schema (object stores: sessions, chunks, volume-profiles, snips, transcripts), all create/read/update/delete operations, storage quota enforcement (200 MB default cap, configurable), retention policy (purge transcribed audio when quota exceeded; keep transcripts), data integrity (session existence validation, referential integrity for chunks/snips/transcripts)
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
- `enforceRetentionPolicy(capBytes)` → purges audio (and volume/waveform data) for snips that already have a successful transcript when over/approaching the cap; keeps sessions and transcript text. Oldest fully-transcribed audio first. Untranscribed audio is never deleted.

### Session audio archive (formatVersion 1)

Portable **zip** of one session (manifest + remaining audio chunks). MIME `application/zip` (import also accepts `application/x-zip-compressed`). Filename: `web-whisper-session-<id>-<timestamp>.zip` where `<timestamp>` is Unix epoch milliseconds.

Zip contents:

- `manifest.json` — `formatVersion` (`1`), `exportedAt` (ISO-8601), `kind: "web-whisper-session-archive"`, session row fields (`id`, `createdAt`, `updatedAt`, `duration`, `chunkCount`, `sizeBytes`, `hasVolumeProfile`, `hasSnips`, `hasTranscript`, `status`), optional `notes`, and `chunks[]` metadata (`id`, `seq`, `startTime`, `endTime`, `duration`, `mime`, `sizeBytes`, `audioPurgedAt`, `file`)
- `chunks/NNN.<ext>` — audio bytes only when the chunk is still present (`NNN` is zero-padded `seq`; `audio/mpeg` → `mp3`, `audio/webm` → `webm`, else `bin`)
- Purged / empty chunks stay in `manifest.json` with `file: null` and no zip entry
- Optional (export flags, **default OFF**): `includeSnips` → `snips.json`, `includeTranscripts` → `transcripts.json`, `includeVolumeProfile` → `volume-profile.json`

APIs (errors are `{ error }` objects, same as the rest of this package):

- `exportSessionArchive(sessionId, options?)` → `Blob` or `{ error: 'session_not_found' | 'database_unavailable' }`. Options: `{ includeSnips?, includeTranscripts?, includeVolumeProfile?, notes? }` — all optional includes default `false`.
- `parseSessionArchive(blob)` → parse-only (no IndexedDB writes). Returns `{ formatVersion, exportedAt, session, notes?, chunks: [{ meta, blob | null }], snips?, transcripts?, volumeProfile? }` or a named error: `not_a_zip`, `missing_manifest`, `corrupt_json`, `invalid_manifest`, `kind_mismatch`, `unsupported_format_version`. Unknown future `formatVersion` fails; it is not guessed.
- `importSessionArchive(blob, options?)` → writes into the **current** DB (`init()` name: PWA `web-whisper-db` or Isolation Demo `web-whisper-isolation-demo-session-store`). **Default: new IDs** (`generateId('ses')` / `generateId('chunk')`, `sessionId` rewritten on chunks). `options.preserveIds === true` keeps archive IDs if they do not collide; collision returns `{ error: 'id_collision' }` unless `overwrite === true` (default off). Optional JSON files are imported when present.

`sessionArchiveFilename(sessionId, timestampMs?)` builds the documented download name.

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
