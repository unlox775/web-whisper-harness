# Customer: apps/web-whisper-pwa

The Web Whisper PWA is the primary customer of capture-engine. The PWA calls capture-engine to record audio when the user taps "Start Recording" and writes chunks to session-store immediately.

## Producer's Understanding of This Customer

The Web Whisper PWA is the primary production customer of capture-engine. The PWA is an iPhone Progressive Web App (Add to Home Screen) that allows users to record long-form audio (lectures, meetings, dictation) and later play back and transcribe useful segments.

**Who is this customer**: The person holding the iPhone. The PWA orchestrates the recording flow: user taps "Start Recording", PWA creates a session via session-store, PWA calls capture-engine to begin capturing audio and writing chunks to that session, user taps "Stop", PWA calls capture-engine to stop and flush, then PWA navigates to session detail where the user can play the recording or transcribe it.

**What this customer needs from capture-engine**:

1. **Start capturing on demand**: When the user taps "Start Recording", the PWA will:
   - Create a new session via `session-store.createSession()` (returns session ID)
   - Call `capture-engine.startCapture(sessionId)` with that session ID
   - Receive a capture handle with `stop()` method and event subscriptions
   - Display recording screen with live duration counter (if developer mode: also chunk count)

2. **Immediate chunk persistence (every ~4s)**: Capture-engine must encode PCM audio into MP3 chunks approximately every 4 seconds and write each chunk to session-store immediately via `session-store.writeChunk(sessionId, chunkBlob, metadata)`. This is the core product promise: durable while recording, not only at the end. If the page hiccups, tabs background, or iOS suspends, the already-written chunks remain safe in IndexedDB.

3. **Event-driven chunk count updates**: Capture-engine should emit a `chunkEncoded` event every ~4s with payload `{sessionId, seq, duration, byteLength}`. The PWA will subscribe to this event. In developer mode, the PWA displays the chunk count on the recording screen (e.g., "Chunks: 7"). In default mode, the event is logged but not shown to the user.

4. **Sample-based duration (not wall clock)**: The duration counter on the recording screen should be based on captured PCM samples (e.g., `sampleCount / sampleRate`), not `Date.now()` or `performance.now()`. This is a load-bearing lesson from the existing Web Whisper: encoded containers can lie about time if recording pauses or hiccups. Capture-engine must count samples and pass accurate duration metadata in each chunk.

5. **Stop and flush final chunk**: When the user taps "Stop", the PWA will:
   - Call `capture-engine.stopCapture(handle)`
   - Receive completion summary: `{chunksWritten, totalDuration, hasAudio, sessionId}`
   - If `hasAudio === true`: navigate to session detail, user can play the recording (via playback-engine) or transcribe it
   - If `hasAudio === false`: show message "Recording completed without playable audio" (not "transcription failed"), offer Delete button

6. **Mic ghost detection and honest reporting**: iOS Safari sometimes grants microphone permission but never delivers audio callbacks (known platform issue). Capture-engine must detect this with a watchdog timer (e.g., 10s timeout). If no audio callbacks arrive within 10s of `startCapture`, capture-engine should:
   - Emit `captureError` event with reason "no_audio_received"
   - Automatically stop capture (call internal `stop()`)
   - Return completion summary with `hasAudio=false`, `chunksWritten=0`, `totalDuration=0`
   - PWA will show "Recording completed without playable audio" and offer Delete. The PWA will NOT show "transcription failed" because transcription was never attempted (there is no audio to transcribe).

7. **Microphone permission re-prompts (iOS PWA behavior)**: iOS Safari re-prompts for microphone permission after PWA cold start (even if previously granted). This is a platform fact, not a product failure. Capture-engine should call `getUserMedia({audio: true})` on every `startCapture`. If the promise resolves, capture proceeds. If rejected with `NotAllowedError`, capture-engine throws `CaptureError("permission_denied")` and the PWA shows a permission prompt reminder. The PWA does NOT treat this as a capture failure; it is expected iOS behavior.

8. **Error handling and recovery**: If `session-store.writeChunk()` throws an exception (IndexedDB quota exceeded, corruption), capture-engine should:
   - Log the error internally
   - Emit `captureError` event with reason "store_write_failed" and details
   - Continue capturing (next chunk tries to write again; failure is non-fatal unless repeated)
   - PWA subscribes to `captureError` and can display a warning (e.g., "Storage write failed, recording may be incomplete") or auto-stop if multiple consecutive failures

9. **No pause/resume (Phase 06 scope)**: The PWA does not require pause/resume in Phase 06. User taps Start → recording begins. User taps Stop → recording ends. If the user wants to pause, they stop the current session and start a new session later. Pause/resume is backlog.

10. **Developer mode telemetry**: In developer mode (enabled in Settings), the PWA may display:
    - Live chunk count (updated via `chunkEncoded` events)
    - Live duration counter (polled via `handle.getStatus()` or computed from events)
    - Event log (subscribed to all capture-engine events: `chunkEncoded`, `captureError`, `captureStopped`)
    - These are NOT shown in default mode. Default recording screen shows only duration counter and Stop button.

**What this customer does NOT need**:
- Volume analysis (volume-analyzer does that)
- Snip proposal (volume-analyzer does that)
- Transcription (transcription-client does that)
- Playback (playback-engine does that)
- Storage schema or retention policy (session-store owns that)

**How the PWA will use capture-engine** (example flow):

1. User opens PWA, taps "Start Recording" FAB
2. PWA checks mic permission status (if not granted, explains iOS will prompt)
3. PWA calls `session = await sessionStore.createSession()` (returns `{id, createdAt}`)
4. PWA calls `handle = await captureEngine.startCapture(session.id)`
5. PWA subscribes to events: `handle.on('chunkEncoded', (data) => { if (devMode) updateChunkCount(data.seq + 1); })`
6. PWA subscribes to errors: `handle.on('captureError', (data) => { showErrorBanner(data.reason); })`
7. PWA displays recording screen with duration counter (polls `handle.getStatus().currentDuration` every 100ms, or computes from `chunkEncoded` events)
8. User taps "Stop" after 2 minutes
9. PWA calls `summary = await captureEngine.stopCapture(handle)`
10. If `summary.hasAudio === true`: PWA navigates to session detail (`/session/${session.id}`), shows Play button and Transcribe button
11. If `summary.hasAudio === false`: PWA shows alert "Recording completed without playable audio. The microphone may not have been active." with Delete button

**Factory floor question this customer needs answered**: Can capture-engine durably record long-form audio on an iPhone PWA, persisting chunks every ~4s so the recording survives page hiccups, and honestly report when iOS mic ghost prevents any audio from being captured?

## Customer Request

I'm the Web Whisper PWA. I need capture-engine to handle the entire microphone-to-durable-chunk pipeline so I can offer trustworthy recording on iPhone. Here's exactly what I need:

### Core Interfaces I Will Call

**`startCapture(sessionId, options?)`**

I will call this when the user taps "Start Recording". Before calling, I will:
1. Create a session via `session-store.createSession()` and receive a session ID
2. Display the Recording screen
3. Call `startCapture(sessionId)` with that session ID

Input I provide:
- `sessionId` (string): Fresh session ID from session-store
- `options` (optional): May include `watchdogTimeout` if user adjusts it in developer mode (default 10s is fine)

Output I expect:
- Capture handle object with these methods:
  - `stop()` → returns Promise resolving to `{chunksWritten, totalDuration, hasAudio, sessionId}`
  - `on(eventName, callback)` → subscribe to events
  - `off(eventName, callback)` → unsubscribe
  - `getStatus()` → returns current state: `{isActive, chunksEncoded, currentDuration, watchdogActive}`

Failure results I need to handle:
- Throws `CaptureError("permission_denied")` if user denies mic permission → I show modal "Microphone permission denied. Please allow microphone access in iOS Settings."
- Throws `CaptureError("already_capturing")` if sessionId already has active capture → I show error and navigate back to Home
- Throws `CaptureError("invalid_session")` if sessionId doesn't exist in session-store → I log error and show "Session not found"

**`handle.stop()`**

I will call this when user taps "Stop Recording" or when I need to abort capture (e.g., user navigates away).

Output I expect:
- `{chunksWritten: number, totalDuration: number, hasAudio: boolean, sessionId: string}`

How I use it:
- If `hasAudio === true`: Navigate to session detail, enable Play button and Transcribe button
- If `hasAudio === false`: Show message "Recording completed without playable audio. The microphone may not have delivered audio." with Delete button. Do NOT show "transcription failed" (there's no audio to transcribe).

### Events I Need

**`chunkEncoded` event**

Payload: `{sessionId, seq, duration, byteLength}`

How I use it:
- In developer mode: Update chunk count display on Recording screen ("Chunks: 7")
- In default mode: Log event internally but don't display to user

Subscribe pattern:
```javascript
handle.on('chunkEncoded', (data) => {
  if (developerMode) {
    updateChunkCount(data.seq + 1);
  }
  logEvent('chunkEncoded', data);
});
```

**`captureError` event**

Payload: `{sessionId, reason: string, details?: string}`

Reason codes I need to handle:
- `"no_audio_received"` → Auto-stop scenario (watchdog timeout). I show "Recording completed without playable audio" and offer Delete.
- `"store_write_failed"` → I show error banner "Storage write failed. Recording may be incomplete." and let user decide whether to stop.
- `"encoding_failed"` → I show error toast "Encoding failed: [details]" and auto-stop capture.

Subscribe pattern:
```javascript
handle.on('captureError', (data) => {
  if (data.reason === 'no_audio_received') {
    showMessage('Recording completed without playable audio');
    navigateToSessionDetail(data.sessionId, {playbackDisabled: true});
  } else if (data.reason === 'store_write_failed') {
    showErrorBanner('Storage write failed. Recording may be incomplete.');
  } else {
    showErrorToast(`Capture error: ${data.reason}`);
    stopRecording();
  }
});
```

**`captureStopped` event**

Payload: `{sessionId, chunksWritten, totalDuration, hasAudio}`

How I use it: Telemetry and cleanup. Mostly redundant with `stop()` return value, but useful for logging.

### Duration Counter Requirements

I need the duration counter on the Recording screen to show PCM sample-based duration, NOT wall clock. This is load-bearing from the existing Web Whisper: encoded containers lie about time if recording pauses or hiccups.

How I expect to get duration:
- Poll `handle.getStatus().currentDuration` every 100ms and update the duration display ("0:00", "0:01", "0:02"...)
- Duration should be based on `samplesRecorded / sampleRate` from capture-engine's internal PCM buffer
- If capture-engine emits duration in events, I can use that instead of polling

Duration must be accurate to 0.1s. Wall clock is NOT acceptable.

### Mic Ghost Detection

iOS Safari sometimes grants microphone permission but never delivers audio callbacks. Capture-engine MUST detect this with a watchdog timer (10s default, configurable in developer mode).

Expected behavior:
1. User taps "Start Recording" → I call `startCapture`
2. Mic permission granted → capture begins
3. No audio callbacks arrive for 10 seconds
4. Watchdog expires → capture-engine emits `captureError("no_audio_received")` and auto-stops
5. `handle.stop()` resolves with `{hasAudio: false, chunksWritten: 0, totalDuration: 0}`
6. I navigate to session detail with message "Recording completed without playable audio" and disabled Play button

I will NOT treat this as a transcription failure. The recording failed to capture audio, not transcription.

### Session-Store Integration Expectations

Capture-engine MUST write chunks to session-store as they encode (every ~4s). I expect:
- Capture-engine calls `session-store.writeChunk(sessionId, chunkBlob, metadata)` immediately after encoding each chunk
- Metadata includes: `{seq: number, startTime: number, endTime: number, byteLength: number, sampleRate: number}`
- If `writeChunk` throws (quota exceeded, corruption), capture-engine emits `captureError("store_write_failed")` but continues capturing (next chunk tries again)
- I subscribe to `captureError("store_write_failed")` and decide whether to stop or let recording continue

I do NOT call `session-store.writeChunk` myself. Capture-engine owns all chunk writes during active recording.

### Microphone Permission Handling

iOS Safari re-prompts for microphone permission after PWA cold start (even if previously granted). This is a platform fact, not a product failure.

Expected behavior:
1. User taps "Start Recording" → I call `startCapture`
2. Capture-engine calls `getUserMedia({audio: true})` internally
3. iOS shows permission prompt (or silently grants if recently allowed)
4. If granted → capture proceeds, I show Recording screen
5. If denied → capture-engine throws `CaptureError("permission_denied")` → I catch and show permission reminder modal

I do NOT cache permission state or try to detect permission before calling `startCapture`. Each recording attempt requests mic fresh.

### Error Recovery Patterns

**Quota exceeded during recording:**
- Capture-engine emits `captureError("store_write_failed", {reason: "quota_exceeded"})`
- I show error banner "Storage full. Stop recording and delete old sessions to free space."
- User taps "Stop" → I call `handle.stop()` → Navigate to session detail
- User can delete old sessions, then record again

**Mic ghost (no audio received):**
- Capture-engine emits `captureError("no_audio_received")` after 10s watchdog timeout
- Capture-engine auto-stops (internal `stop()` call)
- I receive `captureStopped` event with `hasAudio: false`
- I navigate to session detail with "Recording completed without playable audio" message
- User can delete the empty session or retry recording

**User navigates away during recording:**
- I call `handle.stop()` in component cleanup (React useEffect cleanup, etc.)
- Capture-engine flushes final chunk and stops cleanly
- Session is marked complete with `hasAudio: true` (if at least one chunk encoded) or `false` (if zero chunks)

### Developer Mode Features

When user enables developer mode in Settings, I display additional info on Recording screen:
- **Live chunk count**: Update from `chunkEncoded` events ("Chunks: 7")
- **Live duration**: Poll `handle.getStatus().currentDuration` every 100ms
- **Event log**: Subscribe to all events and display in collapsible panel (not shown by default)

These are NOT shown in default mode. Default Recording screen shows only:
- Pulsing cyan recording indicator
- Duration counter (MM:SS)
- "Stop Recording" button

### What I Do NOT Need

- I do NOT need capture-engine to analyze volume (volume-analyzer does that)
- I do NOT need capture-engine to propose snips (volume-analyzer does that)
- I do NOT need capture-engine to create sessions (I create via session-store first)
- I do NOT need pause/resume (Phase 06 scope; backlog for Phase 07)

### Summary of Interfaces

| Interface | Input | Output | Failure Result |
|-----------|-------|--------|----------------|
| `startCapture(sessionId)` | sessionId (string) | Capture handle | Throws `CaptureError("permission_denied")` or `CaptureError("invalid_session")` |
| `handle.stop()` | None | `{chunksWritten, totalDuration, hasAudio, sessionId}` | Throws if handle already stopped |
| `handle.on(event, callback)` | event name, callback | void | None (no-op if invalid event) |
| `handle.getStatus()` | None | `{isActive, chunksEncoded, currentDuration, watchdogActive}` | None |

### Event Summary

| Event | Payload | When Emitted |
|-------|---------|--------------|
| `chunkEncoded` | `{sessionId, seq, duration, byteLength}` | Every ~4s when chunk encodes |
| `captureError` | `{sessionId, reason, details?}` | On mic ghost, store write failure, encoding error |
| `captureStopped` | `{sessionId, chunksWritten, totalDuration, hasAudio}` | When capture stops (manual or auto-stop) |

## Producer Response

I'm capture-engine. I accept your web-whisper-pwa customer request. You are my primary production customer—the iPhone PWA orchestrator. I will handle the entire microphone-to-durable-chunk pipeline so you can offer trustworthy recording. I will write chunks to session-store immediately (every ~4s), emit events for your UI updates, detect mic ghost with watchdog, and provide sample-based duration (NOT wall clock). Here's exactly what I will ship in Phase 06:

### Core Interface: `startCapture(sessionId, options?)`

**Input**: 
- `sessionId` (string): Fresh session ID from your `session-store.createSession()` call
- `options` (optional): `{watchdogTimeout?: number}` (default 10000ms). You may configure in developer mode.

**Output**: Capture handle (synchronous return)

**Failure modes** (thrown exceptions, NOT events):
- Throws `CaptureError("permission_denied")` if user denies mic permission → You catch and show modal "Microphone permission denied. Please allow access in iOS Settings."
- Throws `CaptureError("invalid_session")` if sessionId doesn't exist in session-store → You catch, log error, show "Session not found"
- Throws `CaptureError("already_capturing")` if sessionId already has active capture → You catch, show error, navigate to Home

**Microphone permission flow** (iOS PWA behavior):
1. I call `navigator.mediaDevices.getUserMedia({audio: true})` when `startCapture` called
2. iOS shows permission prompt (or silently grants if recently allowed)
3. If granted → capture begins, return handle
4. If denied → throw `CaptureError("permission_denied")`

iOS re-prompts after PWA cold start. This is platform fact, not failure. You do NOT cache permission state or pre-check. Each recording attempt requests mic fresh.

### Capture Handle Methods

**`handle.stop()`** → Returns Promise resolving to completion summary

Returns: `{chunksWritten: number, totalDuration: number, hasAudio: boolean, sessionId: string}`

- `chunksWritten`: Count of chunks successfully written to session-store
- `totalDuration`: Total duration in seconds (from PCM sample count, NOT wall clock)
- `hasAudio`: `true` if at least one chunk written, `false` if zero chunks (mic ghost scenario)
- `sessionId`: Same sessionId passed to `startCapture`

How you use it:
- If `hasAudio === true`: Navigate to session detail, enable Play button and Transcribe button
- If `hasAudio === false`: Show message "Recording completed without playable audio. The microphone may not have delivered audio." with Delete button. Do NOT show "transcription failed" (no audio to transcribe).

**`handle.on(eventName, callback)` / `handle.off(eventName, callback)`**

Event subscription for UI updates. Standard EventEmitter pattern.

**`handle.getStatus()`** → Returns current state

Returns: `{isActive: boolean, chunksEncoded: number, currentDuration: number, watchdogActive: boolean}`

- `isActive`: `true` if capture running, `false` if stopped
- `chunksEncoded`: Count of chunks encoded so far (increments with each `chunkEncoded` event)
- `currentDuration`: Current duration in seconds (PCM sample-based, NOT wall clock)
- `watchdogActive`: `true` if watchdog timer running (before first chunk), `false` after first chunk or if capture stopped

You poll `getStatus().currentDuration` every 100ms to update duration display on Recording screen.

### Events I Will Emit

**`chunkEncoded` event**

Payload: `{sessionId: string, seq: number, duration: number, byteLength: number}`

When emitted: After each chunk encodes (~4s intervals) and chunk write to session-store succeeds

How you use it:
- In developer mode: Update chunk count display on Recording screen ("Chunks: 7")
- In default mode: Log internally but don't display to user

**`captureError` event**

Payload: `{sessionId: string, reason: string, details?: any}`

Reason codes I will emit:
- `"no_audio_received"` → Watchdog timeout expired (mic ghost). I auto-stop, you receive `captureStopped` with `hasAudio: false`
- `"store_write_failed"` → session-store.writeChunk failed (quota exceeded, database unavailable). You show error banner "Storage write failed. Recording may be incomplete."
- `"encoding_failed"` → MP3 encoding failed (lamejs error). You show error toast "Encoding failed: [details]", auto-stop capture

How you handle:
```javascript
handle.on('captureError', (data) => {
  if (data.reason === 'no_audio_received') {
    // Auto-stopped by watchdog, hasAudio=false
    showMessage('Recording completed without playable audio');
  } else if (data.reason === 'store_write_failed') {
    showErrorBanner('Storage write failed. Recording may be incomplete.');
    // Let user decide whether to stop or continue
  } else {
    showErrorToast(`Capture error: ${data.reason}`);
    stopRecording(); // Call handle.stop()
  }
});
```

**`captureStopped` event**

Payload: `{sessionId: string, chunksWritten: number, totalDuration: number, hasAudio: boolean}`

When emitted: Capture stopped (by your `handle.stop()` call OR by error auto-stop)

Mostly redundant with `stop()` return value, useful for telemetry/logging.

### Session-Store Integration (Automatic Chunk Writes)

**I call `session-store.writeChunk(sessionId, chunkData)` automatically** every ~4s during capture:

Chunk data I provide to session-store:
- `seq`: Sequential chunk number (0, 1, 2, 3...)
- `startTime`: Chunk start time in seconds (from PCM sample count)
- `endTime`: Chunk end time in seconds (from PCM sample count)
- `duration`: Chunk duration in seconds (`endTime - startTime`, typically ~4.0–4.2s)
- `blob`: MP3 encoded audio blob (binary data, MIME type `'audio/mpeg'`)
- `sizeBytes`: `blob.size` in bytes

**If writeChunk fails**:
- session-store returns `{error: 'quota_exceeded'}` → I emit `captureError('store_write_failed', {reason: 'quota_exceeded'})` and continue capturing (next chunk tries again)
- session-store returns `{error: 'session_not_found'}` → I emit `captureError('store_write_failed', {reason: 'session_not_found'})` and auto-stop capture
- session-store returns `{error: 'database_unavailable'}` → I emit `captureError('store_write_failed', {reason: 'database_unavailable'})` and continue capturing

You subscribe to `captureError` and decide whether to stop or let recording continue.

### Duration Counter (PCM Sample-Based, Load-Bearing)

**`handle.getStatus().currentDuration`** returns PCM sample-based duration:

Calculated as `samplesProcessed / sampleRate` (e.g., 88200 samples @ 44100 Hz = 2.0s)

**NOT wall clock** (`Date.now()` or `performance.now()`). This is load-bearing lesson from existing Web Whisper: encoded containers lie about time if recording pauses or hiccups. I count PCM samples and compute accurate duration.

You poll every 100ms to update duration display:
```javascript
setInterval(() => {
  const status = handle.getStatus();
  updateDurationDisplay(formatDuration(status.currentDuration)); // "0:00", "0:01", "1:23"
}, 100);
```

Duration must be accurate to 0.1s. Wall clock is NOT acceptable.

### Mic Ghost Detection (10s Watchdog)

**Watchdog timer** (default 10s, configurable via `options.watchdogTimeout`):

1. Starts after `getUserMedia` resolves (mic permission granted)
2. If first chunk encodes within 10s → watchdog cancels (recording proceeds normally)
3. If 10s expires before first chunk → I emit `captureError('no_audio_received')`, auto-stop capture, return `{hasAudio: false, chunksWritten: 0}`

Expected behavior:
- User taps "Start Recording" → you call `startCapture`
- Mic permission granted → capture begins
- **No audio callbacks arrive for 10 seconds** (iOS mic ghost bug)
- Watchdog expires → I emit `captureError('no_audio_received')`, auto-stop
- You receive `captureStopped` event with `hasAudio: false`
- You navigate to session detail with message "Recording completed without playable audio"

You will NOT treat this as transcription failure. Recording failed to capture audio, not transcription.

### Final Chunk Flush (< 4s Duration)

When you call `handle.stop()`:
- I flush remaining PCM buffer (< 4s of audio)
- I encode final chunk with actual duration (e.g., 2.3s if stopped at 10.3s into third chunk)
- I write final chunk to session-store via `writeChunk`
- I emit `chunkEncoded` event for final chunk
- I emit `captureStopped` event with final stats
- I return completion summary from `stop()` promise

Final chunk may have duration < 4s. Session-store and playback-engine handle this correctly (no special handling needed).

### Error Handling Strategy

**Pre-capture errors** (thrown exceptions):
- `CaptureError("permission_denied")` → Thrown from `startCapture` if mic permission denied
- `CaptureError("invalid_session")` → Thrown from `startCapture` if sessionId doesn't exist
- `CaptureError("already_capturing")` → Thrown from `startCapture` if sessionId already has active capture

**During-capture errors** (emitted as events):
- `captureError('no_audio_received')` → Watchdog timeout, auto-stop
- `captureError('store_write_failed')` → session-store write failed, continue capturing (you decide whether to stop)
- `captureError('encoding_failed')` → MP3 encoding failed, auto-stop

You catch thrown exceptions from `startCapture`. You subscribe to `captureError` events during capture.

### Performance Expectations

- `startCapture`: Returns immediately (< 50ms). Capture starts in background (Web Worker or AudioWorklet for PCM processing).
- `chunkEncoded` event: Emitted within 100ms after chunk encodes
- `handle.stop()`: Returns promise resolving within 500ms (flush final chunk, write to store)
- `handle.getStatus()`: Synchronous, < 10ms (property read)

If `getStatus()` is slow (> 50ms), duration counter stutters when polled every 100ms.

### What I Will NOT Ship in Phase 06

**Pause/resume**: Out of scope for Phase 06. User taps Start → recording begins. User taps Stop → recording ends. Pause is backlog (Phase 07 feedback spec if needed).

**Automatic retry on store write failure**: If `session-store.writeChunk` returns quota_exceeded, I emit error event and continue capturing. I do NOT automatically call `session-store.enforceRetentionPolicy` to free space. That is your orchestration responsibility (you call retention policy, then optionally resume recording with new session).

**Chunk buffering in memory during store failure**: If writeChunk fails, I emit error and continue capturing. Next chunk tries writeChunk again. I do NOT buffer failed chunks in memory (too complex, risk of memory overflow). Some chunks may be lost if store writes fail repeatedly. This is acceptable—you show "Recording may be incomplete" warning.

### Developer Mode Telemetry

In developer mode (enabled in your Settings), you may display:
- Live chunk count: Subscribe to `chunkEncoded`, increment counter
- Live duration: Poll `getStatus().currentDuration` every 100ms
- Event log: Subscribe to all events, display in collapsible panel

These are NOT shown in default mode. Default Recording screen shows only duration counter and Stop button.

### Spec Status

Spec Status: unresolved (Phase 06 implementation not yet built)

Phase 06 will implement `startCapture`, session-store integration, event system, watchdog timer, and validate with PWA integration tests (record audio, stop, verify chunks in session-store, play recording).
