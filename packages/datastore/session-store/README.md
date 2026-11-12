# Session Store

IndexedDB schema and durable storage authority for all Web Whisper data. Owns sessions, chunks, volume profiles, snips, transcripts, and **durable per-package logs**. Enforces retention policy (storage cap, deletion, age-based log prune).

## Boundary

- **Owns**: IndexedDB schema (object stores: sessions, chunks, volume-profiles, snips, transcripts, **logs**), all create/read/update/delete operations, storage quota enforcement (200 MB default cap, configurable), retention policy (purge transcribed audio when quota exceeded; keep transcripts; **age-prune log rows**), durable per-package logging (`log` / `queryLogs` / byte accounting), data integrity (session existence validation, referential integrity for chunks/snips/transcripts/logs)
- **Does NOT own**: Audio capture logic (capture-engine), volume computation logic (volume-analyzer), transcription logic (transcription-client), playback logic (playback-engine), UI (PWA)

## Main Callable Interfaces

(Planning names, not frozen APIs)

### Session Operations

- `createSession()` → returns session ID
- `getSession(sessionId)` → returns session metadata `{id, createdAt, duration, chunkCount, sizeBytes, hasVolumeProfile, hasSnips, hasTranscript}`
- `listSessions(options)` → returns session list (sorted by createdAt desc, paginated)
- `deleteSession(sessionId)` → deletes session + all chunks + volume profile + snips + transcripts + **logs**

### Chunk Operations

- `writeChunk(sessionId, chunkData)` → writes chunk (called by capture-engine during recording). Concurrent-safe, owner-serialized, idempotent by `(sessionId, seq)`.
- `getChunk(chunkId)` → returns chunk blob + metadata
- `getChunksForSession(sessionId)` → returns chunk list for session (ordered by seq)
- `getChunkCoverage(sessionId)` → `{ expectedFirstSeq, lastSeq, savedCount, missingSeqs, savedDurationMs, lostChunks }`
- `recordChunkLost(sessionId, {seq,startMs,endMs,reason})` → persists a permanent loss record on the session

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

- `getStorageStats()` → `{usedBytes, capBytes, sessionCount, chunkCount, logBytes, logEntryCount, logWriteFailures, logBytesByPackage}` (`usedBytes` includes log bytes; the existing **1.1 IndexedDB overhead** applies to logs the same way as chunks). `logWriteFailures` is a persisted counter; log persist failures are never swallowed. web-whisper-pwa may call this during recording **because it is O(1)**; the PWA does not cursor chunks itself and does **not** call `getStorageStats` on every encoded chunk (last-known usedBytes + incremental `byteLength × 1.1`).
- `enforceRetentionPolicy(capBytes, options?)` → purges audio (and volume/waveform data) for snips that already have a successful transcript when over/approaching the cap; keeps sessions and transcript text. Oldest fully-transcribed audio first. Untranscribed audio is never deleted. Also **age-prunes and count-bounds log rows** (default 14 days / `MAX_LOG_COUNT` 100_000) independently of the cap. Safe to call any time: owner-serialized, customer writes have priority, deletes run in small batches that yield to `writeChunk` (< ~500 ms wait), and **returns immediately under cap** with no in-flight flag and no transaction.
- `writeChunk(sessionId, chunkData)` never fails because of the store's own background work; it waits on the owner-serialized queue. Concurrent calls are safe. Idempotent by `(sessionId, seq)`: a rewrite of an existing seq is a success no-op (same `chunkId`, one row). Errors are structured objects with `class: 'transient' | 'permanent'`:
  - `{ error: 'session_not_found', sessionId, class: 'permanent' }`
  - `{ error: 'quota_exceeded', class: 'permanent', usedBytes?, capBytes? }` — only after an internal retention attempt
  - `{ error: 'database_unavailable', class: 'permanent' }`
  - `{ error: 'store_busy', class: 'transient' }` — only after ≥ 5 s internal retry of aborted/busy IndexedDB (`WRITE_WAIT_BUDGET_MS`). `transaction_conflict` is not a customer-facing error.
- `getChunkCoverage(sessionId)` → `{ expectedFirstSeq, lastSeq, savedCount, missingSeqs, savedDurationMs, lostChunks: [{seq,startMs,endMs,reason}] }` or `{ error, class: 'permanent' }`. `savedDurationMs` sums only saved chunks.
- `recordChunkLost(sessionId, {seq,startMs,endMs,reason})` → `{ recorded: true }` or `{ error: 'session_not_found' | 'database_unavailable', class: 'permanent' }`. Persists a loss record on the session (idempotent by seq).

### Durable per-package logs

- `configureLogger({ levels?, activeSessionId? })` / `getLoggerConfig()` — in-memory gates; PWA Settings owns persisted levels
- `log(packageId, level, payload, options?)` — `payload` is `string | (() => string | { message, details? })`. **Must** check package level **and** active/explicit session id **before** invoking a function payload. Gated → `{ skipped: true }` and zero payload work.
- `queryLogs({ sessionId?, packageId?, from?, to?, minLevel?, limit?, offset? })` → `{ logs, total }`
- `getLogByteSizes()` → `{ logBytes, logEntryCount, byPackage }` (Settings size lines)
- Package ids: `session-store`, `capture-engine`, `volume-analyzer`, `transcription-client`, `playback-engine`, `web-whisper-pwa`
- Levels: `debug` | `info` | `warn` | `error` | `off` (default `info`)
- `deleteSession` cascades that session’s log rows

See `docs/specs/20261006180517-feedback-durable-per-package-logging.md`.

### Session audio archive (formatVersion 1)

Portable **zip** of one session (manifest + remaining audio chunks). MIME `application/zip` (import also accepts `application/x-zip-compressed`). Filename: `web-whisper-session-<id>-<timestamp>.zip` where `<timestamp>` is Unix epoch milliseconds.

Zip contents:

- `manifest.json` — `formatVersion` (`1`), `exportedAt` (ISO-8601), `kind: "web-whisper-session-archive"`, session row fields (`id`, `createdAt`, `updatedAt`, `duration`, `chunkCount`, `sizeBytes`, `hasVolumeProfile`, `hasSnips`, `hasTranscript`, `status`), optional `notes`, and `chunks[]` metadata (`id`, `seq`, `startTime`, `endTime`, `duration`, `mime`, `sizeBytes`, `audioPurgedAt`, `file`)
- `chunks/NNN.<ext>` — audio bytes only when the chunk is still present (`NNN` is zero-padded `seq`; `audio/mpeg` → `mp3`, `audio/webm` → `webm`, else `bin`)
- Purged / empty chunks stay in `manifest.json` with `file: null` and no zip entry
- Optional (export flags, **default OFF**): `includeSnips` → `snips.json`, `includeTranscripts` → `transcripts.json`, `includeVolumeProfile` → `volume-profile.json`
- Optional: `includeLogs` → `logs.json` (log rows for that session; default **off**)
- Convenience: `includeDebugArtifacts: true` turns on snips + transcripts + volume profile **and logs**. Default export stays slim (`manifest.json` + `chunks/` only).

**formatVersion stays at 1.** Optional JSON files were already valid v1. Slim v1 zips (no optionals) still parse. A bump to 2 is only needed if a **required** new file or required manifest field is added.

When debug artifacts are included, diagnosis fields per snip (from `snips.json`, joined to `transcripts.json` on `snipId`):

| Field | Required |
| --- | --- |
| `id` | yes |
| `startTime` / `endTime` / `duration` (seconds) | yes |
| `chunkIds` and/or `startChunkIndex` / `endChunkIndex` | yes |
| transcript `text` | yes when a transcript row exists |
| `confidence` | kept if stored |

`parseSessionArchive` still returns the separate `snips` / `transcripts` / `volumeProfile` arrays/objects. It also attaches `snipsWithTranscripts` (same join) so Isolation Demos do not have to re-join. Consumers may still join `transcripts[].text` on `snipId` themselves.

APIs (errors are `{ error }` objects, same as the rest of this package):

- `exportSessionArchive(sessionId, options?)` → `Blob` or `{ error: 'session_not_found' | 'database_unavailable' }`. Options: `{ includeSnips?, includeTranscripts?, includeVolumeProfile?, includeLogs?, includeDebugArtifacts?, notes? }` — all optional includes default `false`.
- `parseSessionArchive(blob)` → parse-only (no IndexedDB writes). Returns `{ formatVersion, exportedAt, session, notes?, chunks: [{ meta, blob | null }], snips?, transcripts?, volumeProfile?, snipsWithTranscripts?, logs? }` or a named error: `not_a_zip`, `missing_manifest`, `corrupt_json`, `invalid_manifest`, `kind_mismatch`, `unsupported_format_version`. Unknown future `formatVersion` fails; it is not guessed.
- `resolveArchiveIncludeFlags(options)` / `joinSnipsWithTranscripts(snips, transcripts)` — small helpers for the debug include and the transcript join.
- `importSessionArchive(blob, options?)` → writes into the **current** DB (`init()` name: PWA `web-whisper-db` or Isolation Demo `web-whisper-isolation-demo-session-store`). **Default: new IDs** (`generateId('ses')` / `generateId('chunk')`, `sessionId` rewritten on chunks). `options.preserveIds === true` keeps archive IDs if they do not collide; collision returns `{ error: 'id_collision' }` unless `overwrite === true` (default off). Optional JSON files are imported when present.

`sessionArchiveFilename(sessionId, timestampMs?)` builds the documented download name.

## Isolation Demo

See `isolation-demo/README.md` for the package-local runnable demo. The demo operates on a sandbox IndexedDB instance (not production data). It allows operator to: create sessions, write chunks (optionally via capture-engine in-memory → flush to store), write volume profiles + snips, write transcripts, **append/query fixture logs**, read sessions, list sessions, delete sessions, enforce retention policy, export/import archives with optional **Include logs**. It proves: schema works (including the `logs` store), writes work, reads work, retention policy works, storage cap is enforced, lazy `log()` gates work.

## Product Specs

See `docs/specs/` for detailed implementation specs and work orders.

## Customers

- `apps/web-whisper-pwa` (primary customer; see `customers/web-whisper-pwa.md`)
- `packages/lib/capture-engine` (customer for chunk writes + structured logs; see `customers/capture-engine.md`)
- `packages/lib/volume-analyzer` (customer for volume profile + snip writes + structured logs; see `customers/volume-analyzer.md`)
- `packages/lib/playback-engine` (customer for session + chunk + snip reads + structured logs; see `customers/playback-engine.md`)
- `packages/lib/transcription-client` (customer for structured logs only; see `customers/transcription-client.md`)
- Isolation Demo (standing human customer; see `customers/00-isolation-demo.md`)
