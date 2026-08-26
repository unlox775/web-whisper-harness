# Customer: packages/lib/capture-engine

Capture-engine is a customer of session-store for writing chunks during recording.

## Producer's Understanding of This Customer

(To be filled by Phase 03 product-spec agent for session-store)

Capture-engine needs session-store to:
- Write chunks immediately during recording (every ~4s, capture-engine encodes a chunk → calls `writeChunk(sessionId, chunkData)` → chunk persisted to IndexedDB)
- Validate session existence (before writing chunk, session-store should validate sessionId exists; if not, return error "Session not found")
- Return chunk ID (after writeChunk, return chunk ID so capture-engine can emit `chunkEncoded(sessionId, chunkId, duration)` event to caller)
- Handle write failures gracefully (if IndexedDB quota exceeded or write fails, return error NOT throw exception; capture-engine will emit `captureError` event to caller)

Capture-engine will:
- NOT create sessions itself (PWA creates session via `createSession()`, passes session ID to capture-engine's `startCapture(sessionId)`)
- Write chunks sequentially (chunk 0, then chunk 1, then chunk 2, etc.; seq numbers are monotonic but may not be strict 0,1,2 if a chunk encoding fails)
- Write final chunk < 4s on stop (flush remaining PCM buffer as final chunk, even if < 4s duration)

## Customer Request

(To be filled by Phase 04 customer-request agent for capture-engine → session-store)

Capture-engine customer will write its request here: exact interface it needs (`writeChunk`), what inputs it will provide (sessionId, chunkData: {seq, startTime, endTime, duration, blob, sizeBytes}), what outputs it expects (chunkId or error), error handling expectations (what errors are possible: session not found, quota exceeded, write failure; how capture-engine should handle each).

## Producer Response

(To be filled by Phase 05 producer-response agent for session-store)

Session-store will respond here: how it will meet capture-engine's request, what `writeChunk` interface it will provide, how it will validate session existence, how it will generate chunk IDs, what error formats it will return, and how it will handle quota exceeded (return error immediately vs attempt to enforce retention policy first).
