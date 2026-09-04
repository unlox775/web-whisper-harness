# Playback Engine

Audio playback for sessions, chunks, and snips. Reads MP3 audio from session-store, creates HTML5 audio elements, manages playback state (play, pause, seek, stop).

## Boundary

- **Owns**: Audio playback (HTML5 `<audio>` element management), playback state (playing, paused, stopped, current time, duration), seek operations, audible volume (`setVolume` via Web Audio GainNode), audio concatenation (for multi-chunk sessions or snips), playback events (play, pause, ended, timeupdate, error)
- **Does NOT own**: Audio capture (capture-engine), volume analysis (volume-analyzer), transcription (transcription-client), storage authority (session-store owns all audio), playback UI (PWA owns playback controls)

## Main Callable Interfaces

(Planning names, not frozen APIs)

- `playSession(sessionId)` → returns playback handle
  - Input: session ID (reads all chunks from session-store, concatenates MP3s)
  - Output: playback handle with methods `pause()`, `resume()`, `seek(time)`, `stop()`, event subscriptions
  - Caller: PWA session detail screen (user clicks "Play Session" button)
  - Store changed: None (playback is read-only)

- `playChunk(chunkId)` → returns playback handle
  - Input: chunk ID (reads single chunk from session-store)
  - Output: playback handle (same as playSession)
  - Caller: PWA developer mode chunk list (user clicks "Play" button on chunk row)
  - Store changed: None

- `playSnip(snipId)` → returns playback handle
  - Input: snip ID (reads chunks for snip from session-store, concatenates MP3s for snip range)
  - Output: playback handle (same as playSession)
  - Caller: PWA session detail snip list (user clicks "Play" button on snip row) OR transcription flow (PWA may play snip before transcribing to preview)
  - Store changed: None

- `PlaybackHandle.setVolume(level)` — `level` is `0..1` (clamped). Default `1` on each new handle; not persisted across handles.
  - **iOS Safari quirk:** `HTMLAudioElement.volume` updates as a property but audible output stays at `1.0`. This package does **not** rely on `element.volume` alone.
  - **Loudness path:** `HTMLAudioElement` → `AudioContext.createMediaElementSource` (once per element) → `GainNode` → `destination`. `setVolume` writes `gain.value`. `AudioContext` is resumed on play (iOS suspends contexts). `element.volume` is a fallback only if the graph cannot be created.
- Events emitted: `playing(handle, currentTime, duration)`, `paused(handle, currentTime)`, `ended(handle)`, `playbackError(handle, reason)`

## Isolation Demo

See `isolation-demo/README.md` for the package-local runnable demo. The demo uses fixture audio (simulated session with 3 chunks, 2 snips) by default. Optionally, it can read from real session-store in read-only mode. It proves: session playback works (concatenates chunks), chunk playback works (single chunk), snip playback works (chunk range), seek works, pause/resume works, stop works, and the Volume slider audibly changes level via `setVolume` / GainNode (including the iOS `element.volume` quirk).

## Product Specs

See `docs/specs/` for detailed implementation specs and work orders.

## Customers

- `apps/web-whisper-pwa` (primary customer; see `customers/web-whisper-pwa.md`)
- Isolation Demo (standing human customer; see `customers/00-isolation-demo.md`)
