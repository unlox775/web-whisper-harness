# Customer: apps/web-whisper-pwa

The Web Whisper PWA is the primary customer of playback-engine. The PWA calls playback-engine to play sessions, chunks, and snips in session detail and developer mode screens.

## Producer's Understanding of This Customer

The Web Whisper PWA is the primary customer of playback-engine. The PWA owns the recording and playback UI, orchestrates the transcription flow, and provides the user-facing experience. Playback-engine provides the programmatic playback interface that the PWA calls to play audio.

### What the PWA Needs from Playback-Engine

**Core playback operations**:

1. **Play sessions** (session detail screen): User clicks "Play Session" button → PWA calls `playSession(sessionId)` → playback-engine reads all chunks from session-store, concatenates them into a single audio blob, starts playback, returns a playback handle → PWA subscribes to playback events to update UI (play button becomes pause button, time display starts updating "0:00 / 12:45", progress bar scrubber starts moving)

2. **Play chunks** (developer mode chunk list): User clicks "Play" button on a chunk row → PWA calls `playChunk(chunkId)` → playback-engine reads single chunk from session-store, starts playback, returns playback handle → PWA updates UI to show "Playing chunk 0 (4.0s)"

3. **Play snips** (session detail snip list or transcription flow): User clicks "Play" button on a snip row → PWA calls `playSnip(snipId)` → playback-engine reads snip chunks from session-store, concatenates them, starts playback, returns playback handle → PWA updates UI. OR: PWA may play a snip before transcribing it (preview before sending to Groq) to allow user to verify the snip is correct speech, not silence or noise.

**Playback control**:

- **Pause**: User clicks Pause button → PWA calls `handle.pause()` → playback-engine pauses audio, emits `paused` event → PWA updates UI (pause button becomes resume button, time display freezes at "5:32 / 12:45")

- **Resume**: User clicks Resume button → PWA calls `handle.resume()` → playback-engine resumes audio from paused position, emits `playing` event → PWA updates UI (resume button becomes pause button, time display resumes updating)

- **Seek**: User drags progress bar scrubber to 8:00 → PWA calls `handle.seek(480)` (480 seconds) → playback-engine jumps to 8:00 in audio, emits `seeked` event → PWA updates time display to "8:00 / 12:45", scrubber position updates

- **Stop**: User clicks Stop button OR navigates away from session detail screen → PWA calls `handle.stop()` → playback-engine stops audio, resets to 0:00, emits `stopped` event, releases handle → PWA updates UI (stop button disables, play button enables, time display resets to "0:00 / 12:45")

**Playback events** (PWA subscribes to these to update UI in real-time):

- `playing(currentTime, duration)`: Audio started or resumed → PWA updates play button to pause icon, starts time display ticker
- `paused(currentTime)`: Audio paused → PWA updates pause button to resume icon, stops time display ticker
- `timeupdate(currentTime)`: Fired every ~250ms during playback → PWA updates time display ("5:32 / 12:45") and progress bar scrubber position
- `seeked(currentTime)`: Seek operation completed → PWA updates time display to new position
- `ended()`: Playback reached end of audio → PWA resets to idle state (play button, time display "0:00 / 12:45"), handle released
- `stopped()`: Stop called → PWA resets to idle state, handle released
- `playbackError(reason, detail)`: HTML5 audio error or chunk missing → PWA displays error toast ("Playback failed: chunk not found") and logs error to developer console if developer mode enabled

**Error handling expectations**:

- **Pre-playback errors**: If `playSession` / `playChunk` / `playSnip` returns an error object (e.g., `{error: 'session_not_found', sessionId}`), PWA should display error to user ("Session not found, playback unavailable") and allow retry or navigation away. This is caller's responsibility; playback-engine returns error synchronously.

- **Playback errors**: If playback starts successfully but then fails during playback (HTML5 audio decode error, blob read failure), playback-engine emits `playbackError` event. PWA should subscribe to this event, display error toast ("Playback failed: audio decode error"), and optionally log to developer console.

- **Handle lifecycle**: PWA must keep handle reference until playback ends or `stop()` is called. PWA must call `stop()` before releasing handle if user navigates away or component unmounts (to avoid memory leaks). If user opens session detail, plays session, then navigates to session list, PWA must call `handle.stop()` in component cleanup.

### What the PWA Provides to Playback-Engine

**Session IDs, chunk IDs, snip IDs**: PWA owns session list, session detail view, and knows which session/chunk/snip user wants to play. PWA passes these IDs to playback-engine. Playback-engine does NOT manage UI state; it only executes playback operations.

**UI controls**: PWA owns play/pause/seek/stop buttons, progress bar, time display, volume controls. Playback-engine does NOT render UI; it only provides programmatic interface and events.

**Event subscriptions**: PWA subscribes to playback events (`playing`, `paused`, `timeupdate`, `seeked`, `ended`, `playbackError`) to update UI. PWA is responsible for unsubscribing when component unmounts to avoid memory leaks.

### Playback State Expectations

**When does playback auto-stop?**

- Playback auto-stops when audio reaches end (HTML5 `ended` event fires → playback-engine emits `ended` event, resets to 0:00, releases handle)
- Playback does NOT auto-stop when user navigates away; PWA must explicitly call `stop()` in that case

**What happens if user navigates away during playback?**

- Audio continues playing in background (HTML5 audio elements play even if component unmounts or page navigates, unless explicitly stopped)
- PWA MUST call `handle.stop()` in component cleanup (e.g., React `useEffect` cleanup, Vue `onBeforeUnmount`) to stop audio and release handle
- If PWA does not call `stop()`, audio continues playing and handle leaks (blob URL not revoked, event listeners not removed)

**Can multiple playback handles be active simultaneously?**

- Yes. If PWA calls `playSession(session1)` and then `playChunk(chunk5)` before session1 playback ends, both will play simultaneously (two HTML5 audio elements, two handles). This is probably not desired behavior for PWA (user confusion), so PWA should call `stop()` on previous handle before starting new playback. But playback-engine allows simultaneous playback (Isolation Demo may need this for testing).

### Audio Concatenation Expectations

**Seamless multi-chunk playback**: When PWA plays a session with multiple chunks (e.g., 3 chunks: 4.0s, 4.1s, 3.5s → total 11.6s), playback must be seamless with NO gaps or time skips between chunks. User should hear continuous audio, not "chunk 0, brief silence, chunk 1, brief silence, chunk 2". Playback-engine uses blob concatenation (`new Blob([blob1, blob2, blob3], {type: 'audio/mpeg'})`) to achieve this. PWA can trust that multi-chunk sessions play as one continuous audio stream.

**Seek in multi-chunk sessions**: When PWA calls `handle.seek(480)` (8:00) in a multi-chunk session, playback-engine computes the offset into the concatenated blob and seeks to that position. PWA does not need to know which chunk contains the 8:00 mark; seek works transparently across chunk boundaries.

### Developer Mode Integration

When developer mode is enabled in Settings, PWA displays additional diagnostic UI:

- **Chunk list**: Per-chunk Play buttons → PWA calls `playChunk(chunkId)` for each
- **Snip list**: Per-snip Play buttons → PWA calls `playSnip(snipId)` for each
- **Event logging**: PWA logs all playback events to developer console (playing, paused, seeked, ended, error) with timestamps and details

Playback-engine does NOT know about developer mode; it provides the same interface and events in all cases. PWA is responsible for conditionally displaying developer UI and logging events.

## Customer Request

(To be filled by Phase 04 customer-request agent for web-whisper-pwa → playback-engine)

The PWA customer will write its request here: exact interfaces it needs (`playSession`, `playChunk`, `playSnip`, playback handle methods, events), error handling expectations (what errors are possible, how to recover), playback state expectations (when does playback auto-stop, what happens if user navigates away), audio concatenation expectations (seamless multi-chunk playback, no gaps).

## Producer Response

(To be filled by Phase 05 producer-response agent for playback-engine)

Playback-engine will respond here: how it will meet the PWA's request, what interfaces it will provide, what event formats it will emit, how it will implement audio concatenation (blob concatenation vs sequential playback), how it will handle errors, and what playback handle lifecycle management it expects from caller (does caller need to call `stop()` before releasing handle, or is handle auto-released when playback ends).
