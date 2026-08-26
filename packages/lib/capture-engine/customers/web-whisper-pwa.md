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

(To be filled by Phase 04 customer-request agent for web-whisper-pwa → capture-engine)

The PWA customer will write its request here: exact interfaces it needs (`startCapture`, `stopCapture`, events), error handling expectations, timing requirements, session-store integration expectations, and how it will handle mic ghost failures.

## Producer Response

(To be filled by Phase 05 producer-response agent for capture-engine)

Capture-engine will respond here: how it will meet the PWA's request, what interfaces it will provide, what session-store calls it will make, how it will handle errors, and what completion summary format it will return.
