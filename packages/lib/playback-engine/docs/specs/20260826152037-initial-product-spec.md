Spec Status: unresolved
Spec Type: initial-product-spec
Created: 2026-08-26T15:20:37Z
Product: packages/lib/playback-engine

# Playback Engine — Product Spec

## Product Type and Data Ownership

This product lives under `packages/lib/`. Library packages own behavior, not durable data.

**Data ownership**: Playback-engine **owns no durable data**. All audio blobs (chunks, snips) and metadata (sessions, chunk durations, snip boundaries) are owned by session-store. Playback-engine is a read-only consumer of session-store data. It loads audio into memory for playback, manages transient playback state (playing/paused, current time), and discards audio when playback ends or the handle is released.

## Product Goal

Provide trustworthy audio playback for sessions, chunks, and snips. Reads MP3 audio from session-store, creates HTML5 audio elements, manages playback state (play, pause, seek, stop), and emits playback events. This is the proof-of-recording job: if you cannot play a session, you did not record it. Playback must feel immediate and durable — no lag between pressing Play and hearing audio, no gaps or time skips in multi-chunk sessions.

## Boundary

- **Owns**: Audio playback (HTML5 `<audio>` element creation and lifecycle management), playback state (playing, paused, stopped, current time, duration), seek operations (jump to specific time in audio), audio concatenation (for multi-chunk sessions or multi-chunk snips; blob concatenation to produce seamless playback), playback handle lifecycle (create on play, release on stop or end), playback events (playing, paused, ended, seeked, timeupdate, error)
- **Does NOT own**: Audio capture (capture-engine does that), volume analysis (volume-analyzer does that), transcription (transcription-client does that), storage authority (session-store owns all audio blobs, chunk metadata, snip metadata, session metadata), playback UI (PWA owns the play/pause/seek buttons, progress bar, time display, volume controls; playback-engine only provides programmatic playback interface and events)

## Main Operations and Interfaces

Every main operation has a concrete input, action, and output.

### 1. Play Session

**Input**: `sessionId` (string, session identifier from session-store)

**Action**: Read all chunk blobs for session from session-store, concatenate into single MP3 blob, create HTML5 `<audio>` element, set blob as audio source, start playback

**Output**: Playback handle object with methods (`pause()`, `resume()`, `seek(time)`, `stop()`) and event emitter

**Caller**: PWA session detail screen (user clicks "Play Session" button)

**Store read**: session-store (reads session metadata for chunk IDs and duration, reads all chunk blobs)

**Store changed**: None (playback is read-only)

**Failure result**: If session not found, return error `{error: 'session_not_found', sessionId}`. If chunks missing or unreadable, return error `{error: 'chunks_missing', sessionId, missingChunkIds}`. If HTML5 audio element fails to load or decode, emit `playbackError` event with reason `'audio_decode_failed'`.

### 2. Play Chunk

**Input**: `chunkId` (string, chunk identifier from session-store)

**Action**: Read single chunk blob from session-store, create HTML5 `<audio>` element, set blob as audio source, start playback

**Output**: Playback handle (same interface as playSession)

**Caller**: PWA developer mode chunk list (user clicks "Play" button on chunk row), or Isolation Demo

**Store read**: session-store (reads single chunk blob)

**Store changed**: None

**Failure result**: If chunk not found, return error `{error: 'chunk_not_found', chunkId}`. If chunk blob unreadable, return error `{error: 'chunk_read_failed', chunkId}`. If HTML5 audio decode fails, emit `playbackError` event.

### 3. Play Snip

**Input**: `snipId` (string, snip identifier from session-store)

**Action**: Read snip metadata from session-store (startTime, endTime, chunk references), read chunk blobs for snip range, concatenate chunks into single MP3 blob, create HTML5 `<audio>` element, set blob as audio source, start playback

**Output**: Playback handle (same interface as playSession)

**Caller**: PWA session detail snip list (user clicks "Play" button on snip row), or transcription flow (PWA may play snip before transcribing to preview)

**Store read**: session-store (reads snip metadata, reads chunk blobs for snip range)

**Store changed**: None

**Failure result**: If snip not found, return error `{error: 'snip_not_found', snipId}`. If snip chunks missing, return error `{error: 'snip_chunks_missing', snipId, missingChunkIds}`. If HTML5 audio decode fails, emit `playbackError` event.

### 4. Pause Playback

**Input**: Playback handle from previous play call

**Action**: Call `.pause()` on HTML5 audio element, update playback state to `paused`, emit `paused` event

**Output**: None (void)

**Failure result**: If handle already stopped or released, no-op (idempotent). If HTML5 audio element missing, log warning and return.

### 5. Resume Playback

**Input**: Playback handle from previous play call

**Action**: Call `.play()` on HTML5 audio element, update playback state to `playing`, emit `playing` event

**Output**: None (void)

**Failure result**: If handle already stopped or released, no-op. If HTML5 audio element missing, log warning and return.

### 6. Seek Playback

**Input**: Playback handle, time (number, in seconds; must be >= 0 and <= duration)

**Action**: Set `.currentTime` property on HTML5 audio element, emit `seeked` event with new time

**Output**: None (void)

**Failure result**: If time out of range, clamp to [0, duration] and log warning. If handle stopped or released, no-op. If HTML5 audio element missing, log warning and return.

### 7. Stop Playback

**Input**: Playback handle

**Action**: Call `.pause()` on HTML5 audio element, reset `.currentTime` to 0, update playback state to `stopped`, emit `stopped` event, release handle (remove event listeners, revoke blob URL if created, delete handle reference)

**Output**: None (void)

**Failure result**: If handle already stopped or released, no-op (idempotent).

## Interface Inventory

| Interface | Caller | Input | Output | Store Read | Store Changed | Failure Result |
|-----------|--------|-------|--------|------------|---------------|----------------|
| `playSession(sessionId)` | PWA session detail | sessionId (string) | Playback handle | session-store (session metadata, all chunk blobs) | None | `{error: 'session_not_found'}` or `{error: 'chunks_missing', missingChunkIds}` or `playbackError` event |
| `playChunk(chunkId)` | PWA developer mode, Isolation Demo | chunkId (string) | Playback handle | session-store (single chunk blob) | None | `{error: 'chunk_not_found'}` or `{error: 'chunk_read_failed'}` or `playbackError` event |
| `playSnip(snipId)` | PWA snip list, transcription flow | snipId (string) | Playback handle | session-store (snip metadata, chunk blobs for snip range) | None | `{error: 'snip_not_found'}` or `{error: 'snip_chunks_missing', missingChunkIds}` or `playbackError` event |
| `handle.pause()` | PWA (user clicks Pause) | None | None (void) | None | None | No-op if already stopped |
| `handle.resume()` | PWA (user clicks Resume) | None | None (void) | None | None | No-op if already stopped |
| `handle.seek(time)` | PWA (user moves seek slider) | time (number, seconds) | None (void) | None | None | Clamp to [0, duration] if out of range |
| `handle.stop()` | PWA (user clicks Stop or navigates away) | None | None (void) | None | None | No-op if already stopped |

**Events emitted by playback handle**:

| Event | Payload | When Emitted | Caller Action |
|-------|---------|--------------|---------------|
| `playing` | `{currentTime: number, duration: number}` | When playback starts or resumes | PWA updates play button to pause icon, starts time display updates |
| `paused` | `{currentTime: number}` | When playback pauses | PWA updates pause button to play icon, freezes time display |
| `timeupdate` | `{currentTime: number}` | Every ~250ms during playback | PWA updates time display and progress bar scrubber position |
| `seeked` | `{currentTime: number}` | When seek operation completes | PWA updates time display to new position |
| `ended` | `{}` | When playback reaches end of audio | PWA resets to idle state (play button enabled, time display 0:00) |
| `stopped` | `{}` | When `handle.stop()` called | PWA resets to idle state |
| `playbackError` | `{reason: string, detail?: any}` | When HTML5 audio error occurs or blob load fails | PWA displays error toast "Playback failed: [reason]" |

## Audio Concatenation Strategy

**Goal**: Multi-chunk sessions and snips must play seamlessly with no gaps or time skips between chunks.

**Strategy**: Use blob concatenation via `new Blob([blob1, blob2, blob3], {type: 'audio/mpeg'})`. This creates a single MP3 blob from multiple chunk blobs, which can be played as a continuous audio stream by a single HTML5 `<audio>` element. MP3 format supports concatenation without re-encoding (MPEG audio frames are self-contained; a concatenated MP3 is valid and playable).

**Alternative rejected**: Sequential playback with `ended` event listener (play chunk 1, wait for `ended`, play chunk 2, etc.). This approach introduces gaps between chunks (event handling delay, browser audio buffer draining) and makes seek operations complex (need to track which chunk is playing and compute offsets). Blob concatenation is simpler and produces seamless playback.

**Seek in concatenated audio**: HTML5 `.currentTime` property works natively on concatenated blobs. The browser decodes the concatenated MP3 and treats it as a single audio stream with total duration = sum of chunk durations. Seeking to any time within [0, totalDuration] works without manual chunk offset calculations.

**Browser compatibility**: Blob concatenation for MP3 is widely supported (Chrome, Firefox, Safari, Edge). MP3 format is chosen for recording (capture-engine) specifically because it is universal and concatenation-friendly. No special handling needed for different browsers.

## HTML5 Audio Element Management

**Strategy**: Create one `<audio>` element per playback handle. Each handle owns its audio element for the lifetime of that playback session. When `stop()` is called or playback ends, the audio element is removed and the handle is released.

**Rationale**: Independent playback instances. If caller plays two different chunks simultaneously (e.g., Isolation Demo plays chunk 0, then before it ends, plays chunk 1), each should have its own audio element and playback state. Reusing a single global audio element would require stopping the first playback when the second starts, which is not the expected behavior.

**Element lifecycle**:
1. On `playSession` / `playChunk` / `playSnip`: Create `<audio>` element, create blob URL via `URL.createObjectURL(blob)`, set `audio.src = blobUrl`, attach event listeners (`play`, `pause`, `ended`, `timeupdate`, `error`), call `audio.play()`, return handle
2. During playback: HTML5 audio element fires events, handle emits events to caller
3. On `stop()` or `ended` event: Call `audio.pause()`, revoke blob URL via `URL.revokeObjectURL(blobUrl)`, remove event listeners, delete audio element reference, mark handle as released
4. Handle released: Subsequent calls to `pause()` / `resume()` / `seek()` / `stop()` are no-ops

**Audio element placement**: Audio elements are created detached (not appended to DOM). HTML5 audio playback does not require DOM attachment. If browser requires DOM attachment for some reason (e.g., iOS Safari quirks), append to a hidden container element (`<div id="playback-engine-audio-container" style="display: none;"></div>`), but default behavior is detached.

## Playback State Tracking

**Playback states**: `idle` (no playback active), `playing` (audio is playing), `paused` (audio paused, can be resumed), `stopped` (audio stopped, cannot be resumed, handle released)

**State transitions**:
- `idle` → `playing`: `playSession` / `playChunk` / `playSnip` called
- `playing` → `paused`: `handle.pause()` called
- `paused` → `playing`: `handle.resume()` called
- `playing` → `stopped`: `handle.stop()` called or `ended` event fires
- `paused` → `stopped`: `handle.stop()` called
- `stopped` → `idle`: Handle released, ready for new playback

**State visible to caller**: Caller can inspect handle state via `handle.state` property (read-only string: `'playing'`, `'paused'`, `'stopped'`). Caller can also infer state from events (`playing` event → state is playing, `paused` event → state is paused, etc.).

**Current time and duration**: `handle.currentTime` (number, in seconds, read-only, updated in real-time during playback) and `handle.duration` (number, in seconds, read-only, set when audio metadata loads). Caller reads these properties to display time (e.g., "5:32 / 12:45").

## Session-Store Integration

**Session-store provides**:
- Session metadata: `{sessionId, chunkIds: [chunkId1, chunkId2, ...], duration, createdAt, ...}`
- Chunk metadata: `{chunkId, sessionId, startTime, endTime, duration, blobSize, ...}`
- Chunk blobs: MP3 audio blobs stored in IndexedDB
- Snip metadata: `{snipId, sessionId, startTime, endTime, chunkRefs: [chunkId1, chunkId2, ...], label, ...}`

**Playback-engine reads**:
1. For `playSession(sessionId)`: Read session metadata to get chunk IDs, read all chunk blobs, concatenate blobs, play
2. For `playChunk(chunkId)`: Read single chunk blob, play
3. For `playSnip(snipId)`: Read snip metadata to get chunk references, read chunk blobs for those chunks, concatenate blobs, play

**Session-store API assumptions** (planning names, not frozen):
- `sessionStore.getSession(sessionId)` → returns `{sessionId, chunkIds, duration, ...}` or null if not found
- `sessionStore.getChunk(chunkId)` → returns `{chunkId, blob, duration, ...}` or null if not found
- `sessionStore.getSnip(snipId)` → returns `{snipId, chunkRefs, startTime, endTime, ...}` or null if not found
- All reads are async (return Promises)

**Error handling**: If session-store read fails (session not found, chunk not found, IndexedDB error), playback-engine returns error object to caller immediately. If blob load fails after playback starts (HTML5 audio element fires `error` event), playback-engine emits `playbackError` event.

## Error Handling

**Error categories**:

1. **Pre-playback errors** (before audio element created): Session/chunk/snip not found, chunks missing, session-store read failure. Return error object to caller: `{error: 'session_not_found', sessionId}`, `{error: 'chunks_missing', sessionId, missingChunkIds}`, etc.

2. **Playback errors** (during playback): HTML5 audio element fails to decode blob, network error (should not happen for local blobs, but possible), audio format unsupported. Emit `playbackError` event with reason: `{reason: 'audio_decode_failed', detail: htmlAudioErrorEvent}`.

3. **Operational errors** (caller misuse): `seek()` called with time out of range, `pause()` called on already-stopped handle. Log warning, clamp or no-op, do not emit error event (fail gracefully).

**Recovery**:
- Pre-playback errors: Caller should display error to user ("Session not found", "Playback unavailable") and allow retry or navigation away.
- Playback errors: Caller should display error toast ("Playback failed: audio decode error"), log to diagnostic console if developer mode enabled, allow retry or stop.
- Operational errors: No user-visible error (fail silently), log warning to browser console for developer debugging.

## Isolation Demo

**Purpose**: The Isolation Demo is the package factory floor. It proves playback-engine works independently, without the PWA. It exercises all main operations (play session, play chunk, play snip, pause, resume, seek, stop) and validates playback events.

**Runtime**: Web app (local dev server, desktop browser viewport, wider factory floor, not phone-shaped)

**Launch command**: `cd packages/lib/playback-engine/isolation-demo && npm start` (or equivalent; exact command depends on project setup, likely Vite or Webpack dev server)

**Data mode**: **Fixture by default** (safe default, no session-store dependency, known audio data for testing). Fixture session: 3 chunks (4.0s, 4.1s, 3.5s), 2 snips (chunks 0–1 = 8.1s, chunks 2–2 = 3.5s). Total session duration: 11.6s. Optionally: "Use Real Sessions" mode (read-only session-store access, sandbox IndexedDB instance with database name `web-whisper-demo-db`, not production `web-whisper-db`).

**Device/viewport**: Desktop browser, wider factory floor (1280px+ width recommended), not phone-shaped (fixture data panel, playback control panel, and event feed panel side-by-side).

**Orientation**: Landscape (desktop browser default), not portrait (phone default).

### Isolation Demo Screens and Data Mode Labels

The demo has **one screen** with **4 panels** (no navigation, no tabs for screens, single-page layout):

1. **Top chrome panel** (fixed header, full width, data mode chip visible)
2. **Fixture data panel** (left third, shows fixture session metadata or real store session selector)
3. **Playback control panel** (center third, play/pause/seek/stop controls, playback target selector)
4. **Event feed panel** (right third, scrollable event log)

**Data mode labels**:
- **Fixture mode** (default, safe): Top chrome displays "FIXTURE MODE (mock audio)" chip (gray border). Fixture data panel shows fixture session info (demo-session-001, 11.6s, 3 chunks, 2 snips). No session-store access. Audio blobs are in-memory fixture MP3s (generated or pre-encoded).
- **Real Sessions mode** (optional, read-only): Top chrome displays "REAL STORE (read-only)" chip (cyan border). Fixture data panel hides fixture info, shows real store session selector dropdown (lists sessions from sandbox IndexedDB `web-whisper-demo-db`). Session-store reads from sandbox database, not production.

**Data mode switch**: Toggle in top chrome ("Enable Real Store" checkbox). When toggled ON → fixture mode exits, real store mode enters. When toggled OFF → real store mode exits, fixture mode re-enters (default).

### Isolation Demo Panel Details

See `isolation-demo/README.md` for full panel-by-panel layout (Top Chrome Panel, Fixture Data Panel, Playback Control Panel, Event Feed Panel).

**Main controls** (Playback Control Panel):
- Playback target selector: Radio buttons "Play Session" (default), "Play Chunk", "Play Snip". Dropdowns for chunk/snip selection when "Play Chunk" or "Play Snip" selected.
- "Play" button (cyan, full-width, enabled when idle)
- "Pause" button (yellow, full-width, enabled when playing)
- "Resume" button (cyan, full-width, enabled when paused)
- "Stop" button (red, full-width, enabled when playing or paused)
- Seek slider (horizontal slider, enabled when playing or paused, range 0 to current target duration)
- Current playback state display: "State: Idle" / "Playing" / "Paused" / "Stopped" (color-coded: gray/green/yellow/red)
- Current time / duration display: "Time: 0.0s / 11.6s" (updates in real-time during playback)

**What changes after main action** (e.g., after Play clicked):
- "Play" button disables (gray)
- "Pause" and "Stop" buttons enable (yellow and red)
- Playback state changes to "Playing" (green)
- Time counter starts updating (e.g., "Time: 1.5s / 11.6s")
- Event feed logs `playing` event (green text, timestamp)
- Audio plays from speakers (user hears fixture audio or real session audio)

**Exact question the screen answers**: "Does playback-engine correctly play sessions, chunks, and snips, and do pause/resume/seek/stop controls work as expected?" The demo answers YES if audio plays seamlessly, events log correctly, and controls respond immediately.

### Fixture Audio Details

**Fixture session**: ID `demo-session-001`, total duration 11.6s, 3 chunks, 2 snips

**Fixture chunks**:
- Chunk 0: ID `demo-chunk-000`, duration 4.0s, startTime 0.0s, endTime 4.0s, blobSize ~32,768 bytes, MP3 audio (tone or speech sample, distinguishable as "first chunk" audio)
- Chunk 1: ID `demo-chunk-001`, duration 4.1s, startTime 4.0s, endTime 8.1s, blobSize ~33,024 bytes, MP3 audio (tone or speech sample, distinguishable as "second chunk" audio)
- Chunk 2: ID `demo-chunk-002`, duration 3.5s, startTime 8.1s, endTime 11.6s, blobSize ~28,160 bytes, MP3 audio (tone or speech sample, distinguishable as "third chunk" audio)

**Fixture snips**:
- Snip 0: ID `demo-snip-000`, label "First snip", chunkRefs [demo-chunk-000, demo-chunk-001], startTime 0.0s, endTime 8.1s, duration 8.1s
- Snip 1: ID `demo-snip-001`, label "Second snip", chunkRefs [demo-chunk-002], startTime 8.1s, endTime 11.6s, duration 3.5s

**Fixture audio generation** (implementation note for Phase 06): Generate 3 MP3 blobs with known durations using Web Audio API (create AudioContext, generate sine wave or noise, encode to MP3 via lamejs or similar encoder) OR use 3 pre-encoded fixture MP3 files bundled with the demo. Pre-encoded files are simpler (no runtime encoding) but increase bundle size (~100KB total). Web Audio API generation is more complex but produces known-good audio at runtime.

## Customer Assumptions

Playback-engine assumes its customers (PWA, Isolation Demo) will:

1. **Manage playback handle lifecycle**: Caller must keep handle reference until playback ends or `stop()` is called. Caller must call `stop()` before releasing handle reference if playback is still active (to avoid memory leaks from unreleased blob URLs and event listeners). If caller navigates away or unmounts component, caller must call `stop()` on all active handles.

2. **Subscribe to playback events**: Caller must subscribe to events (`playing`, `paused`, `timeupdate`, `ended`, `playbackError`) to update UI and handle errors. Playback-engine emits events; caller is responsible for listening and reacting.

3. **Handle errors gracefully**: Caller must handle pre-playback errors (check return value for `{error: ...}`) and playback errors (`playbackError` event). Caller should display errors to user and allow retry or navigation away.

4. **Not call invalid operations**: Caller should not call `pause()` / `resume()` / `seek()` / `stop()` on a stopped or released handle (operations are no-ops, but indicate caller bug). Caller should track playback state and disable UI controls when operations are invalid (e.g., disable Pause button when not playing).

5. **Validate session-store data**: Caller (or session-store) must ensure session/chunk/snip metadata is consistent (chunk IDs exist, snip chunk references are valid, durations are accurate). Playback-engine will fail gracefully if data is inconsistent (return error or emit `playbackError` event), but does not validate data correctness (that is session-store's responsibility).

## Event and Telemetry Expectations

**Events emitted for UI updates**:
- `playing` (when playback starts or resumes): PWA updates play button icon, starts time display ticker
- `paused` (when playback pauses): PWA updates pause button icon, stops time display ticker
- `timeupdate` (every ~250ms during playback): PWA updates time display ("5:32 / 12:45") and progress bar scrubber position
- `seeked` (when seek completes): PWA updates time display to new position
- `ended` (when playback reaches end): PWA resets to idle state (play button, time display "0:00 / 12:45")
- `stopped` (when stop called): PWA resets to idle state

**Events emitted for diagnostics** (developer mode):
- `playbackError` (when HTML5 audio error occurs): PWA logs error to developer console, displays error toast
- All events (playing, paused, seeked, ended, stopped, error) are logged to developer console when developer mode enabled

**Telemetry** (future, not in first implementation):
- Playback start/end times (for session playback analytics)
- Playback errors (for reliability monitoring)
- Seek operations (for UX analysis)
- Not in scope for first implementation; add telemetry hooks later if needed

## Validation Steps

**Phase 06 implementation validation** (before considering package complete):

1. **Fixture mode validation**:
   - Launch Isolation Demo in fixture mode (default)
   - Play session: Click "Play Session", verify audio plays for 11.6s, verify time display updates, verify event feed logs `playing` event
   - Pause: Click "Pause" during playback, verify audio pauses, verify event feed logs `paused` event
   - Resume: Click "Resume", verify audio resumes from paused position, verify event feed logs `playing` event
   - Seek: Move seek slider to 8.0s, verify audio jumps to 8.0s, verify event feed logs `seeked` event
   - Stop: Click "Stop", verify audio stops, time resets to 0.0s, verify event feed logs `stopped` event
   - Play chunk: Select "Play Chunk", select Chunk 1 (4.1s), click "Play", verify audio plays for 4.1s, verify time display shows "0.0s / 4.1s"
   - Play snip: Select "Play Snip", select Snip 0 (8.1s), click "Play", verify audio plays for 8.1s, verify time display shows "0.0s / 8.1s"

2. **Real store read-only mode validation** (if real store mode implemented):
   - Toggle "Enable Real Store" ON
   - Verify top chrome chip changes to "REAL STORE (read-only)" (cyan border)
   - Verify session selector dropdown appears (if sessions exist in sandbox store, they appear in dropdown; if no sessions, "No sessions available" message)
   - If sandbox store has sessions: select a session, click "Play Session", verify audio plays from real session chunks
   - If sandbox store empty: validation skipped (real store mode is optional)

3. **Seamless multi-chunk playback validation**:
   - In fixture mode, play session (3 chunks, 11.6s total)
   - Listen to audio: verify no gaps or time skips between chunks (chunk 0 → chunk 1 transition at 4.0s should be seamless, chunk 1 → chunk 2 transition at 8.1s should be seamless)
   - Seek to 4.0s (chunk boundary): verify audio plays seamlessly from chunk 1 start, no gap
   - Seek to 8.1s (chunk boundary): verify audio plays seamlessly from chunk 2 start, no gap

4. **Error handling validation**:
   - In fixture mode, simulate chunk missing error (mock session-store returns null for chunk): verify playback-engine returns error `{error: 'chunk_not_found', chunkId}`, verify Isolation Demo displays error message
   - In fixture mode, simulate HTML5 audio decode error (provide invalid MP3 blob): verify playback-engine emits `playbackError` event, verify Isolation Demo logs error to event feed

5. **PWA integration validation** (after PWA implements playback UI):
   - In PWA, open a recorded session, click "Play Session", verify audio plays, verify playback controls (pause, resume, seek, stop) work
   - In PWA developer mode, open chunk list, click "Play" on a chunk, verify chunk audio plays
   - In PWA, open snip list, click "Play" on a snip, verify snip audio plays

## First Implementation Checklist

**Phase 06 implementation agent must complete**:

- [ ] Create playback-engine module structure (`src/playback-engine.ts` or similar)
- [ ] Implement `playSession(sessionId)` function: read session chunks from session-store, concatenate blobs, create audio element, return playback handle
- [ ] Implement `playChunk(chunkId)` function: read single chunk from session-store, create audio element, return playback handle
- [ ] Implement `playSnip(snipId)` function: read snip metadata and chunks from session-store, concatenate blobs, create audio element, return playback handle
- [ ] Implement playback handle object: `pause()`, `resume()`, `seek(time)`, `stop()` methods, `state`, `currentTime`, `duration` properties, event emitter (`playing`, `paused`, `timeupdate`, `seeked`, `ended`, `stopped`, `playbackError` events)
- [ ] Implement audio element lifecycle: create on play, attach event listeners, revoke blob URL on stop/end, remove event listeners on stop/end
- [ ] Implement blob concatenation: `new Blob([blob1, blob2, ...], {type: 'audio/mpeg'})` for multi-chunk sessions and snips
- [ ] Implement session-store integration: read session metadata, read chunks, read snips (use session-store API; coordinate with session-store Phase 06 agent for API shape)
- [ ] Implement error handling: pre-playback errors (session not found, chunks missing), playback errors (HTML5 audio decode failure), operational errors (seek out of range)
- [ ] Create Isolation Demo: 4-panel layout (top chrome, fixture data, playback control, event feed), fixture mode by default, optional real store mode
- [ ] Generate or bundle fixture audio: 3 MP3 chunks (4.0s, 4.1s, 3.5s), distinguishable audio (tones or speech samples)
- [ ] Implement Isolation Demo controls: play/pause/resume/stop buttons, seek slider, playback target selector (session/chunk/snip), data mode toggle (fixture/real store)
- [ ] Implement Isolation Demo event feed: log all playback events with timestamps, autoscroll to bottom, color-coded by event type
- [ ] Validate fixture mode: play session, chunk, snip, pause, resume, seek, stop, verify events log correctly
- [ ] Validate seamless multi-chunk playback: play session, listen for gaps at chunk boundaries (should be none), seek to chunk boundaries, verify no gaps
- [ ] (Optional) Validate real store read-only mode: toggle real store ON, select session from sandbox store, play session, verify audio plays from real chunks
- [ ] Write unit tests (if testing infrastructure available): test blob concatenation, test playback handle methods, test error handling
- [ ] Write integration tests (if testing infrastructure available): test session-store reads, test fixture audio generation, test Isolation Demo playback flow
- [ ] Document known issues or limitations in README (e.g., "Real store mode requires sandbox IndexedDB setup", "Fixture audio is synthetic tones, not speech")

## Customer Relationships

Customers of playback-engine:
- `apps/web-whisper-pwa` (see `customers/web-whisper-pwa.md`)
- Isolation Demo (see `customers/00-isolation-demo.md`)

Customer request sections will be filled by Phase 04 customer-request agents. Producer response sections will be filled by Phase 05 producer-response agents.
