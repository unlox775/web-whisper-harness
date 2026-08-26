Spec Status: resolved
Spec Type: initial-product-spec
Created: 2026-08-26T15:20:37Z
Product: packages/lib/capture-engine

# Capture Engine — Initial Product Spec

## Product Goal

Provide the microphone-to-durable-chunk pipeline. Acquires mic, captures PCM, encodes MP3 chunks every ~4s, writes them immediately to session-store. Detects mic ghost (iOS issue where mic granted but no audio callbacks). Does NOT analyze volume, propose snips, or manage playback.

## Boundary

- **Owns**: Microphone acquisition (navigator.mediaDevices.getUserMedia), PCM capture (ScriptProcessor or AudioWorklet TBD), MP3 encoding (lamejs or similar), chunk duration target (~4s, not strict wall clock), watchdog timer for mic ghost detection (e.g., 10s timeout if no PCM callbacks), immediate chunk writes to session-store
- **Does NOT own**: Volume analysis (volume-analyzer), snip proposal (volume-analyzer), transcription (transcription-client), playback (playback-engine), storage schema or retention policy (session-store owns those)

## Data Ownership

This is a **lib package**. It **owns no durable data**. All durable data (sessions, chunks, volume profiles, snips, transcripts) is owned by `packages/datastore/session-store`. Capture-engine writes chunks to session-store immediately but does not own the storage schema, retention policy, or data lifecycle.

## Main Interfaces

### Interface Inventory

#### 1. `startCapture(sessionId, options?)`

**Purpose**: Begin microphone capture for a session, encoding and persisting MP3 chunks every ~4s.

**Input**:
- `sessionId` (string): Session identifier, already created in session-store by caller
- `options` (optional object):
  - `audioSource` (optional): "live" (default) or "simulated" (for testing)
  - `chunkTargetDuration` (optional): Target chunk duration in seconds (default 4.0)
  - `watchdogTimeout` (optional): Timeout in seconds before declaring mic ghost (default 10.0)

**Output**: Capture handle object with:
- `stop()` method (callable to stop capture and flush final chunk)
- `on(eventName, callback)` method for subscribing to events
- `off(eventName, callback)` method for unsubscribing
- `getStatus()` method returning `{isActive, chunksEncoded, currentDuration, watchdogActive}`

**Caller**: `apps/web-whisper-pwa` (start-recording flow), Isolation Demo (in-memory mode)

**Store read**: None (session already exists, created by caller via session-store)

**Store changed**: `session-store.writeChunk(sessionId, chunkBlob, metadata)` called every ~4s as chunks encode. Metadata includes: `{seq: number, startTime: number, endTime: number, byteLength: number, sampleRate: number}`

**Failure modes**:
- Microphone permission denied → throws `CaptureError("permission_denied", "User denied microphone permission")`
- Session ID invalid (not found in session-store) → throws `CaptureError("invalid_session", "Session does not exist")`
- Already capturing for this session → throws `CaptureError("already_capturing", "Capture already active for this session")`
- Mic ghost detected (watchdog timeout, no audio received) → emits `captureError` event with reason "no_audio_received", auto-stops capture, returns handle with `hasAudio=false` in final summary

#### 2. `stopCapture(handle)`

**Purpose**: Stop capture, flush final PCM buffer (if < 4s remainder), mark capture complete.

**Input**: Capture handle returned by `startCapture`

**Output**: Completion summary object:
- `chunksWritten` (number): Total chunks encoded and written to session-store
- `totalDuration` (number): Total audio duration in seconds (from PCM sample count, not wall clock)
- `hasAudio` (boolean): True if at least one chunk encoded, false if mic ghost or zero audio
- `sessionId` (string): Session ID from original `startCapture` call

**Caller**: `apps/web-whisper-pwa` (stop-recording flow), Isolation Demo

**Store changed**: 
- `session-store.writeChunk(sessionId, finalChunkBlob, metadata)` (if remainder < 4s exists)
- `session-store.markSessionComplete(sessionId, {chunksWritten, totalDuration, hasAudio})` (session metadata updated)

**Failure modes**:
- Handle invalid (already stopped or never started) → throws `CaptureError("invalid_handle", "Capture handle is not active")`
- Store write fails during flush → logs error, marks `hasAudio=false`, emits `captureError` event with reason "store_write_failed"

#### 3. Events

**Emitted via capture handle's `on(eventName, callback)` subscription**:

**`chunkEncoded` event**:
- Fired every ~4s when a chunk finishes encoding and is written to session-store
- Payload: `{sessionId, seq, duration, byteLength}`
- Listener signature: `(data) => void`
- Use case: PWA updates chunk count in developer mode, Isolation Demo adds row to chunk tape

**`captureError` event**:
- Fired when an error occurs during capture (mic ghost, store write failure, encoding error)
- Payload: `{sessionId, reason: string, details?: string}`
- Listener signature: `(data) => void`
- Reason codes:
  - `"no_audio_received"` — Watchdog timeout, mic granted but no PCM callbacks for 10s
  - `"store_write_failed"` — session-store rejected chunk write (quota, corruption)
  - `"encoding_failed"` — MP3 encoder threw exception
- Use case: PWA shows error message, Isolation Demo logs to event feed

**`captureStopped` event**:
- Fired when capture stops (via `stopCapture` or watchdog auto-stop)
- Payload: `{sessionId, chunksWritten, totalDuration, hasAudio}`
- Listener signature: `(data) => void`
- Use case: Telemetry, Isolation Demo logs final summary

## Implementation Choices

### PCM Capture: ScriptProcessor (Phase 06 MVP)

**Rationale**: ScriptProcessor is deprecated but widely compatible (works on iOS Safari, desktop Chrome/Firefox/Safari). AudioWorklet is modern but has iOS Safari bugs as of 2024–2025. For Phase 06 MVP, use ScriptProcessor. Phase 07 work order can migrate to AudioWorklet after iOS compatibility confirmed.

**Implementation notes**:
- `AudioContext` with sample rate 44100 or 48000 (let browser decide, record actual rate in chunk metadata)
- `ScriptProcessorNode` with buffer size 4096 samples (balance between callback frequency and latency)
- `onaudioprocess` callback receives PCM float32 samples, append to internal buffer
- When internal buffer >= target duration (e.g., ~4s * sample rate), slice off chunk, pass to encoder

### MP3 Encoding: lamejs

**Rationale**: lamejs is a JavaScript MP3 encoder (port of LAME) that runs in-browser without server round-trip. Encodes PCM to MP3 blob synchronously or in small async slices to avoid blocking UI thread.

**Implementation notes**:
- Initialize lamejs encoder with bitrate (e.g., 128 kbps, configurable in settings)
- Convert float32 PCM samples to int16 (lamejs expects int16)
- Encode chunk to MP3 byte array, wrap in Blob with `type: "audio/mpeg"`
- Encoding happens every ~4s (not blocking main thread for > ~200ms acceptable for Phase 06; Phase 07 can move to Web Worker if needed)

### Chunk Duration: Sample-Based, Not Wall Clock

**Rationale**: Encoded containers (MP3, WebM) can lie about time if recording pauses or hiccups. Use PCM sample count as source of truth for duration.

**Implementation logic**:
- Target chunk duration: 4.0 seconds (configurable)
- Target sample count: `Math.round(targetDuration * sampleRate)`
- When internal PCM buffer length >= target sample count:
  - Slice first `targetSampleCount` samples
  - Compute actual duration: `slicedSampleCount / sampleRate`
  - Pass to encoder
  - Metadata `startTime` = sum of previous chunk durations, `endTime = startTime + actualDuration`
- Final chunk on stop: Flush remainder even if < 4s

### Watchdog Timer: Detect Mic Ghost

**Rationale**: iOS sometimes grants microphone permission but never delivers audio callbacks (known platform issue). Watchdog detects this and stops capture honestly instead of leaving a zombie "recording" that is empty.

**Implementation logic**:
- Start watchdog timer (e.g., 10 seconds) when `startCapture` called
- On first PCM callback (audio received), cancel watchdog
- If watchdog timer expires before first callback:
  - Emit `captureError` event with reason "no_audio_received"
  - Call `stop()` internally (auto-stop)
  - Return completion summary with `hasAudio=false`, `chunksWritten=0`, `totalDuration=0`
- Watchdog does NOT apply after first chunk encodes (only checks for initial audio)

### Session-Store Integration

**When to call session-store**:
- **Before `startCapture`**: Caller (PWA or Isolation Demo in real mode) must call `session-store.createSession()` and pass returned session ID to `startCapture`. Capture-engine does NOT create sessions.
- **During capture (every ~4s)**: After encoding chunk, call `session-store.writeChunk(sessionId, chunkBlob, metadata)`. If write fails (throws exception), log error, emit `captureError` event, continue capture (next chunk tries again; failure is non-fatal unless repeated).
- **On stop**: Call `session-store.writeChunk()` for final chunk (if exists), then call `session-store.markSessionComplete(sessionId, summary)` (or equivalent metadata update).

**Error handling**:
- If `writeChunk` throws (quota exceeded, IndexedDB corruption), capture-engine logs error, emits `captureError("store_write_failed")`, but does NOT crash capture. Caller can listen to `captureError` and decide whether to stop.
- If multiple consecutive writes fail (e.g., 3 in a row), capture-engine MAY auto-stop and set `hasAudio=false` (TBD in Phase 06 based on testing).

### Microphone Permission Handling

**iOS PWA behavior**: iOS Safari re-prompts for microphone permission after PWA cold start (even if previously granted). This is a platform fact, not a product failure.

**Implementation**:
- Call `navigator.mediaDevices.getUserMedia({audio: true})` at start of `startCapture`
- If promise resolves → mic stream acquired, proceed to capture
- If promise rejects with `NotAllowedError` → throw `CaptureError("permission_denied")`
- If promise rejects with `NotFoundError` → throw `CaptureError("no_microphone_found")`
- Capture-engine does NOT cache permission state across sessions (each `startCapture` re-requests mic)

## Isolation Demo

The package-local Isolation Demo is IN-MEMORY ONLY (no session-store writes). See `isolation-demo/README.md` for detailed panel-based layout (5 panels: top chrome, control panel, live meters, chunk tape, event feed).

**What the demo proves**:
- Microphone acquisition works (live or simulated PCM)
- PCM capture works (audio callbacks firing)
- MP3 encoding works (chunks encode every ~4s)
- Chunks are playable from RAM (proves encoding correctness)
- Duration is sample-based (not wall clock)
- Watchdog detects mic ghost (if no audio for 10s, auto-stops with error)
- Final chunk < 4s flushes correctly on stop
- Reset discards all in-memory chunks (proves no persistence)

**What the demo does NOT prove**:
- Session-store integration (proven in session-store's Isolation Demo or final PWA)
- Durable persistence (demo is in-memory only)

## Event and Telemetry Expectations

### External Events (for consumers)

Consumers (PWA, Isolation Demo) subscribe to these events via capture handle:

- `chunkEncoded` — Fired every ~4s, payload includes session ID, seq, duration, byte length. PWA uses this to update chunk count in developer mode. Isolation Demo uses this to add chunk row to tape.
- `captureError` — Fired on mic ghost, store write failure, encoding error. Payload includes reason code and details. PWA uses this to show error message or decide whether to stop.
- `captureStopped` — Fired when capture stops (manually or auto-stop). Payload includes final summary. PWA uses this to navigate to session detail or show "no audio" message.

### Internal Telemetry (for debugging)

Capture-engine maintains an internal log (in-memory, not persisted) of:

- Microphone permission request timestamp and result
- First PCM callback timestamp (watchdog cancellation)
- Each chunk encode start/end timestamp, sample count, byte length
- Store write call timestamp, success/failure
- Watchdog timeout events
- Stop call timestamp, final buffer flush

**Telemetry access**: Internal log exposed via `handle.getTelemetry()` method (returns array of log entries with timestamps and event type). PWA developer console or Isolation Demo event feed can display this for debugging. Not shown in default PWA UI (developer mode only).

## Validation Steps

### Manual Validation (Isolation Demo)

1. **Live mic capture (happy path)**:
   - Open Isolation Demo in desktop Chrome
   - Select "Live Microphone" audio source
   - Click "Start Capture"
   - Grant mic permission when prompted
   - Speak continuously for 12 seconds
   - Observe: Duration counter climbs, PCM buffer fills/drains, chunks encode at ~4s intervals (3 chunks), chunk tape grows (3 rows), watchdog cancels after first chunk
   - Click "Stop Capture"
   - Observe: Duration freezes at ~12s, 3 chunks in tape
   - Click "Play" on each chunk row → hear recorded audio (proves encoding worked)
   - Click "Reset" → chunk tape clears, meters reset to 0

2. **Simulated PCM capture (no mic needed)**:
   - Open Isolation Demo
   - Select "Simulated PCM stream" audio source (default)
   - Click "Start Capture"
   - Observe: No mic permission prompt, duration climbs, chunks encode every ~4s, simulated audio plays when chunks played back
   - Click "Stop Capture" after ~10 seconds
   - Click "Play" on chunk rows → hear synthetic tone (proves simulated PCM works)

3. **Mic ghost detection (watchdog test)**:
   - Open Isolation Demo
   - Select "Live Microphone"
   - Click "Start Capture"
   - Grant mic permission
   - Do NOT speak (stay silent for > 10 seconds)
   - Observe: Watchdog countdown reaches 0, `captureError("no_audio_received")` event fires, capture auto-stops, chunk count = 0, hasAudio = false
   - Event feed shows red error message
   - PWA equivalent: After stop, PWA shows "Recording completed without playable audio" (not "transcription failed")

4. **Final chunk < 4s flush**:
   - Start capture, speak for 10 seconds (2 full chunks + 2s remainder), click "Stop Capture"
   - Observe: 3 chunks in tape (Seq 0: ~4s, Seq 1: ~4s, Seq 2: ~2s)
   - Click "Play" on Seq 2 → hear final 2 seconds of audio (proves final chunk flushed correctly)

### Automated Validation (Phase 06 optional)

If time permits, Phase 06 can add automated tests:
- Unit test for sample-based duration calculation
- Unit test for watchdog timeout logic
- Integration test for simulated PCM → encode → in-memory chunks (no session-store)
- Mock session-store write calls, verify `writeChunk` called with correct metadata

## Implementation Checklist

Phase 06 implementation agent should complete these tasks:

### Core Capture Logic
- [ ] Create `CaptureEngine` class or module (ES6 module exporting `startCapture`, types)
- [ ] Implement `startCapture(sessionId, options)` → returns capture handle
- [ ] Implement microphone acquisition via `getUserMedia` (with permission error handling)
- [ ] Implement simulated PCM stream (OscillatorNode or AudioBufferSourceNode for testing)
- [ ] Create `AudioContext`, `ScriptProcessorNode` (buffer size 4096, mono or stereo TBD)
- [ ] Implement `onaudioprocess` callback → append PCM samples to internal buffer
- [ ] Implement chunk slicing logic (when buffer >= target sample count, slice and encode)
- [ ] Integrate lamejs MP3 encoder (convert float32 to int16, encode to blob)
- [ ] Implement sample-based duration calculation (use PCM sample count, not wall clock)
- [ ] Implement watchdog timer (start on `startCapture`, cancel on first PCM callback, timeout at 10s)

### Session-Store Integration
- [ ] Import session-store module (or mock for Isolation Demo in-memory mode)
- [ ] Call `session-store.writeChunk(sessionId, blob, metadata)` after each chunk encodes
- [ ] Handle `writeChunk` exceptions (log, emit `captureError`, continue or stop based on policy)
- [ ] Call `session-store.markSessionComplete(sessionId, summary)` on stop

### Event System
- [ ] Implement event emitter pattern on capture handle (`on`, `off` methods)
- [ ] Emit `chunkEncoded` event after each chunk written (payload: sessionId, seq, duration, byteLength)
- [ ] Emit `captureError` event on mic ghost, store write failure, encoding error (payload: sessionId, reason, details)
- [ ] Emit `captureStopped` event on stop (payload: sessionId, chunksWritten, totalDuration, hasAudio)

### Stop and Cleanup
- [ ] Implement `stopCapture(handle)` → flush final buffer, encode final chunk (if < 4s), stop mic stream
- [ ] Return completion summary object (chunksWritten, totalDuration, hasAudio, sessionId)
- [ ] Clean up AudioContext, ScriptProcessorNode, mic stream (stop tracks, disconnect nodes)

### Error Handling
- [ ] Define `CaptureError` class (extends Error, includes reason code and details)
- [ ] Handle mic permission denied (throw `CaptureError("permission_denied")`)
- [ ] Handle mic not found (throw `CaptureError("no_microphone_found")`)
- [ ] Handle mic ghost (watchdog timeout → emit error, auto-stop, hasAudio=false)
- [ ] Handle store write failures (log, emit error, continue or stop)
- [ ] Handle already-capturing error (throw `CaptureError("already_capturing")`)

### Isolation Demo (In-Memory Mode)
- [ ] Create `packages/lib/capture-engine/isolation-demo/` folder with `index.html`, `app.js`, `styles.css`
- [ ] Implement 5-panel layout (top chrome, control panel, live meters, chunk tape, event feed) — see `isolation-demo/README.md` for full spec
- [ ] Implement in-memory chunk storage (JavaScript array of `{seq, startTime, endTime, blob, byteLength}` objects)
- [ ] Implement "Start Capture" button → calls `startCapture` with in-memory mode (no session-store writes)
- [ ] Implement "Stop Capture" button → calls `stopCapture`, updates meters
- [ ] Implement "Reset" button → clears in-memory chunks, resets UI
- [ ] Implement audio source toggle (Live Microphone vs Simulated PCM)
- [ ] Implement live meters (duration counter, PCM buffer fill, chunk count, watchdog countdown)
- [ ] Implement chunk tape list (grows as chunks encode, each row has Play button)
- [ ] Implement Play button per row (creates `<audio>` element with blob URL, plays chunk from RAM)
- [ ] Implement collapsible event feed (shows `chunkEncoded`, `captureError`, `captureStopped` events)
- [ ] Add `package.json` with `"start": "vite"` or similar dev server command
- [ ] Verify launch command works: `cd packages/lib/capture-engine/isolation-demo && npm start`

### Documentation and Types
- [ ] Add JSDoc or TypeScript types for `startCapture`, `stopCapture`, capture handle, events
- [ ] Update `README.md` with usage examples (how to call `startCapture`, subscribe to events)
- [ ] Verify `isolation-demo/README.md` matches implemented demo (update if any layout changes)

### Validation
- [ ] Manual test: Live mic capture (12s recording, 3 chunks, playback works)
- [ ] Manual test: Simulated PCM (no mic permission, synthetic audio, playback works)
- [ ] Manual test: Mic ghost (watchdog timeout, error event, hasAudio=false)
- [ ] Manual test: Final chunk < 4s (10s recording = 3 chunks: 4s, 4s, 2s)
- [ ] Manual test: Reset (clears chunk tape, no persistence)

### Known Limitations (Phase 06)
- ScriptProcessor is deprecated (but works on iOS). AudioWorklet migration is Phase 07.
- Encoding happens on main thread (acceptable for ~200ms every 4s). Web Worker migration is Phase 07 if needed.
- No retry logic for store write failures (fails once → logs error, continues). Phase 07 can add retry policy.
- No pause/resume (out of scope for Phase 06 MVP).

## Customer Relationships

Customers of capture-engine:
- `apps/web-whisper-pwa` (primary production customer; see `customers/web-whisper-pwa.md`)
- Isolation Demo (standing human customer; see `customers/00-isolation-demo.md`)

Customer request sections will be filled by Phase 04 customer-request agents. Producer response sections will be filled by Phase 05 producer-response agent.
