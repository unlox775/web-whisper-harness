# Customer: packages/lib/volume-analyzer

Volume-analyzer is a customer of session-store for reading chunks (to compute volume), writing volume profiles, and writing snips.

## Producer's Understanding of This Customer

(To be filled by Phase 03 product-spec agent for session-store)

Volume-analyzer needs session-store to:
- Read chunks for volume computation (PWA or volume-analyzer calls `analyzeVolume(sessionId)` → volume-analyzer calls `getChunksForSession(sessionId)` → reads chunk blobs → decodes MP3 to PCM → computes peak dB per chunk)
- Write volume profile after computation (volume-analyzer calls `writeVolumeProfile(sessionId, volumeProfile)` → volume profile persisted to IndexedDB)
- Read volume profile for snip proposal (PWA or volume-analyzer calls `proposeSnips(sessionId)` → volume-analyzer checks if volume profile exists → if missing, calls `analyzeVolume` first → then reads volume profile via `getVolumeProfile(sessionId)` → proposes snips based on silence detection)
- Write snips after proposal (volume-analyzer calls `writeSnip(sessionId, snipData)` per snip → snips persisted to IndexedDB)
- Validate session existence (before reading chunks or writing volume profile/snips, session-store should validate sessionId exists; if not, return error "Session not found")

Volume-analyzer will:
- NOT create sessions itself (PWA creates session, capture-engine writes chunks, then PWA or volume-analyzer calls `analyzeVolume` or `proposeSnips`)
- Overwrite volume profile if called multiple times (user may click "Recompute Volume" button in developer mode; volume-analyzer should replace existing volume profile with new one)
- Append or replace snips (TBD: should `writeSnip` append to existing snips or replace all snips for session? Phase 03 product-spec agent will decide.)

## Customer Request

(To be filled by Phase 04 customer-request agent for volume-analyzer → session-store)

Volume-analyzer customer will write its request here: exact interfaces it needs (`getChunksForSession`, `writeVolumeProfile`, `getVolumeProfile`, `writeSnip`), what inputs it will provide (sessionId, volumeProfile: {chunkVolumes: [{chunkId, peakDb}]}, snipData: {startChunkIndex, endChunkIndex, startTime, endTime, duration, chunkIds}), what outputs it expects (chunk list with blobs, volume profile, snip IDs), error handling expectations (what errors are possible: session not found, chunks missing, volume profile missing).

## Producer Response

(To be filled by Phase 05 producer-response agent for session-store)

Session-store will respond here: how it will meet volume-analyzer's request, what interfaces it will provide, how it will handle volume profile overwrites (replace existing or error if exists), how it will handle snip writes (append or replace all snips for session), what error formats it will return.
