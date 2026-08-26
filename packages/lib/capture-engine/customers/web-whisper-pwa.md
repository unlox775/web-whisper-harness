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

(To be filled by Phase 05 producer-response agent for capture-engine)

Capture-engine will respond here: how it will meet the PWA's request, what interfaces it will provide, what session-store calls it will make, how it will handle errors, and what completion summary format it will return.
