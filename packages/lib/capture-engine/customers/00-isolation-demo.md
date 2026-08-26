# Customer: Isolation Demo (Standing Human Customer)

The Isolation Demo is a standing founder/developer customer that operates capture-engine by itself, without the production PWA or session-store writes.

## Producer's Understanding of This Customer

The Isolation Demo is the standing human customer that operates capture-engine independently, without the production PWA or session-store persistence. This is the package factory floor: a desktop-browser web app that proves the core capture logic works in isolation.

**Who is this customer**: Founder or developer who needs to verify capture-engine behavior without loading the entire Web Whisper PWA or depending on session-store IndexedDB writes.

**What this customer needs**:

1. **Start capture with no external dependencies**: The demo should be able to call `startCapture` without first creating a session in session-store. This means the demo operates in "in-memory mode" where chunks are kept in RAM instead of being written to IndexedDB.

2. **Two audio source modes**:
   - **Live Microphone**: Real mic input via `getUserMedia`, requires user to grant permission and speak
   - **Simulated PCM stream** (default): Synthetic audio waveform (OscillatorNode or similar) so the demo can run without mic permission or user speech. This is the safe default because it allows immediate operation without prompts.

3. **Visual proof of capture pipeline**: The demo needs to see:
   - Duration counter climbing (from PCM sample count, not wall clock)
   - PCM buffer filling and draining as capture proceeds
   - Chunks encoding every ~4s (chunk count increments: 0 → 1 → 2 → 3...)
   - Watchdog countdown (10s timer that cancels after first chunk, or expires if mic ghost)
   - Chunk tape: scrollable list of encoded chunks with seq number, start/end time, byte length, and inline Play button

4. **Playback from RAM**: Each chunk in the tape should have a Play button that plays that chunk's audio blob directly from memory (via `<audio>` element with blob URL). This proves the MP3 encoding worked correctly without requiring session-store or playback-engine.

5. **Mic ghost detection**: If the demo selects Live Microphone, grants permission, but audio callbacks never fire (iOS mic ghost issue), the watchdog timer should count down from 10s to 0, then auto-stop capture with a `captureError("no_audio_received")` event. The event feed should show this error in red. This proves the watchdog logic works.

6. **Final chunk < 4s flush**: If the demo captures for 10 seconds (2 full chunks + 2s remainder) and clicks Stop, the chunk tape should show 3 chunks (Seq 0: ~4s, Seq 1: ~4s, Seq 2: ~2s). Playing Seq 2 should produce 2 seconds of audio. This proves final buffer flush works correctly.

7. **Reset and prove in-memory**: Clicking Reset should clear the chunk tape entirely, revoke blob URLs, and reset all meters to 0. This proves chunks are NOT persisted to IndexedDB and live only in RAM until tab close or Reset.

8. **Event visibility**: The demo should display a collapsible event feed (collapsed by default) showing `chunkEncoded`, `captureError`, and `captureStopped` events with timestamps and payloads. This allows debugging the event system without cluttering the main demo surface.

**What this customer does NOT need**:
- Session-store writes (proven in session-store's Isolation Demo or final PWA)
- Session creation (demo operates in-memory without session IDs, or uses fake session ID "demo-session")
- Durable persistence (demo is ephemeral by design)
- Full PWA UI (settings, session list, transcription)

**How capture-engine will support this customer**:
- `startCapture` will accept an optional `mode: "in-memory"` option (or detect missing session-store module) and skip session-store writes entirely
- Alternatively, capture-engine exports a separate `startCaptureInMemory()` function that returns chunks in RAM instead of writing to store
- Demo subscribes to `chunkEncoded`, `captureError`, `captureStopped` events via capture handle
- Demo calls `stopCapture(handle)` to flush final chunk
- Capture handle provides `getStatus()` method so demo can poll for live meters (duration, chunk count, watchdog state)

**Factory floor question this demo answers**: Does capture-engine successfully acquire the microphone (or simulated PCM), capture audio, encode MP3 chunks every ~4s, detect mic ghost failures, flush the final chunk < 4s, and produce playable audio — all without depending on session-store or the PWA?

## Customer Request

I'm the Isolation Demo for capture-engine. I'm the package factory floor that proves capture works independently, without the PWA or session-store persistence. I need to exercise capture-engine's core logic with minimal dependencies. Here's what I need:

### Core Requirement: In-Memory Mode (No session-store writes)

**Critical**: I operate in **in-memory mode only**. Chunks are kept in RAM during capture, NOT written to IndexedDB.

Capture-engine MUST provide a way to capture audio WITHOUT calling session-store's `writeChunk` interface. Options:
- `startCapture` accepts `{mode: 'in-memory'}` option → skips session-store writes, accumulates chunks in memory
- OR `startCaptureInMemory()` separate function → returns chunks as array instead of writing to store
- OR capture-engine detects missing session-store module → falls back to in-memory mode automatically

When capture stops, I need access to captured chunks (array of blobs) so I can display them in the chunk tape panel.

### Audio Source Modes I Need

**Safe default: Simulated PCM stream** (no mic permission required)

When demo launches, default mode is "Simulated Audio" (gray chip). Capture-engine generates synthetic audio waveform (OscillatorNode or AudioWorklet generating sine wave/noise at ~440 Hz). This allows immediate operation without mic permission prompt or user speech.

How I use it:
- Operator clicks "Start Capture" → capture-engine starts synthetic PCM stream
- Duration counter climbs (from PCM sample count)
- Chunks encode every ~4s (chunk count: 0 → 1 → 2 → 3...)
- Operator clicks "Stop Capture" → capture stops, final chunk < 4s flushes

**Optional mode: Live Microphone** (real mic input)

When operator toggles "Enable Microphone" ON, mode switches to "Live Microphone" (cyan chip). Capture-engine calls `getUserMedia({audio: true})` → requests mic permission → captures real audio.

How I use it:
- Operator toggles "Enable Microphone" ON
- Browser prompts for mic permission
- Operator grants permission + speaks into mic
- Capture-engine captures real audio → encodes chunks
- Proves: real mic capture works, not just synthetic audio

### Interfaces I Need

**`startCapture(options?)`** or **`startCaptureInMemory(options?)`**

When I call it: Operator clicks "Start Capture" button

Input: `options?: {mode?: 'simulated' | 'live', inMemory: true}` (mode defaults to 'simulated')

Output I expect: Capture handle object with methods and properties

Capture handle must provide:
- `stop()` → Stop capture, flush final chunk < 4s
- `getStatus()` → Current status: `{state: 'capturing' | 'stopped', duration: number, chunkCount: number, watchdogRemaining: number}`
- Event subscription: `on(eventName, callback)` and `off(eventName, callback)`

Events I need:
- `chunkEncoded(chunkData: {seq: number, startTime: number, endTime: number, duration: number, blob: Blob, sizeBytes: number})` → Chunk encoded successfully
- `captureError(error: {reason: string, detail?: any})` → Capture error (mic ghost, watchdog timeout, quota exceeded, etc.)
- `captureStopped()` → Capture stopped (by user clicking Stop or by error auto-stop)

How I use it:
- I call `startCapture({inMemory: true, mode: 'simulated'})`
- I store handle in component state
- I subscribe to events to update UI (duration counter, chunk tape, event feed)
- I poll `handle.getStatus()` every 100ms to update duration counter + watchdog countdown
- When operator clicks "Stop Capture" → I call `handle.stop()`

**`chunkEncoded` event**

Payload: `{seq: number, startTime: number, endTime: number, duration: number, blob: Blob, sizeBytes: number}`

When emitted: After each chunk encodes (~4s intervals during capture, plus final chunk on stop)

How I use it:
- Add row to chunk tape table: Seq, Start Time, End Time, Duration, Size, Play button
- Store blob in memory for inline playback
- Increment chunk count display: "Chunks: 3"
- Log event to event feed: "[15:23:45.123] Chunk 2 encoded: 8.24s–12.36s (4.12s, 32 KB)"

**`captureError` event**

Payload: `{reason: string, detail?: any}`

Reason codes I need to handle:
- `'mic_ghost'` → Microphone permission granted but no audio callbacks fire (iOS mic ghost bug)
- `'watchdog_timeout'` → 10s watchdog timer expired before first chunk encoded
- `'mic_permission_denied'` → User denied microphone permission
- `'mic_unavailable'` → Microphone device not available (device error)
- `'encoding_failed'` → MP3 encoding failed (lamejs error)

When emitted: Capture error occurred, capture auto-stopped

How I use it:
- Display error banner: "Capture failed: {reason}" (red background, white text)
- Log event to event feed: "[15:23:50.456] ERROR: {reason} - {detail}" (red text)
- Disable "Stop Capture" button (capture already stopped)
- Enable "Reset" button

**`captureStopped` event**

Payload: None

When emitted: Capture stopped (by user calling `stop()` OR by error auto-stop)

How I use it:
- Update UI state: capture button → "Start Capture", stop button disabled
- Log event to event feed: "[15:24:00.789] Capture stopped"
- Display final stats: "Captured 3 chunks, 11.6s total, 96 KB"

### Visual Proof I Need to See

**Duration counter** (climbing in real-time):

Display format: "Duration: 12.34s" (updates every 100ms)

Source: `handle.getStatus().duration` (from PCM sample count, NOT wall clock)

Critical: Duration MUST match sum of chunk durations. If duration counter shows "12.5s" but chunks sum to "11.8s", capture-engine has a bug (PCM sample count incorrect).

**Chunk tape** (scrollable list of encoded chunks):

Table with columns: Seq, Start Time, End Time, Duration, Size, Play button

Example row: `2 | 8.24s | 12.36s | 4.12s | 32 KB | ▶️`

When operator clicks Play button → I play chunk blob directly: `audioElement.src = URL.createObjectURL(chunkData.blob)`

Proves: MP3 encoding worked correctly, audio is playable

**Watchdog countdown** (visible when capture starts, hidden after first chunk):

Display format: "Watchdog: 7s" (counts down from 10s to 0s)

Source: `handle.getStatus().watchdogRemaining`

When first chunk encodes → watchdog timer cancels → countdown hidden

If watchdog reaches 0s before first chunk → `captureError('watchdog_timeout')` emitted → error banner appears

Proves: Mic ghost detection works

**PCM buffer meter** (optional, nice-to-have):

Progress bar showing PCM buffer fill level (0% to 100%)

Updates every 100ms, shows how close buffer is to encoding threshold (~4s of audio)

Proves: PCM buffer is filling and draining correctly during capture

### Edge Cases I Need to Validate

**Mic ghost (live microphone mode):**
1. Operator toggles "Enable Microphone" ON
2. Operator clicks "Start Capture"
3. Browser prompts for mic permission → operator grants
4. Mic permission granted BUT audio callbacks never fire (iOS mic ghost bug simulation)
5. Watchdog countdown: 10s → 9s → 8s → ... → 0s
6. At 0s: `captureError('watchdog_timeout')` emitted → error banner: "Capture failed: watchdog_timeout"
7. Chunk tape empty (0 chunks), capture auto-stopped

Proves: Watchdog logic works, mic ghost detected and reported

**Final chunk < 4s:**
1. Operator clicks "Start Capture" (simulated audio mode)
2. Wait 10 seconds (2 full chunks encode: seq 0 ~4s, seq 1 ~4s)
3. Click "Stop Capture" at 10.3s (2.3s into third chunk)
4. Third chunk encodes immediately: seq 2, duration 2.3s
5. Chunk tape shows 3 rows: seq 0 (4.0s), seq 1 (4.1s), seq 2 (2.3s)
6. Play seq 2 → audio plays for 2.3s (not 4s)

Proves: Final chunk flush works correctly, partial chunks < 4s are encoded

**Reset and prove in-memory:**
1. Operator captures 3 chunks (11.6s total)
2. Operator clicks "Reset" button
3. Chunk tape clears (all rows removed)
4. Duration counter resets to "0.0s"
5. Chunk count resets to "0"
6. Blob URLs revoked (memory released)
7. Operator reloads page → chunk tape still empty (proves chunks NOT persisted to IndexedDB)

Proves: In-memory mode works, no durable persistence

### UI Panels I Need

**Top Chrome Panel** (fixed header):
- Heading: "Capture Engine Isolation Demo"
- Data mode chip: "SIMULATED AUDIO" (gray) or "LIVE MICROPHONE" (cyan)
- "Enable Microphone" toggle (checkbox or switch)

**Control Panel** (left quarter):
- "Start Capture" button (cyan, enabled when not capturing)
- "Stop Capture" button (red, enabled when capturing)
- "Reset" button (gray, always enabled, clears chunk tape + resets state)
- Duration counter: "Duration: 12.34s"
- Chunk count: "Chunks: 3"
- Watchdog countdown: "Watchdog: 7s" (visible only when capturing, before first chunk)

**Chunk Tape Panel** (center half, scrollable):
- Heading: "Encoded Chunks"
- Table: Seq, Start Time, End Time, Duration, Size, Play button
- If empty: "No chunks yet. Click Start Capture."

**Event Feed Panel** (right quarter, scrollable, collapsible):
- Heading: "Events" (collapsed by default)
- Log entries: timestamp, event name, payload
- Color-coded: green for chunkEncoded, red for captureError, blue for captureStopped
- Example: `[15:23:45.123] chunkEncoded: seq=2, 8.24s–12.36s (4.12s, 32 KB)`

### Performance Expectations

- `startCapture` should return immediately (< 50ms, capture starts in background)
- `chunkEncoded` event should fire within 100ms after chunk encodes (not delayed)
- `stop()` should return immediately (< 50ms, capture stops in background)
- `getStatus()` should return immediately (< 10ms, synchronous property read)

If `getStatus()` is slow (> 50ms), duration counter will stutter when polled every 100ms.

### Error Handling Expectations

Capture-engine MUST emit `captureError` event (NOT throw exceptions) so I can display error banners gracefully.

All errors include reason code + optional detail object. I log errors to event feed and display error banner with reason.

If mic permission denied → `captureError('mic_permission_denied')` → I show error banner: "Microphone permission denied. Enable microphone access in browser settings."

If encoding fails → `captureError('encoding_failed', {detail: 'lamejs error...'})` → I show error banner: "Encoding failed: {detail}" + log to console

### What I Do NOT Need

- I do NOT need session-store integration (I operate in-memory only)
- I do NOT need session creation (I use fake session ID "demo-session" or no session ID at all)
- I do NOT need volume analysis (volume-analyzer's job)
- I do NOT need snip proposal (volume-analyzer's job)
- I do NOT need transcription (transcription-client's job)
- I do NOT need playback-engine (I play chunks directly with `<audio>` element + blob URL)

### Summary of Interfaces

| Interface | Input | Output | Failure Result |
|-----------|-------|--------|----------------|
| `startCapture(options)` or `startCaptureInMemory(options)` | options ({mode: 'simulated' or 'live', inMemory: true}) | Capture handle | N/A (errors emitted as events, not exceptions) |
| `handle.stop()` | None | void | N/A |
| `handle.getStatus()` | None | Status object ({state, duration, chunkCount, watchdogRemaining}) | N/A |
| `handle.on(eventName, callback)` | eventName, callback | void | N/A |

All errors emitted as `captureError` events (NOT thrown exceptions). In-memory mode MUST NOT call session-store `writeChunk`.

## Producer Response

(To be filled by Phase 05 producer-response agent for capture-engine)

Capture-engine will respond here: how it will meet the isolation-demo's request, what interfaces it will expose for demo use, what data modes it supports (in-memory only for this demo), and how the demo proves the package works independently.
