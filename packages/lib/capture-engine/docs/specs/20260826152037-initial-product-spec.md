Spec Status: unresolved
Spec Type: initial-product-spec
Created: 2026-08-26T15:20:37Z
Product: packages/lib/capture-engine

# Capture Engine — Initial Product Spec

## Product Goal

Provide the microphone-to-durable-chunk pipeline. Acquires mic, captures PCM, encodes MP3 chunks every ~4s, writes them immediately to session-store. Detects mic ghost (iOS issue where mic granted but no audio callbacks). Does NOT analyze volume, propose snips, or manage playback.

## Boundary

- **Owns**: Microphone acquisition (navigator.mediaDevices.getUserMedia), PCM capture (ScriptProcessor or AudioWorklet TBD), MP3 encoding (lamejs or similar), chunk duration target (~4s, not strict wall clock), watchdog timer for mic ghost detection (e.g., 10s timeout if no PCM callbacks), immediate chunk writes to session-store
- **Does NOT own**: Volume analysis (volume-analyzer), snip proposal (volume-analyzer), transcription (transcription-client), playback (playback-engine), storage schema or retention policy (session-store owns those)

## Main Interfaces

(From slice-up plan; expand in Phase 03)

- `startCapture(sessionId)` → capture handle
- `stopCapture(handle)` → completion summary `{chunksWritten, totalDuration, hasAudio}`
- Events: `chunkEncoded(sessionId, chunkId, duration)`, `captureError(sessionId, reason)`

## Isolation Demo

The package-local Isolation Demo is IN-MEMORY ONLY (no session-store writes). See `isolation-demo/README.md` for panel-based layout. Demo proves: mic acquisition works, PCM capture works, encode works, chunks encode every ~4s, watchdog detects mic ghost, final chunk < 4s flushes. Operator can play chunks from RAM to verify encoding. Reset discards all (proves in-memory).

Storage integration is proven in session-store's Isolation Demo (which includes capture-engine as a demo dependency, writing to real IndexedDB in sandbox mode) or the final PWA.

## Phase 03 Product Spec Tasks

This stub spec will be expanded by the Phase 03 product-spec agent for `packages/lib/capture-engine` to include:

- PCM capture implementation choice (ScriptProcessor vs AudioWorklet; consider iOS compatibility)
- MP3 encoder choice (lamejs, or alternative)
- Chunk duration logic (sample-based, not wall clock; ~4s target but flexible based on PCM buffer availability)
- Watchdog timer implementation (timeout value, what counts as "audio received", how to stop cleanly)
- Session-store integration (when/how to call createSession, writeChunk, error handling if store write fails)
- Microphone permission handling (iOS PWA re-prompts after cold start; this is expected, not a failure)
- Isolation Demo implementation notes (in-memory chunk storage, how to play chunks from RAM, Reset behavior)
- Validation plan (manual demo walkthrough, mic ghost test, final chunk < 4s test)

## Customer Relationships

Customers of capture-engine:
- `apps/web-whisper-pwa` (see `customers/web-whisper-pwa.md`)
- Isolation Demo (see `customers/00-isolation-demo.md`)

Customer request sections will be filled by Phase 04 customer-request agents.
