# Capture Engine

Microphone-to-durable-chunk pipeline. Acquires mic, captures PCM, encodes MP3 chunks every ~4s, and writes them immediately to the session store.

## Boundary

- **Owns**: Microphone acquisition, PCM capture (ScriptProcessor or AudioWorklet), MP3 encoding (lamejs or similar), chunk timing (~4s target), watchdog timer (detects mic ghost), immediate chunk persistence
- **Does NOT own**: Volume analysis, snip proposal, transcription, playback, storage schema (session-store owns that)

## Main Callable Interfaces

(Planning names, not frozen APIs)

- `startCapture(sessionId)` → returns capture handle
  - Input: session ID from caller (PWA creates session via session-store first)
  - Output: capture handle with `stop()` method, event subscriptions
  - Caller: PWA start-recording flow
  - Store changed: session-store (writes chunks as they encode every ~4s)

- `stopCapture(handle)` → returns completion summary
  - Input: capture handle
  - Output: `{chunksWritten, totalDuration, hasAudio: boolean}`
  - Caller: PWA stop-recording flow
  - Store changed: session-store (flushes final chunk < 4s, marks session complete)

- Events emitted: `chunkEncoded(sessionId, chunkId, duration)`, `captureError(sessionId, reason)`

## Isolation Demo

See `isolation-demo/README.md` for the package-local runnable demo. The demo is IN-MEMORY ONLY (no session-store writes). It exercises the core logic (acquire mic, capture PCM, encode chunks, detect failures) without storage integration. Storage integration is proven in session-store's Isolation Demo (which includes capture-engine as a demo dependency) or the final PWA.

## Product Specs

See `docs/specs/` for detailed implementation specs and work orders.

## Customers

- `apps/web-whisper-pwa` (primary customer; see `customers/web-whisper-pwa.md`)
- Isolation Demo (standing human customer; see `customers/00-isolation-demo.md`)
