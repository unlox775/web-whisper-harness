# Volume Analyzer

Reads chunk audio, computes volume profile (peak dB per chunk), proposes snips (segment boundaries based on volume silence detection).

## Boundary

- **Owns**: Volume computation (RMS or peak dB from PCM), silence detection (threshold-based), snip proposal algorithm (group contiguous loud chunks, split on silence), volume profile schema (stored in session-store)
- **Does NOT own**: Audio capture (capture-engine), audio playback (playback-engine), transcription (transcription-client), storage authority (session-store owns all data)

## Main Callable Interfaces

(Planning names, not frozen APIs)

- `analyzeVolume(sessionId)` → returns volume profile
  - Input: session ID (assumes session has chunks already written by capture-engine)
  - Output: volume profile `{chunkVolumes: [{chunkId, peakDb}]}` written to session-store
  - Caller: PWA after recording completes, or developer mode "Recompute Volume" button
  - Store changed: session-store (writes volume profile for session)

- `proposeSnips(sessionId)` → returns snip list
  - Input: session ID (requires volume profile; calls analyzeVolume first if missing)
  - Output: snip list `[{snipId, startChunkIndex, endChunkIndex, startTime, endTime}]` written to session-store
  - Caller: PWA after recording completes (automated), or user "Re-snip" button
  - Store changed: session-store (writes snips for session)

## Isolation Demo

See `isolation-demo/README.md` for the package-local runnable demo. The demo uses fixture audio (simulated chunks with known volume patterns) or optionally live audio from capture-engine (in-memory only, not persisted). It proves: volume computation works, silence detection works, snip proposal works, operator can see volume histogram and proposed snip boundaries.

## Product Specs

See `docs/specs/` for detailed implementation specs and work orders.

## Customers

- `apps/web-whisper-pwa` (primary customer; see `customers/web-whisper-pwa.md`)
- Isolation Demo (standing human customer; see `customers/00-isolation-demo.md`)
