# Phase 04: capture-engine → session-store Customer Request

**Date**: 2026-08-26  
**Phase**: 04 (Customer Requests)  
**Relationship**: packages/lib/capture-engine → packages/datastore/session-store  
**Customer Document**: `packages/datastore/session-store/customers/capture-engine.md`

## Relationship Summary

Capture-engine is a high-frequency writer customer during active recording. It calls session-store's `writeChunk` interface every ~4 seconds as chunks encode, plus once more on recording stop for the final partial chunk (< 4s duration).

## Customer Request Content

The capture-engine's customer request in `packages/datastore/session-store/customers/capture-engine.md` specifies:

- **`writeChunk(sessionId, chunkData)` interface**: Called every ~4s during recording. Input: sessionId (from PWA), chunkData ({seq, startTime, endTime, duration, blob, sizeBytes}). Output: `{chunkId: string}` or error.

- **Sequential write behavior**: Chunks written sequentially (NOT concurrent). Seq numbers monotonic but may have gaps if encoding fails (e.g., seq=0, 1, 3 if seq=2 skipped).

- **Session metadata update requirement**: When writeChunk succeeds, session-store MUST atomically update session metadata (in same IndexedDB transaction): `chunkCount += 1`, `sizeBytes += chunkData.sizeBytes`, `duration = max(duration, chunkData.endTime)`, `updatedAt = now`.

- **Error handling requirements**: Session-store MUST return error objects (NOT throw exceptions). Errors: `{error: 'session_not_found'}` (session deleted or invalid), `{error: 'quota_exceeded', usedBytes, capBytes}` (writing chunk would exceed storage cap), `{error: 'database_unavailable', reason}` (IndexedDB write failed).

- **Pre-write validation**: BEFORE writing chunk, session-store MUST validate sessionId exists (call `getSession(sessionId)`, if null → return error) and check quota (if `usedBytes + chunkData.sizeBytes > capBytes` → return error).

- **Performance requirement**: `writeChunk` must be fast (< 50ms target, < 200ms acceptable, > 500ms causes PCM buffer overflow). Use IndexedDB transaction batching (write chunk + update session metadata in ONE transaction).

- **Referential integrity**: Capture-engine assumes session exists when it starts writing chunks. If sessionId does not exist, session-store MUST return `{error: 'session_not_found'}` WITHOUT writing chunk (no orphan chunks).

- **Edge case: final chunk < 4s**: User stops recording mid-encode (e.g., 10.3s = 2 full chunks + 2.3s remainder). Capture-engine calls `writeChunk` with final chunk (duration 2.3s). Session-store treats final chunk same as any other chunk (no special handling).

## Phase 05 Follow-Up

Phase 05 producer-response agent will write session-store's response in the same customer document, confirming how it will meet capture-engine's request.
