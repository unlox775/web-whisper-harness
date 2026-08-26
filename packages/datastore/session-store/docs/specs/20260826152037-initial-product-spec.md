Spec Status: unresolved
Spec Type: initial-product-spec
Created: 2026-08-26T15:20:37Z
Product: packages/datastore/session-store

# Session Store — Initial Product Spec

## Product Goal

Provide IndexedDB schema and durable storage authority for all Web Whisper data. Owns sessions, chunks, volume profiles, snips, transcripts. Enforces retention policy (storage cap, deletion). Does NOT implement capture, volume analysis, transcription, or playback logic (lib packages do those).

## Boundary

- **Owns**: IndexedDB schema (database "web-whisper-db", object stores: sessions, chunks, volume-profiles, snips, transcripts), all create/read/update/delete operations, storage quota enforcement (200 MB default cap, configurable via PWA settings), retention policy (delete oldest sessions when quota exceeded), data integrity (session existence validation before chunk/snip/transcript writes, referential integrity for chunks/snips/transcripts pointing to sessions)
- **Does NOT own**: Audio capture logic (capture-engine), volume computation logic (volume-analyzer), transcription logic (transcription-client), playback logic (playback-engine), UI (PWA), settings persistence (PWA uses localStorage or separate IndexedDB table for settings)

## Main Interfaces

(From slice-up plan; expand in Phase 03)

### Session Operations
- `createSession()` → session ID
- `getSession(sessionId)` → session metadata
- `listSessions(options)` → session list (sorted by createdAt desc, paginated if needed)
- `deleteSession(sessionId)` → deletes session + cascades to chunks/volume-profile/snips/transcripts

### Chunk Operations
- `writeChunk(sessionId, chunkData)` → writes chunk (called by capture-engine during recording)
- `getChunk(chunkId)` → chunk blob + metadata
- `getChunksForSession(sessionId)` → chunk list for session (ordered by seq)

### Volume Profile Operations
- `writeVolumeProfile(sessionId, volumeProfile)` → writes volume profile (called by volume-analyzer)
- `getVolumeProfile(sessionId)` → volume profile

### Snip Operations
- `writeSnip(sessionId, snipData)` → writes snip (called by volume-analyzer)
- `getSnipsForSession(sessionId)` → snip list for session
- `getSnip(snipId)` → snip metadata + chunk IDs

### Transcript Operations
- `writeTranscript(snipId, transcriptText)` → writes transcript (called by PWA after transcription-client returns text)
- `getTranscript(snipId)` → transcript text
- `getTranscriptsForSession(sessionId)` → transcript list for session

### Storage Management
- `getStorageStats()` → `{usedBytes, capBytes, sessionCount, chunkCount}`
- `enforceRetentionPolicy()` → deletes oldest sessions if quota exceeded

## Isolation Demo

The package-local Isolation Demo operates on a sandbox IndexedDB instance (database name "web-whisper-sandbox-db", separate from production "web-whisper-db"). It allows operator to:
- Create sessions (manual "Create Session" button)
- Write chunks (optionally via capture-engine in-memory → "Flush Chunks to Store" button)
- Write volume profiles + snips (optionally via volume-analyzer with fixture or live-from-capture audio)
- Write transcripts (manual text input + "Write Transcript for Snip" button)
- Read sessions (list sessions table, click row to expand details)
- Delete sessions (click "Delete" button on session row)
- Enforce retention policy (set storage cap to low value like 5 MB, fill with sessions, click "Enforce Retention" button, see oldest sessions deleted)

See `isolation-demo/README.md` for panel-based layout. Demo proves: schema works (all object stores exist), writes work (data persists after page reload), reads work (list sessions, read chunks, read snips, read transcripts), retention policy works (deletes oldest sessions when quota exceeded), storage cap is enforced (enforceRetentionPolicy respects cap setting).

## Phase 03 Product Spec Tasks

This stub spec will be expanded by the Phase 03 product-spec agent for `packages/datastore/session-store` to include:

- IndexedDB schema design (object stores, key paths, indexes: sessions by createdAt for listSessions sorting, chunks by sessionId + seq for ordered reads, snips by sessionId, transcripts by snipId)
- Session metadata schema (`{id, createdAt, updatedAt, duration, chunkCount, sizeBytes, hasVolumeProfile, hasSnips, hasTranscript}`)
- Chunk schema (`{id, sessionId, seq, startTime, endTime, duration, blob, sizeBytes}`)
- Volume profile schema (`{sessionId, chunkVolumes: [{chunkId, peakDb}]}`)
- Snip schema (`{id, sessionId, startChunkIndex, endChunkIndex, startTime, endTime, duration, chunkIds: []}`)
- Transcript schema (`{snipId, sessionId, text, createdAt}`)
- Retention policy algorithm (sort sessions by createdAt asc, delete oldest until usedBytes <= capBytes)
- Storage quota calculation (sum chunk sizeBytes across all sessions; consider IndexedDB overhead)
- Referential integrity (writeChunk validates sessionId exists, writeSnip validates sessionId exists, writeTranscript validates snipId exists)
- Cascade deletion (deleteSession deletes session + all chunks + volume profile + all snips + all transcripts for that session)
- Isolation Demo implementation notes (sandbox database name, how to include capture-engine/volume-analyzer as optional demo dependencies, how to populate fixture data, how to test retention policy with low storage cap)
- Validation plan (manual demo walkthrough, create session → write chunks → write volume profile + snips → write transcripts → read all → delete session → enforce retention policy with low cap)

## Customer Relationships

Customers of session-store:
- `apps/web-whisper-pwa` (see `customers/web-whisper-pwa.md`)
- `packages/lib/capture-engine` (see `customers/capture-engine.md`)
- `packages/lib/volume-analyzer` (see `customers/volume-analyzer.md`)
- `packages/lib/playback-engine` (see `customers/playback-engine.md`)
- Isolation Demo (see `customers/00-isolation-demo.md`)

Customer request sections will be filled by Phase 04 customer-request agents.
