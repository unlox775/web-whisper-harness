# Customer: Isolation Demo (Standing Human Customer)

The Isolation Demo is a standing founder/developer customer that operates playback-engine by itself, without the production PWA.

## Producer's Understanding of This Customer

The Isolation Demo is the **standing founder/developer customer** and the **package factory floor**. It is a separately launchable web app inside the `packages/lib/playback-engine/isolation-demo/` directory. The demo exercises playback-engine's core logic independently, without the production PWA, to prove the package works before integrating it into the full app.

### Why This Customer Exists

The Isolation Demo answers the question: **"Does playback-engine correctly play audio from sessions, chunks, and snips, and do pause/resume/seek/stop controls work as expected?"**

This is the **proof-of-recording validation surface**. If a recorded session cannot be played in the Isolation Demo, it cannot be played in the PWA, and the recording product has failed. The demo makes playback failures visible and debuggable without navigating the full PWA UI.

The demo is also a **development surface** for the founder/developer working on playback-engine. When implementing playback logic, the developer can run the demo, play fixture audio, inspect events, and validate behavior immediately without launching the PWA, capturing audio, or setting up session-store data.

### What the Isolation Demo Needs from Playback-Engine

**Same programmatic interface as PWA**:

The demo calls the same playback-engine functions that the PWA will call:
- `playSession(sessionId)` → returns playback handle
- `playChunk(chunkId)` → returns playback handle
- `playSnip(snipId)` → returns playback handle
- `handle.pause()`, `handle.resume()`, `handle.seek(time)`, `handle.stop()`
- Subscribe to playback events: `playing`, `paused`, `timeupdate`, `seeked`, `ended`, `stopped`, `playbackError`

The demo proves that these interfaces work correctly. If the demo can play fixture audio, the PWA can play real sessions.

**Fixture data by default (safe default, no session-store dependency)**:

The demo uses **fixture audio** (simulated session with 3 chunks, 2 snips) as the safe default. Fixture audio is either:
- Generated at runtime (Web Audio API sine waves or noise, encoded to MP3)
- OR pre-encoded fixture MP3 files bundled with the demo

Fixture session:
- Session ID: `demo-session-001`
- Total duration: 11.6s
- Chunks: 3 (4.0s, 4.1s, 3.5s)
- Snips: 2 (chunks 0–1 = 8.1s, chunks 2–2 = 3.5s)

Fixture audio must be **distinguishable** (chunk 0 sounds different from chunk 1, e.g., different tones or speech samples) so the developer can hear whether concatenation is correct and seek is working. If all chunks sound identical, the developer cannot tell if playback is playing the wrong chunk or seeking to the wrong position.

**Optionally, real session-store read-only mode**:

The demo can optionally toggle "Use Real Sessions" mode to read from a sandbox IndexedDB instance (`web-whisper-demo-db`, not production `web-whisper-db`). This proves session-store integration works: playback-engine reads real chunks, concatenates them, plays them. This is read-only (demo does NOT write to session-store, does NOT capture audio, does NOT modify sessions). This mode is optional; fixture mode is sufficient for most validation.

**Event visibility (event feed panel)**:

The demo displays a scrollable event feed that logs all playback events with timestamps and color-coded by event type:
- `playing(currentTime, duration)` → green text, timestamp
- `paused(currentTime)` → yellow text, timestamp
- `timeupdate(currentTime)` → gray text (emits every ~250ms, many entries)
- `seeked(currentTime)` → cyan text, timestamp
- `ended()` → blue text, timestamp
- `stopped()` → red text, timestamp
- `playbackError(reason, detail)` → red text, timestamp, error details

This event feed is the **validation surface** for playback-engine's event emission. The developer can see that events fire at the right times, with the right payloads, and in the right order. If an event is missing or incorrect, the developer knows playback-engine has a bug.

### What the Isolation Demo Provides to Playback-Engine

**Fixture session/chunk/snip IDs**: The demo owns fixture data definitions (session `demo-session-001`, chunks `demo-chunk-000`, `demo-chunk-001`, `demo-chunk-002`, snips `demo-snip-000`, `demo-snip-001`). The demo passes these IDs to playback-engine's `playSession` / `playChunk` / `playSnip` functions. Playback-engine does NOT know these are fixture IDs; it treats them as ordinary session/chunk/snip IDs and reads from session-store (in fixture mode, session-store reads are mocked to return fixture blobs).

**UI controls for manual operation**: The demo provides play/pause/resume/stop buttons, seek slider, playback target selector (session/chunk/snip radio buttons and dropdowns). The developer manually clicks these controls to exercise playback-engine. This is NOT automated testing; it is **manual walkthrough validation**. The developer watches the UI, listens to audio, and verifies behavior is correct.

**Data mode toggle**: The demo provides a toggle switch ("Enable Real Store") to switch between fixture mode and real store read-only mode. When toggled, the demo changes which session-store instance it reads from (in-memory fixture store vs sandbox IndexedDB). Playback-engine does NOT know which mode is active; it always calls session-store's read functions, and the demo mocks or delegates those reads based on the current mode.

### Validation Questions This Customer Answers

The Isolation Demo validates:

1. **Does session playback work?** Play session `demo-session-001` (3 chunks, 11.6s total). Audio should play for 11.6s continuously with no gaps between chunks. Event feed should log `playing` at start, `timeupdate` every ~250ms, `ended` at 11.6s. Time display should count from "0.0s / 11.6s" to "11.6s / 11.6s".

2. **Does chunk playback work?** Play chunk 1 (4.1s). Audio should play for 4.1s. Event feed should log `playing`, `timeupdate`, `ended`. Time display should count from "0.0s / 4.1s" to "4.1s / 4.1s".

3. **Does snip playback work?** Play snip 0 (chunks 0–1, 8.1s). Audio should play for 8.1s. Chunks 0 and 1 should concatenate seamlessly (no gap at 4.0s boundary). Event feed should log `playing`, `timeupdate`, `ended`.

4. **Do playback controls work?** Play session, click Pause at 5.0s, verify audio pauses, event feed logs `paused`, time freezes at "5.0s / 11.6s". Click Resume, verify audio resumes, event feed logs `playing`, time continues updating. Move seek slider to 8.0s, verify audio jumps to 8.0s, event feed logs `seeked`. Click Stop, verify audio stops, time resets to "0.0s / 11.6s", event feed logs `stopped`.

5. **Is multi-chunk concatenation seamless?** Play session (3 chunks). Listen carefully at chunk boundaries (4.0s and 8.1s). There should be NO audible gap, click, or time skip. Audio should sound like one continuous recording, not three separate clips.

6. **Does error handling work?** (Simulated) If session-store returns null for a chunk (chunk missing), playback-engine should return error `{error: 'chunk_not_found', chunkId}`. Demo should display error message in event feed or error panel. If HTML5 audio decode fails (invalid MP3 blob), playback-engine should emit `playbackError` event, demo should log error to event feed.

7. **Does real store read-only mode work?** (Optional) Toggle "Use Real Sessions" ON. If sandbox IndexedDB has sessions, select one, play it. Audio should play from real chunks (not fixture). If sandbox store empty, validation skipped.

### Operating Surface Characteristics

**Runtime**: Web app (local dev server, Vite or Webpack, launched via `cd packages/lib/playback-engine/isolation-demo && npm start`)

**Device/viewport**: Desktop browser, wider factory floor (1280px+ width recommended, not phone-shaped). Panels are side-by-side (fixture data panel, playback control panel, event feed panel). Phone viewport would be too narrow; the demo is a developer tool, not a user-facing UI.

**Orientation**: Landscape (desktop browser default). Not portrait (phone default).

**Visual identity**: The Isolation Demo does NOT need to match Web Whisper's visual identity (parchment theme, typography, color scheme). It is a factory-floor operating surface, not a customer-facing product. The demo can use plain developer-friendly UI (gray panels, monospace fonts for event logs, cyan/yellow/red color-coded buttons, no parchment background). The founder vision says: "Isolation Demos for packages may look like founder/dev operating surfaces. The final app should still look like Web Whisper."

**Launch command**: `cd packages/lib/playback-engine/isolation-demo && npm start` (or equivalent; exact command depends on project setup, likely `npm run dev` for Vite). The demo should launch on `http://localhost:5173` (Vite default) or similar local dev server port.

**No navigation, no tabs, single-page layout**: The demo has ONE screen with 4 panels (top chrome, fixture data, playback control, event feed). No navigation between screens, no tabs, no routing. All validation happens on one page.

### Data Mode Safety

**Safe default: Fixture mode**. When the demo launches, it starts in fixture mode (top chrome displays "FIXTURE MODE (mock audio)" chip, fixture data panel shows fixture session info, no session-store dependency). This is the safe default because:
- No risk of reading or corrupting production session-store data (fixture mode is fully in-memory)
- Known audio data (3 chunks with known durations, 2 snips with known chunk ranges) makes validation deterministic
- Works immediately without setup (no need to capture real sessions, set up IndexedDB, etc.)

**Optional unsafe mode: Real Sessions**. When "Enable Real Store" toggled ON, the demo switches to read-only mode for sandbox session-store (`web-whisper-demo-db`, not production). This mode is unsafe in the sense that it depends on external data (sandbox IndexedDB may be empty, may have corrupt sessions, may have missing chunks). But it is read-only, so it does NOT corrupt data. This mode proves session-store integration works in a real-world scenario.

**Visual distinction**: The data mode chip in top chrome is visually unmistakable. Fixture mode: "FIXTURE MODE (mock audio)" gray border. Real store mode: "REAL STORE (read-only)" cyan border. The developer always knows which mode is active.

## Customer Request

I'm the Isolation Demo for playback-engine. I'm the package factory floor that proves audio playback works correctly, including seamless multi-chunk concatenation, playback controls (pause/resume/seek/stop), and event emission. Here's what I need:

### Core Requirement: Fixture Data First (Safe Default)

**Safe default**: Fixture session with 3 distinguishable chunks (no session-store dependency, audio blobs in memory).

Fixture session:
- Session ID: `demo-session-001`
- Total duration: 11.6s
- Chunks: 3
  - Chunk 0: seq=0, startTime=0.0s, endTime=4.0s, duration=4.0s, blob=fixture MP3 (tone A or "Hello")
  - Chunk 1: seq=1, startTime=4.0s, endTime=8.1s, duration=4.1s, blob=fixture MP3 (tone B or "World")
  - Chunk 2: seq=2, startTime=8.1s, endTime=11.6s, duration=3.5s, blob=fixture MP3 (tone C or "Test")
- Snips: 2
  - Snip 0: chunks 0–1, startTime=0.0s, endTime=8.1s, duration=8.1s
  - Snip 1: chunks 2–2, startTime=8.1s, endTime=11.6s, duration=3.5s

**Critical**: Chunks MUST be distinguishable (different tones or speech samples) so operator can hear whether concatenation is correct and seek is working. If all chunks sound identical, operator cannot tell if playback is playing wrong chunk or seeking to wrong position.

Fixture audio options:
- Pre-recorded MP3 files bundled with demo (e.g., speech samples: "Hello", "World", "Test")
- OR generated at runtime using Web Audio API (OscillatorNode with different frequencies: 440 Hz, 550 Hz, 660 Hz, encoded to MP3)

### Interfaces I Need

**`playSession(sessionId)`** (play entire session)

When I call it: Operator selects "Session" in playback target selector, clicks "Play" button

Input: `sessionId: string` (fixture: `"demo-session-001"`)

Output I expect: Playback handle object with methods, properties, and events

Playback handle must provide:
- `pause()` → Pause playback
- `resume()` → Resume from paused position
- `seek(time)` → Jump to specific time in seconds (0 to duration)
- `stop()` → Stop playback, reset to 0:00, release handle
- `state` (readonly property) → Current state: `'playing'`, `'paused'`, `'stopped'`
- `currentTime` (readonly property) → Current position in seconds (updated in real-time)
- `duration` (readonly property) → Total duration in seconds (11.6s for fixture session)
- Event subscription: `on(eventName, callback)` and `off(eventName, callback)`

How I use it:
- I call `playSession('demo-session-001')`
- Playback-engine reads fixture chunks (from in-memory fixture store or mock session-store)
- Playback-engine concatenates 3 MP3 blobs → plays as single continuous stream
- I subscribe to events to update UI (play/pause button states, time display, progress bar, event feed)
- Operator listens to audio → should hear tone A (4s) → tone B (4.1s) → tone C (3.5s) with NO gaps

**`playChunk(chunkId)`** (play single chunk, developer mode)

When I call it: Operator selects "Chunk" in playback target selector, selects chunk from dropdown, clicks "Play" button

Input: `chunkId: string` (fixture: `"demo-chunk-000"`, `"demo-chunk-001"`, `"demo-chunk-002"`)

Output I expect: Same playback handle interface as `playSession`

How I use it:
- I call `playChunk('demo-chunk-001')` (chunk 1, tone B, 4.1s)
- Playback-engine reads single chunk blob → plays
- Operator listens → should hear tone B for 4.1s
- Proves: single-chunk playback works

**`playSnip(snipId)`** (play snip)

When I call it: Operator selects "Snip" in playback target selector, selects snip from dropdown, clicks "Play" button

Input: `snipId: string` (fixture: `"demo-snip-000"`, `"demo-snip-001"`)

Output I expect: Same playback handle interface as `playSession`

How I use it:
- I call `playSnip('demo-snip-000')` (snip 0, chunks 0–1, 8.1s)
- Playback-engine reads chunks 0–1 → concatenates → plays
- Operator listens → should hear tone A (4s) → tone B (4.1s) with NO gap at 4.0s boundary
- Proves: snip playback works, multi-chunk concatenation seamless

### Playback Control Methods I Need

**`handle.pause()`**

When I call it: Operator clicks "Pause" button during playback

Expected behavior:
- Audio pauses immediately
- `state` changes to `'paused'`
- `currentTime` freezes (e.g., 5.2s)
- `paused` event emitted with `{currentTime: 5.2}`

How I validate:
- Time display freezes: "5.2s / 11.6s"
- Play button replaces pause button
- Event feed logs: `[15:23:45.123] paused(5.2s)` (yellow text)

**`handle.resume()`**

When I call it: Operator clicks "Resume" button after pause

Expected behavior:
- Audio resumes from paused position (5.2s)
- `state` changes to `'playing'`
- `currentTime` continues updating
- `playing` event emitted with `{currentTime: 5.2, duration: 11.6}`

How I validate:
- Time display continues updating: "5.2s / 11.6s" → "5.3s / 11.6s" → ...
- Pause button replaces play button
- Event feed logs: `[15:23:47.456] playing(5.2s, 11.6s)` (green text)

**`handle.seek(time)`**

When I call it: Operator drags seek slider to new position (e.g., 8.0s)

Expected behavior:
- Audio jumps to 8.0s (chunk 2, tone C)
- `currentTime` updates to 8.0
- `seeked` event emitted with `{currentTime: 8.0}`
- If was playing before seek → resumes playing from 8.0s
- If was paused before seek → remains paused at 8.0s

How I validate:
- Time display jumps: "5.2s / 11.6s" → "8.0s / 11.6s"
- Operator hears tone C (not tone A or B), confirms seek jumped to correct chunk
- Event feed logs: `[15:23:50.789] seeked(8.0s)` (cyan text)

**`handle.stop()`**

When I call it: Operator clicks "Stop" button during playback

Expected behavior:
- Audio stops immediately
- `currentTime` resets to 0.0
- `state` changes to `'stopped'`
- `stopped` event emitted
- Handle released (blob URL revoked, event listeners removed)

How I validate:
- Time display resets: "5.2s / 11.6s" → "0.0s / 11.6s"
- Play button visible, pause/resume buttons hidden
- Event feed logs: `[15:23:55.012] stopped()` (red text)

### Playback Events I Need

**`playing` event**

Payload: `{currentTime: number, duration: number}`

When emitted: Playback starts or resumes

How I use it:
- Update play button → pause icon
- Start time display ticker (poll `handle.currentTime` every 100ms)
- Start progress bar animation
- Log to event feed: `[timestamp] playing(currentTime, duration)` (green text)

**`paused` event**

Payload: `{currentTime: number}`

When emitted: Playback pauses

How I use it:
- Update pause button → play/resume icon
- Stop time display ticker
- Freeze progress bar
- Log to event feed: `[timestamp] paused(currentTime)` (yellow text)

**`timeupdate` event**

Payload: `{currentTime: number}`

When emitted: Every ~250ms during playback

How I use it:
- Update time display: "5.2s / 11.6s"
- Update progress bar scrubber position: `(currentTime / duration) * 100%`
- Log to event feed: `[timestamp] timeupdate(currentTime)` (gray text, many entries)

**`seeked` event**

Payload: `{currentTime: number}`

When emitted: Seek operation completes

How I use it:
- Update time display to new position
- Update progress bar scrubber to new position
- Log to event feed: `[timestamp] seeked(currentTime)` (cyan text)

**`ended` event**

Payload: `{}`

When emitted: Playback reaches end of audio

How I use it:
- Reset to idle state: play button visible, pause button hidden
- Reset time display: "11.6s / 11.6s" or "0.0s / 11.6s"
- Reset progress bar scrubber to start or end
- Log to event feed: `[timestamp] ended()` (blue text)

**`stopped` event**

Payload: `{}`

When emitted: `handle.stop()` is called

How I use it:
- Reset to idle state (same as `ended`)
- Log to event feed: `[timestamp] stopped()` (red text)

**`playbackError` event**

Payload: `{reason: string, detail?: any}`

Reason codes I need to handle:
- `'audio_decode_failed'` → HTML5 audio decode error
- `'chunk_missing'` → Chunk not found or blob null
- `'chunk_read_failed'` → Unable to read chunk blob

When emitted: Playback error occurred during playback

How I use it:
- Display error banner: "Playback failed: {reason}" (red background, white text)
- Log to event feed: `[timestamp] playbackError({reason}, {detail})` (red text)
- Stop playback (handle auto-stops on error)

### Visual Proof I Need to See

**Seamless multi-chunk concatenation** (critical validation):

1. Operator clicks "Play Session" (demo-session-001, 3 chunks, 11.6s)
2. Audio plays: tone A (4s) → tone B (4.1s) → tone C (3.5s)
3. Operator listens carefully at chunk boundaries (4.0s and 8.1s)
4. **NO audible gap, click, or time skip** at boundaries
5. Audio sounds like one continuous recording, not three separate clips
6. Time display climbs smoothly: "4.0s / 11.6s" → "4.1s / 11.6s" (no jump from 4.0s to 4.2s)
7. Proves: blob concatenation works, HTML5 Audio plays concatenated blob seamlessly

**Seek across chunks** (chunk boundary transparency):

1. Operator plays session (demo-session-001)
2. Operator drags seek slider to 4.0s (exact chunk 0/1 boundary)
3. Audio jumps to 4.0s → operator hears tone B immediately (not tone A)
4. Operator drags seek slider to 8.1s (exact chunk 1/2 boundary)
5. Audio jumps to 8.1s → operator hears tone C immediately (not tone B)
6. Proves: seek works transparently across chunk boundaries, playback-engine calculates offsets correctly

**Control flow validation**:

1. Play session → Pause at 5.2s → time freezes → Resume → time continues → Stop → time resets to 0.0s
2. Event feed logs all events in correct order: `playing` → `paused` → `playing` → `stopped`
3. Proves: control methods work, event emission correct

### UI Panels I Need

**Top Chrome Panel** (fixed header):
- Heading: "Playback Engine Isolation Demo"
- Data mode chip: "FIXTURE MODE (mock audio)" (gray) or "REAL STORE (read-only)" (cyan, if optional toggle ON)

**Playback Control Panel** (left third):
- Playback target selector: Radio buttons: Session / Chunk / Snip
- Target dropdown: (Session: demo-session-001, Chunk: demo-chunk-000/001/002, Snip: demo-snip-000/001)
- "Play" button (cyan, enabled when target selected and not playing)
- "Pause" button (yellow, enabled when playing)
- "Resume" button (cyan, enabled when paused)
- "Stop" button (red, enabled when playing or paused)
- Seek slider (horizontal, 0 to duration)
- Time display: "5.2s / 11.6s"

**Fixture Data Panel** (center third):
- Heading: "Fixture Session"
- Session info: ID, Duration, Chunks count
- Chunks table: Seq, Start Time, End Time, Duration (rows: 0, 1, 2)
- Snips table: Snip ID, Chunks, Duration (rows: 0, 1)

**Event Feed Panel** (right third, scrollable):
- Heading: "Playback Events"
- Log entries: timestamp, event name, payload
- Color-coded: green (playing), yellow (paused), gray (timeupdate), cyan (seeked), blue (ended), red (stopped, playbackError)
- Example: `[15:23:45.123] playing(0.0s, 11.6s)`

### Optional: Real Store Read-Only Mode

**Optional mode**: "Enable Real Store" toggle → demo reads from sandbox IndexedDB (`web-whisper-sandbox-db`, NOT production).

When toggled ON:
- Data mode chip: "REAL STORE (read-only)" (cyan)
- Target dropdown populates with real sessions from sandbox DB (if any exist)
- Operator can play real sessions, chunks, snips from sandbox store
- Proves: session-store integration works, playback-engine reads real chunks correctly

This is optional; fixture mode is sufficient for validation.

### Performance Expectations

- `playSession`: < 500ms to start playback for typical sessions (< 30 chunks)
- `playChunk`: < 100ms to start playback (single chunk)
- `playSnip`: < 300ms to start playback for typical snips (< 10 chunks)
- `pause`, `resume`, `stop`: < 50ms (instant UI response)
- `seek`: < 50ms (HTML5 Audio `.currentTime` set is synchronous)

If `playSession` takes > 1s for fixture session (3 chunks), operator will perceive sluggishness.

### Error Handling Expectations

Playback-engine MUST emit `playbackError` event (NOT throw exceptions) so I can display error banners gracefully.

Error codes I need to handle:
- `'chunk_missing'` → "Chunk not found. Playback failed."
- `'audio_decode_failed'` → "Audio decode error. Playback failed."
- `'session_not_found'` → "Session not found. Cannot play."

All errors include reason code + optional detail. I display error banner + log to event feed.

### What I Do NOT Need

- I do NOT need session-store writes (I operate read-only on fixture data or sandbox store)
- I do NOT need capture logic (capture-engine's job)
- I do NOT need volume analysis (volume-analyzer's job)
- I do NOT need transcription (transcription-client's job)
- I do NOT need session management (PWA's job; I play whatever session ID is provided)

### Summary of Interfaces

| Interface | Input | Output | Failure Result |
|-----------|-------|--------|----------------|
| `playSession(sessionId)` | sessionId (string) | Playback handle | `{error: 'session_not_found'}` or emits `playbackError` event |
| `playChunk(chunkId)` | chunkId (string) | Playback handle | `{error: 'chunk_not_found'}` or emits `playbackError` event |
| `playSnip(snipId)` | snipId (string) | Playback handle | `{error: 'snip_not_found'}` or emits `playbackError` event |
| `handle.pause()` | None | void | None |
| `handle.resume()` | None | void | None |
| `handle.seek(time)` | time (number) | void | None (clamp to [0, duration] if out of range) |
| `handle.stop()` | None | void | None |

All pre-playback errors returned as structured objects. Runtime errors emitted as `playbackError` events. Fixture mode works without session-store dependency.

## Producer Response

I'm playback-engine. I accept your Isolation Demo customer request. You will operate as my factory floor—proving audio playback (session/chunk/snip) works correctly with fixture chunks (no session-store dependency). I will provide fixture-first interfaces (in-memory blobs) with full playback controls (play, pause, resume, seek, stop). Here's exactly what I will ship in Phase 06:

### Fixture-First Interfaces (In-Memory Blobs)

**`playSession(chunks)` or `playChunks(chunks)`** → Playback handle

Input: `chunks: Array<{seq: number, blob: Blob}>` (fixture chunk array from demo, sorted by seq)

Returns: Playback handle with methods: `pause()`, `resume()`, `seek(time)`, `stop()`, and properties: `duration`, `currentTime`, `state`

Implementation:
- Concatenate MP3 blobs: `new Blob([blob1, blob2, ...], {type: 'audio/mpeg'})`
- Create blob URL: `URL.createObjectURL(concatenatedBlob)`
- Create HTML5 Audio element: `<audio src={blobUrl}>`
- Return handle that controls audio element

**`playChunk(blob)` or `playSingleChunk(blob)`** → Playback handle

Input: `blob` (Blob) single chunk from fixture

Returns: Playback handle (same interface as `playSession`)

Implementation:
- Create blob URL: `URL.createObjectURL(blob)`
- Play single chunk via HTML5 Audio element

### Playback Handle Interface

Handle methods:
- `handle.pause()` → Pause playback, `state` becomes 'paused'
- `handle.resume()` → Resume playback, `state` becomes 'playing'
- `handle.seek(time)` → Seek to time in seconds (clamp to [0, duration] if out of range)
- `handle.stop()` → Stop playback, release resources, `state` becomes 'stopped'

Handle properties (live-updating):
- `handle.duration` (number): Total duration in seconds
- `handle.currentTime` (number): Current playback position in seconds
- `handle.state` (string): 'playing' | 'paused' | 'stopped'

Handle events:
- `handle.on('ended', callback)` → Emitted when playback completes naturally (reached end)
- `handle.on('error', callback)` → Emitted if audio decode fails or playback error

### Error Handling

Pre-playback errors (from function call):
- `{error: 'no_chunks'}` → Empty chunks array
- `{error: 'invalid_blob'}` → Blob is null or not Blob type

Runtime errors (during playback):
- `playbackError` event emitted if HTML5 Audio decode fails or playback stalls
- You display error banner: "Playback failed: audio decode error"

All pre-playback errors returned as structured objects (NOT thrown exceptions).

### What I Will NOT Ship in Phase 06

**Session-store integration in Isolation Demo**: You requested optional "live from session-store" mode. I will NOT ship this in Phase 06 (too complex for Isolation Demo scope). Demo operates with fixture blobs only (no session-store dependency). If you want to test session-store integration, use final PWA.

**Separate `playSessionInMemory()` function**: I will use single interface pattern. You pass chunks array directly to `playSession(chunks)` or `playChunks(chunks)`. I do NOT need to know whether chunks came from fixture, capture-engine in-memory, or session-store—just an array of blobs.

### Spec Status

Spec Status: unresolved (Phase 06 implementation not yet built)

Phase 06 will implement fixture-first playback interfaces, build Isolation Demo with known-good chunks, validate seamless concatenation playback.

(To be filled by Phase 05 producer-response agent for playback-engine)

Playback-engine will respond here: how it will meet the isolation-demo's request, what interfaces it will expose for demo use, what data modes it supports (fixture by default, optionally real store read-only), and how the demo proves the package works independently.
