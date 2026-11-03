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

- Events emitted: `chunkEncoded(sessionId, chunkId, duration)`, `captureError(sessionId, reason)`, `chunk_lost { sessionId, seq, startMs, endMs, reason }`, `persist_backpressure { pendingCount, oldestSeq }`

- `flushPending()` / `whenPersistIdle()` → `Promise<{ savedCount, lostChunks }>`
  - Same function under two names; exported from the package and on the capture handle
  - Resolves when every pending encoded chunk is **saved** or **declared lost** (not merely when a write attempt settled)
  - Caller: PWA **must** await this before `session-store.enforceRetentionPolicy` during or after recording
  - Safe when not capturing (resolves `{ savedCount: 0, lostChunks: [] }`). `stop()` waits for persist idle before returning `chunksWritten`
  - Persist queue: bounded pending buffer (≥ 75 chunks / 5 min). Transient store errors (`class: 'transient'`, `store_busy`) are held and retried with exponential backoff (250 ms → 4 s cap) for at least 30 s, and keep retrying while the session is live. Writes drain in seq order; later chunks are never skipped.
  - `chunk_lost` is the only loss signal (permanent store error or retry window exhausted after stop). Also persisted via `sessionStore.recordChunkLost`.
  - `persist_backpressure` fires when the pending buffer nears capacity; chunks are still not dropped.
  - `store_write_failed` is a transient diagnostic only, not a loss signal.

- Structured logs: emit via `session-store.log('capture-engine', level, () => payload)` (lazy; session-store owns storage)

See `docs/specs/20261103175001-feedback-never-drop-encoded-chunks.md` (supersedes the single-retry / no-backlog lines of `20261006180517-feedback-resilient-persist-queue-and-flushpending.md`).

## Isolation Demo

See `isolation-demo/README.md` for the package-local runnable demo. The demo is IN-MEMORY ONLY (no session-store writes). It exercises the core logic (acquire mic, capture PCM, encode chunks, detect failures) without storage integration. Storage integration is proven in session-store's Isolation Demo (which includes capture-engine as a demo dependency) or the final PWA.

## Product Specs

See `docs/specs/` for detailed implementation specs and work orders.

## Customers

- `apps/web-whisper-pwa` (primary customer; see `customers/web-whisper-pwa.md`)
- Isolation Demo (standing human customer; see `customers/00-isolation-demo.md`)
