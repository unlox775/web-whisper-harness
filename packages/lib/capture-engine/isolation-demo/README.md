# Capture Engine Isolation Demo

Package-local runnable demo for operating capture-engine independently without the production PWA or session-store writes.

## Purpose

Proves that capture-engine:
- Acquires microphone (live or simulated PCM)
- Captures PCM audio
- Encodes MP3 chunks every ~4s
- Keeps chunks in memory temporarily (NOT persisted to IndexedDB)
- Provides duration from PCM sample count (not wall clock)
- Detects mic ghost (watchdog timeout if no audio received)
- Flushes final chunk < 4s on stop
- Allows playing each chunk from RAM immediately to verify encoding

## Runtime

- **Platform**: Web app (local dev server, factory floor operating surface)
- **Viewport**: Desktop browser (wider factory floor, not phone-shaped)
- **Launch**: `cd packages/lib/capture-engine/isolation-demo && npm start` (or equivalent)

## Data Mode

**IN-MEMORY ONLY**. No IndexedDB. No session-store writes. Chunks live in RAM as a demo session object until browser tab closes or Reset is clicked.

**Safe default**: In-memory with simulated PCM stream (no mic permission required by default).

## Panel-Based Layout

**5 distinct regions:**

### 1. Top Chrome Panel (fixed header, spans full width)

- **Left**: "Capture Engine Isolation Demo" heading (bold)
- **Center**: Data mode chip "IN-MEMORY (not persisted)" (cyan border, white text)
- **Right**: Microphone permission status ("Granted" green / "Denied" red / "Not requested" gray)

### 2. Control Panel (left third of viewport, below chrome)

**Components:**
- "Start Capture" button (cyan, full-width in panel, disabled when capture active)
- "Stop Capture" button (red, full-width, disabled when capture idle)
- "Reset" button (gray, full-width, clears RAM chunks + resets state; always enabled)
- Audio source toggle: "Live Microphone" vs "Simulated PCM stream" (radio buttons or toggle switch)

**Behaviors:**
- Live Microphone: requests permission, uses real mic input (user must speak)
- Simulated PCM: generates synthetic audio waveform (no mic needed, automatic "speech")
- When "Start Capture" clicked → button disables, "Stop Capture" enables, live meters start updating, watchdog timer starts (10s countdown), chunks begin encoding every ~4s
- When "Stop Capture" clicked → capture stops, final chunk flushes, buttons reset (Start enabled, Stop disabled), meters freeze at final values
- When "Reset" clicked → in-memory chunks discarded, tape clears, meters reset to 0

### 3. Live Meters Panel (center third, below chrome)

**Components:**
- Duration counter: "Duration: 0.00s" (updates every frame from PCM sample count, NOT wall clock)
- PCM buffer fill: Horizontal progress bar "PCM buffer: 1024 / 2048 samples" (fills and drains as encode happens)
- Chunks encoded: "Chunks: 0" (increments when each chunk encodes: 0 → 1 → 2 → 3...)
- Watchdog countdown: "Watchdog: 10.0s" (counts down from 10s; if reaches 0 before first chunk encodes, capture auto-stops with "no audio received" error)

**Behaviors:**
- When capture active: all meters update in real-time (duration climbs, buffer fills/drains, chunk count increments, watchdog resets after first chunk or counts down if mic silent)
- When capture stops: meters freeze at final values (duration = total, buffer = 0 or remainder, chunks = final count, watchdog = "N/A")

### 4. Chunk Tape Panel (right third, below chrome, scrollable list)

**Components:**
- Heading: "In-Memory Chunks (RAM only)" (small gray text)
- List of encoded chunks (grows as capture runs; each chunk is a row):
  - Column 1: Seq number (0, 1, 2, 3...)
  - Column 2: Start time (e.g., "0.00s", "4.12s", "8.24s")
  - Column 3: End time (e.g., "4.12s", "8.24s", "12.35s")
  - Column 4: Byte length (e.g., "32,768 bytes", "31,245 bytes")
  - Column 5: "Play" button (inline, plays THIS chunk's in-memory blob via HTML5 audio; does NOT call playback-engine or session-store)

**Behaviors:**
- When "Start Capture" clicked and first chunk encodes (~4s): first row appears (Seq 0, Start 0.00s, End ~4.0s, ~32KB, Play button)
- When each subsequent chunk encodes: new row appears below (Seq 1, Seq 2, etc.)
- When "Reset" clicked: entire list clears (no rows), in-memory blobs are discarded
- Scrolls vertically if > ~10 chunks (keeps growing until Reset or tab close)
- When "Play" button clicked on a row: HTML5 audio element plays that chunk's blob from RAM (proves encoding worked)

### 5. Event/Failure Panel (bottom strip, spans full width, secondary disclosure)

**Components:**
- Collapsible section (collapsed by default): "Show Event Feed ▶" (click to expand → "Hide Event Feed ▼")
- When expanded: scrollable log of events (most recent at bottom, autoscrolls):
  - `chunkEncoded(seq=0, duration=4.12s, bytes=32768)` (green text, timestamp)
  - `chunkEncoded(seq=1, duration=4.11s, bytes=31245)` (green)
  - `captureError(reason="no_audio_received", watchdog_timeout=10s)` (red, if mic silent for 10s)
  - `captureStopped(totalChunks=7, totalDuration=28.5s, hasAudio=true)` (blue)

**Behaviors:**
- When collapsed: only heading visible ("Show Event Feed ▶"), no vertical space used
- NOT the main product of this demo (chunk tape is the product); event feed is diagnostic/telemetry for debugging

## Before / After States

**Before state (page load, capture idle):**
- Control panel: "Start Capture" enabled (cyan), "Stop Capture" disabled (gray), "Reset" enabled, audio source = "Simulated PCM" by default
- Live meters: Duration 0.00s, PCM buffer 0 / 2048, Chunks 0, Watchdog N/A (not started)
- Chunk tape: Empty (no rows), heading visible ("In-Memory Chunks (RAM only)")
- Event feed: Collapsed, no events yet

**After state (after Start → speak/simulate for 12s → Stop):**
- Control panel: "Start Capture" enabled (ready for next capture), "Stop Capture" disabled, "Reset" enabled
- Live meters: Duration 12.35s (frozen), PCM buffer 0 / 2048 (flushed), Chunks 3, Watchdog N/A (stopped)
- Chunk tape: 3 rows visible (Seq 0, 1, 2 with start/end times, byte lengths, Play buttons)
- Event feed: (if expanded) shows `chunkEncoded` (3x), `captureStopped` events

## What This Demo Does NOT Do

- Does not call session-store
- Does not write to IndexedDB
- Does not create sessions
- Capture-engine's public interface is `startCapture(sessionId)` which expects a caller-provided session ID and writes to session-store
- This demo exercises the CORE LOGIC (acquire mic, capture PCM, encode chunks, detect failures) without the storage integration
- Storage integration is proven in session-store's Isolation Demo or the final PWA

## Implementation Notes

(To be filled by Phase 06 implementation agent)

- Audio source: Live microphone via `navigator.mediaDevices.getUserMedia()` or simulated PCM via `OscillatorNode` / `AudioBufferSourceNode`
- PCM capture: ScriptProcessor or AudioWorklet (TBD based on iOS compatibility)
- MP3 encoder: lamejs or similar
- Chunk storage: In-memory JavaScript array of `{seq, startTime, endTime, blob, byteLength}` objects
- Play button: Creates `<audio>` element with `src = URL.createObjectURL(chunk.blob)`, calls `.play()`
- Reset: Clears in-memory array, revokes blob URLs, resets UI state
