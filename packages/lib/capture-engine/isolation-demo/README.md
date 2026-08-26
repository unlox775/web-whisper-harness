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

## Questions This Demo Answers

1. **Does microphone acquisition work?** — Live Microphone mode requests permission, shows "Granted" status in top chrome, audio callbacks fire
2. **Does simulated PCM work without permission?** — Simulated mode generates synthetic audio, no permission prompt, duration counter climbs
3. **Do chunks encode every ~4s?** — Chunk tape list grows every ~4s (Seq 0, 1, 2...), chunk count meter increments
4. **Is duration sample-based (not wall clock)?** — Duration counter is computed from PCM sample count / sample rate, accurate even if main thread blocks
5. **Does MP3 encoding work?** — Each chunk's Play button plays audible audio (proves MP3 blob is valid)
6. **Does watchdog detect mic ghost?** — Live Microphone mode with silence (no speech) for 10s → watchdog expires, capture auto-stops, error event fires, hasAudio=false
7. **Does final chunk < 4s flush correctly?** — Capture for 10s (2 full + 2s remainder), Stop → 3 chunks in tape, Seq 2 is ~2s long, playback confirms 2s audio
8. **Is data truly in-memory (not persisted)?** — Reset clears chunk tape, reload page → no chunks (proves no IndexedDB writes)

## Implementation Notes

(Phase 06 implementation agent should follow these notes)

### Audio Source Implementation

**Live Microphone**:
- Call `navigator.mediaDevices.getUserMedia({audio: true})` on "Start Capture"
- On success: connect mic stream to AudioContext input, update chrome panel status to "Granted" (green)
- On `NotAllowedError`: show "Denied" (red) status, stop capture, show error message
- On `NotFoundError`: show "No microphone found" error

**Simulated PCM**:
- Create `OscillatorNode` with frequency 440 Hz (A4 note) or sweep (e.g., 200–800 Hz over time for variety)
- Connect to AudioContext destination and ScriptProcessorNode
- No `getUserMedia` call, no permission prompt
- Simulated audio should be clearly synthetic (sine wave or chirp) so it's visually/audibly distinct from real speech

### PCM Capture

- Use `ScriptProcessorNode` with buffer size 4096 samples (Phase 06 MVP; AudioWorklet is Phase 07)
- `onaudioprocess` callback receives `AudioProcessingEvent` with `inputBuffer` (AudioBuffer)
- Extract float32 samples: `inputBuffer.getChannelData(0)` (mono, or mix stereo to mono)
- Append samples to internal buffer array (Float32Array or concatenate typed arrays)
- Track sample count: `totalSamples += inputBuffer.length`
- Compute duration: `currentDuration = totalSamples / sampleRate`
- When `internalBuffer.length >= targetSampleCount` (e.g., 4s * 44100 = 176400 samples):
  - Slice first `targetSampleCount` samples
  - Pass to encoder
  - Remove sliced samples from internal buffer (shift or create new buffer from remainder)

### MP3 Encoding

- Import lamejs library (or bundle as ES6 module)
- Initialize encoder: `new lamejs.Mp3Encoder(1, sampleRate, bitrate)` (1 = mono, 44100 or 48000 Hz, 128 kbps)
- Convert float32 PCM to int16:
  ```js
  const int16Samples = new Int16Array(float32Samples.length);
  for (let i = 0; i < float32Samples.length; i++) {
    int16Samples[i] = Math.max(-32768, Math.min(32767, float32Samples[i] * 32767));
  }
  ```
- Encode: `mp3Buf = encoder.encodeBuffer(int16Samples)`
- Flush final chunk: `mp3Buf = encoder.flush()` (on last chunk if samples < target)
- Create blob: `new Blob([mp3Buf], {type: "audio/mpeg"})`

### Chunk Storage (In-Memory)

- JavaScript array: `chunks = []`
- Each chunk: `{seq: number, startTime: number, endTime: number, blob: Blob, byteLength: number}`
- On encode complete:
  ```js
  const chunk = {
    seq: chunks.length,
    startTime: prevEndTime, // sum of previous chunk durations
    endTime: prevEndTime + (slicedSampleCount / sampleRate),
    blob: mp3Blob,
    byteLength: mp3Blob.size
  };
  chunks.push(chunk);
  // Emit chunkEncoded event for demo UI to add row to tape
  ```
- On Reset: `chunks = []`, revoke all blob URLs (`URL.revokeObjectURL(blobUrl)`), clear tape UI

### Play Button Implementation

- Each chunk row in tape has Play button
- On click:
  ```js
  const audio = new Audio();
  audio.src = URL.createObjectURL(chunk.blob);
  audio.play();
  // Optional: revoke blob URL after playback ends
  audio.onended = () => URL.revokeObjectURL(audio.src);
  ```
- No dependency on playback-engine (this is raw HTML5 audio playback from RAM blob)

### Watchdog Timer

- Start timer when `startCapture` called: `watchdogTimer = setTimeout(() => { handleMicGhost(); }, 10000);`
- On first PCM callback (any samples received): `clearTimeout(watchdogTimer); watchdogActive = false;`
- If timer expires:
  ```js
  function handleMicGhost() {
    emitEvent('captureError', {reason: 'no_audio_received', details: 'Watchdog timeout: no audio received for 10s'});
    stopCapture(); // auto-stop
    // Set hasAudio = false, chunksWritten = 0
  }
  ```
- Watchdog countdown meter in UI: poll every 100ms, compute remaining time `Math.max(0, 10 - elapsedSeconds)`, display "Watchdog: 8.3s" → "Watchdog: 0.0s" → "N/A" (after cancel or expire)

### Live Meters Update

- Duration counter: poll `currentDuration` from capture state every 100ms, update UI (`Duration: ${duration.toFixed(2)}s`)
- PCM buffer fill: poll `internalBuffer.length` and target sample count, update progress bar (`PCM buffer: ${current} / ${target} samples`)
- Chunks encoded: increment on `chunkEncoded` event (`Chunks: ${chunkCount}`)
- Watchdog: poll remaining time if active, show "N/A" if inactive or completed

### Event Feed Implementation

- Collapsible section: initially collapsed (`<details>` element or custom toggle)
- On `chunkEncoded` event: append log entry `"[12:34:56] chunkEncoded(seq=0, duration=4.12s, bytes=32768)"` (green text)
- On `captureError` event: append log entry `"[12:34:57] captureError(reason=no_audio_received, ...)"` (red text)
- On `captureStopped` event: append log entry `"[12:34:58] captureStopped(chunksWritten=7, totalDuration=28.5s, hasAudio=true)"` (blue text)
- Autoscroll to bottom when new event added

### Reset Implementation

- On "Reset" button click:
  - Stop capture if active
  - Clear chunks array: `chunks = []`
  - Revoke blob URLs: `chunks.forEach(c => URL.revokeObjectURL(c.blobUrl))`
  - Clear chunk tape UI (remove all rows)
  - Reset meters: duration = 0, PCM buffer = 0/target, chunk count = 0, watchdog = N/A
  - Clear event feed
  - Re-enable "Start Capture" button

### No Session-Store Integration

- This demo does NOT import or call session-store
- When "Start Capture" clicked, demo calls `startCapture` with a fake session ID (e.g., `"demo-session"`) or passes `mode: "in-memory"` option
- Capture-engine detects in-memory mode and skips `session-store.writeChunk()` calls
- Alternatively, capture-engine exports a separate `startCaptureInMemory()` function that returns chunks in RAM
- Demo subscribes to events via capture handle, stores chunks in JavaScript array (not IndexedDB)

### Package Structure

```
packages/lib/capture-engine/
├── isolation-demo/
│   ├── index.html (5-panel layout, loads app.js)
│   ├── app.js (main demo logic, UI updates, event subscriptions)
│   ├── styles.css (panel layout, responsive grid, cyan/red/green colors)
│   ├── package.json ("start": "vite" or "http-server -p 3001")
│   └── README.md (this file)
├── src/
│   ├── captureEngine.js (main module: startCapture, stopCapture, events)
│   ├── encoder.js (lamejs wrapper)
│   └── types.ts (TypeScript types or JSDoc definitions)
├── docs/
│   └── specs/
│       └── 20260826152037-initial-product-spec.md
├── customers/
│   ├── 00-isolation-demo.md
│   └── web-whisper-pwa.md
├── package.json (capture-engine package metadata)
└── README.md (package README)
```

### Launch Command

From workspace root:
```bash
cd packages/lib/capture-engine/isolation-demo
npm install  # if first time
npm start    # starts dev server (vite or http-server), opens http://localhost:3001
```

Or if using workspace-level scripts:
```bash
npm run demo:capture-engine  # from workspace root, if Makefile/package.json includes this target
```
