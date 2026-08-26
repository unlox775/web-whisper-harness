Spec Status: unresolved
Spec Type: initial-product-spec
Created: 2026-08-26T15:20:37Z
Product: packages/lib/playback-engine

# Playback Engine — Initial Product Spec

## Product Goal

Provide audio playback for sessions, chunks, and snips. Reads MP3 audio from session-store, creates HTML5 audio elements, manages playback state (play, pause, seek, stop). Does NOT capture, analyze, or transcribe audio. Does NOT own playback UI (PWA owns the player controls).

## Boundary

- **Owns**: Audio playback (HTML5 `<audio>` element creation and management), playback state (playing, paused, stopped, current time, duration), seek operations (jump to specific time in audio), audio concatenation (for multi-chunk sessions or multi-chunk snips; use blob concatenation or sequential playback with seamless transitions), playback events (play, pause, ended, timeupdate, error)
- **Does NOT own**: Audio capture (capture-engine), volume analysis (volume-analyzer), transcription (transcription-client), storage authority (session-store owns all audio blobs), playback UI (PWA owns the play/pause/seek buttons, progress bar, time display)

## Main Interfaces

(From slice-up plan; expand in Phase 03)

- `playSession(sessionId)` → playback handle
- `playChunk(chunkId)` → playback handle
- `playSnip(snipId)` → playback handle
- Playback handle methods: `pause()`, `resume()`, `seek(time)`, `stop()`
- Events: `playing(handle, currentTime, duration)`, `paused(handle, currentTime)`, `ended(handle)`, `playbackError(handle, reason)`

## Isolation Demo

The package-local Isolation Demo uses fixture audio (simulated session with 3 chunks: 4.0s, 4.1s, 3.5s; 2 snips: chunks 0–1, chunks 2–2) as the safe default. Optionally, the demo can read from real session-store in read-only mode (sandbox instance, not production).

See `isolation-demo/README.md` for panel-based layout. Demo proves: session playback works (concatenates all 3 chunks, plays 11.6s total), chunk playback works (plays single chunk), snip playback works (concatenates chunk range for snip, e.g., chunks 0–1 = 8.1s), seek works (jump to 5.0s in session), pause/resume works, stop works (resets to 0:00).

## Phase 03 Product Spec Tasks

This stub spec will be expanded by the Phase 03 product-spec agent for `packages/lib/playback-engine` to include:

- Audio concatenation strategy (blob concatenation via `new Blob([blob1, blob2])` vs sequential playback with `ended` event listener; consider seamlessness and browser compatibility)
- HTML5 audio element management (one `<audio>` element per playback handle, or reuse singleton element)
- Seek implementation (HTML5 `.currentTime` property; for multi-chunk sessions, compute offset into concatenated blob or sequential chunk)
- Playback state tracking (playing, paused, stopped, current time, duration; emit events on state changes)
- Session-store integration (read chunks, read snips, read snip-to-chunk mappings; construct blob or blob array for playback)
- Error handling (chunk missing, blob read failure, HTML5 audio error events)
- Isolation Demo implementation notes (fixture audio generation: 3 known chunks with known durations, 2 snips with known chunk ranges; optional real session-store read-only mode)
- Validation plan (manual demo walkthrough, fixture mode test: play session / chunk / snip + pause + seek + resume + stop, real store read-only mode test if available)

## Customer Relationships

Customers of playback-engine:
- `apps/web-whisper-pwa` (see `customers/web-whisper-pwa.md`)
- Isolation Demo (see `customers/00-isolation-demo.md`)

Customer request sections will be filled by Phase 04 customer-request agents.
