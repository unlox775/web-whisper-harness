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

I'm capture-engine. I accept your Isolation Demo customer request. You will operate as my factory floor—proving the core capture logic (mic acquisition, PCM capture, MP3 encoding, watchdog, final flush) works independently without session-store persistence. I will provide in-memory mode, two audio sources (simulated default, live mic optional), and event-driven chunk delivery. Here's exactly what I will ship in Phase 06:

### In-Memory Mode Interface (Accepted)

**`startCapture(sessionId, options?)`** with in-memory option

Options: `{mode?: 'simulated' | 'live', inMemory?: boolean}`

When `options.inMemory === true`:
- I will NOT call session-store's `writeChunk` (no session-store dependency)
- Encoded chunks accumulate in capture handle's internal array (RAM only)
- I emit `chunkEncoded` events with full chunk data including blob: `{seq, startTime, endTime, duration, blob: Blob, sizeBytes}`
- You store blobs in your demo component state for chunk tape display + inline playback

**Alternative naming** (if preferred): `startCaptureInMemory(options?)` separate function that always operates in-memory. I will decide naming in Phase 06 implementation (either one function with flag or two separate functions—both achieve same goal).

**Session ID handling in-memory mode**: When `inMemory: true`, `sessionId` parameter is optional or can be fake value like `"demo-session"`. I will NOT validate session existence or call session-store. You can pass `"demo"` or omit it.

### Audio Source Modes (Accepted)

**Safe default: Simulated PCM stream** (`mode: 'simulated'`)

- Generates synthetic audio waveform using OscillatorNode (440 Hz sine wave) or AudioWorklet (white noise)
- No mic permission required
- Automatic audio callbacks (no user speech needed)
- Data mode chip in demo: "SIMULATED AUDIO" (gray)

**Optional mode: Live Microphone** (`mode: 'live'`)

- Calls `navigator.mediaDevices.getUserMedia({audio: true})`
- Requests mic permission (browser prompt)
- Captures real audio from device microphone
- Requires user to speak for audio data
- Data mode chip in demo: "LIVE MICROPHONE" (cyan)

Default is `'simulated'` if not specified. You toggle between modes via checkbox in demo UI.

### Capture Handle Interface

**`startCapture(sessionId, options?)` returns capture handle**

Handle methods:
- `stop()` → Stop capture, flush final chunk < 4s, emit `captureStopped` event
- `getStatus()` → Returns `{state: 'capturing' | 'stopped', duration: number, chunkCount: number, watchdogRemaining: number | null}`
- `on(eventName, callback)` → Subscribe to events
- `off(eventName, callback)` → Unsubscribe

Handle is synchronous return (NOT Promise). Capture starts immediately in background (Web Worker or AudioWorklet for PCM processing).

### Events I Will Emit

**`chunkEncoded` event**

Payload: `{seq: number, startTime: number, endTime: number, duration: number, blob: Blob, sizeBytes: number}`

When emitted: After each chunk encodes (~4s intervals during capture, plus final chunk on stop)

In-memory mode: Payload includes blob so you can store it for chunk tape playback. In production mode (session-store writes), payload may omit blob (since already written to store).

**`captureError` event**

Payload: `{reason: string, detail?: any}`

Reason codes I will emit:
- `'mic_permission_denied'` → User denied microphone permission
- `'mic_unavailable'` → Microphone device not available
- `'mic_ghost'` → Mic permission granted but no audio callbacks (iOS ghost bug)
- `'watchdog_timeout'` → 10s watchdog expired before first chunk encoded
- `'encoding_failed'` → MP3 encoding failed (lamejs error)
- `'store_write_failed'` → session-store.writeChunk failed (production mode only, NOT emitted in in-memory mode)

When emitted: Capture error occurred, capture auto-stopped

**`captureStopped` event**

Payload: `{chunksEncoded: number, totalDuration: number, hasAudio: boolean}`

When emitted: Capture stopped (by user calling `stop()` OR by error auto-stop)

### Watchdog Timer (Accepted)

**10-second watchdog** for mic ghost detection:

- Starts when capture begins (after `getUserMedia` resolves in live mode, or immediately in simulated mode)
- Resets/cancels after first chunk encodes
- If expires before first chunk → emit `captureError('watchdog_timeout')`, auto-stop capture
- `getStatus().watchdogRemaining` returns seconds remaining (10.0 → 9.5 → 9.0 → ... → 0.0), or `null` after first chunk or if watchdog not active

In simulated mode, watchdog should never expire (synthetic audio always generates data). In live mode with mic ghost, watchdog expires and you see error banner.

### Duration Counter (PCM Sample-Based)

**`getStatus().duration`** returns PCM sample-based duration (NOT wall clock):

- Calculated as `samplesProcessed / sampleRate` (e.g., 44100 samples @ 44.1 kHz = 1.0s)
- Updates in real-time as capture proceeds
- You poll every 100ms to update duration display: "Duration: 12.34s"

**Critical**: Duration MUST match sum of chunk durations. If duration counter shows "12.5s" but chunks sum to "11.8s", I have a bug. You validate this in demo walkthrough.

### Final Chunk < 4s Flush (Accepted)

When you call `handle.stop()`:
- I flush remaining PCM buffer (< 4s of audio)
- I encode final chunk with actual duration (e.g., 2.3s if stopped at 10.3s into third chunk)
- I emit `chunkEncoded` event for final chunk
- I emit `captureStopped` event with final stats

Chunk tape will show final chunk with duration < 4s. Playing final chunk should produce correct duration audio (not padded to 4s).

### Reset Behavior (Demo Responsibility)

Clicking "Reset" button in demo:
- Demo calls `handle.stop()` if capture active
- Demo clears chunk tape array (removes all rows from UI)
- Demo revokes blob URLs: `URL.revokeObjectURL(blobUrl)` per chunk
- Demo resets state: duration 0, chunk count 0

I do NOT provide `reset()` method on handle. Reset is demo UI operation (clear component state).

### Inline Chunk Playback (Demo Responsibility)

Chunk tape row has "Play" button. When clicked:
- Demo creates blob URL: `URL.createObjectURL(chunkData.blob)`
- Demo sets audio element source: `audioElement.src = blobUrl`
- Demo plays audio: `audioElement.play()`

I do NOT provide playback methods. Demo handles playback directly (proves blobs are valid MP3 without needing playback-engine).

### Performance Targets

- `startCapture`: < 50ms (capture starts in background, synchronous return)
- `chunkEncoded` event: emitted within 100ms after chunk encodes
- `stop()`: < 50ms (capture stops in background)
- `getStatus()`: < 10ms (synchronous property read, NO async operations)

If `getStatus()` is slow (> 50ms), duration counter stutters when polled every 100ms.

### Error Handling (Events, NOT Exceptions)

All errors emitted as `captureError` events with structured payload. I do NOT throw exceptions from `startCapture`, `stop`, or `getStatus`.

If mic permission denied:
- `getUserMedia` promise rejects with `NotAllowedError`
- I catch rejection, emit `captureError('mic_permission_denied')`
- You display error banner: "Microphone permission denied"

If encoding fails:
- lamejs throws exception during MP3 encoding
- I catch exception, emit `captureError('encoding_failed', {detail: exception.message})`
- You display error banner: "Encoding failed: {detail}"

### What I Will NOT Ship in Phase 06

**Live data integration flags like `{liveFromCaptureEngine: true}`**: You requested optional "live from capture" toggle for testing integrated writes to session-store sandbox DB. I will NOT implement this in Phase 06. Too complex for Isolation Demo scope. Demo operates in pure in-memory mode (no session-store writes). If you want to test session-store writes, use session-store's Isolation Demo or final PWA integration.

**Separate `startCaptureInMemory()` function**: I will use single `startCapture(sessionId, options?)` function with `inMemory` flag. Simpler API surface. If `inMemory: true` → skip session-store writes. If `inMemory: false` or omitted → call session-store `writeChunk`.

### Spec Status

Spec Status: unresolved (Phase 06 implementation not yet built)

Phase 06 will implement in-memory mode, simulated/live audio sources, watchdog timer, event system, and build Isolation Demo. Demo walkthrough will validate mic ghost detection, final chunk flush, and in-memory behavior (Reset clears all chunks, reload shows empty state).
