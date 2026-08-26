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

I'm the Web Whisper PWA. I need playback-engine to provide trustworthy audio playback for sessions, chunks, and snips. Playback is the proof of recording: if users can't play it, they didn't record it. Here's what I need:

### Core Interfaces I Need

**`playSession(sessionId)`**

When I call it: User opens session detail and taps "Play Session" button.

Input: `sessionId` (string) from session list

Output I expect:
- Success: Playback handle object with methods and properties
- Failure: `{error: 'session_not_found', sessionId}` or `{error: 'chunks_missing', sessionId, missingChunkIds}`

Playback handle must provide:
- `pause()` → Pause playback
- `resume()` → Resume from paused position
- `seek(time)` → Jump to specific time in seconds (0 to duration)
- `stop()` → Stop playback, reset to 0:00, release handle
- `state` (readonly property) → Current state: 'playing', 'paused', 'stopped'
- `currentTime` (readonly property) → Current position in seconds (updated in real-time)
- `duration` (readonly property) → Total duration in seconds
- Event subscription: `on(eventName, callback)` and `off(eventName, callback)`

How I use it:
- Store handle in component state
- Subscribe to events to update UI (play/pause button states, time display, progress bar)
- Call methods when user clicks controls
- Call `stop()` in component cleanup if playback still active

**`playChunk(chunkId)`** (developer mode)

When I call it: User clicks "Play" button on chunk row in developer mode chunk list.

Input: `chunkId` (string) from chunk list

Output I expect: Same playback handle interface as `playSession`, or `{error: 'chunk_not_found', chunkId}`

How I use it: Play individual chunks for debugging. User can verify each chunk's audio is correct.

**`playSnip(snipId)`** (session detail, transcription preview)

When I call it: User clicks "Play" button on snip row in session detail, or I preview snip before transcribing.

Input: `snipId` (string) from snip list

Output I expect: Same playback handle interface as `playSession`, or `{error: 'snip_not_found', snipId}` or `{error: 'snip_chunks_missing', snipId, missingChunkIds}`

How I use it: Play individual snips so user can hear what will be transcribed (or what was transcribed).

### Playback Events I Need

**`playing` event**

Payload: `{currentTime: number, duration: number}`

When emitted: Playback starts or resumes

How I use it:
- Update play button → pause icon
- Start time display ticker (update every frame or poll currentTime)
- Start progress bar animation

**`paused` event**

Payload: `{currentTime: number}`

When emitted: Playback pauses

How I use it:
- Update pause button → play/resume icon
- Stop time display ticker
- Freeze progress bar

**`timeupdate` event**

Payload: `{currentTime: number}`

When emitted: Every ~250ms during playback

How I use it:
- Update time display: "5:32 / 12:45"
- Update progress bar scrubber position: `(currentTime / duration) * 100%`

**`seeked` event**

Payload: `{currentTime: number}`

When emitted: Seek operation completes

How I use it:
- Update time display to new position
- Update progress bar scrubber to new position
- Resume playback if was playing before seek

**`ended` event**

Payload: `{}`

When emitted: Playback reaches end of audio

How I use it:
- Reset to idle state: play button visible, pause button hidden
- Reset time display: "0:00 / 12:45" or keep at end "12:45 / 12:45"
- Reset progress bar scrubber to start or end
- Handle is released automatically (I don't need to call `stop()`)

**`stopped` event**

Payload: `{}`

When emitted: `handle.stop()` is called

How I use it:
- Reset to idle state (same as `ended`)
- Handle is released automatically

**`playbackError` event**

Payload: `{reason: string, detail?: any}`

When emitted: HTML5 audio error during playback, chunk missing/unreadable, blob load failure

Reason codes I need to handle:
- `'audio_decode_failed'` → Show error toast "Playback failed: audio decode error"
- `'chunk_missing'` → Show error toast "Playback failed: chunk not found"
- `'chunk_read_failed'` → Show error toast "Playback failed: unable to read audio"

How I use it:
- Show error toast with reason
- Log error to developer console if developer mode enabled
- Stop playback (handle auto-stops on error, I just reset UI)

### Seamless Multi-Chunk Playback Requirement

**Critical**: Sessions with multiple chunks (e.g., 3 chunks: 4.0s, 4.1s, 3.5s) MUST play seamlessly with NO gaps or time skips between chunks.

Expected behavior:
- User clicks "Play Session" → Hears continuous audio from 0:00 to 11.6s
- No audible gap at chunk boundaries (4.0s, 8.1s)
- Seek to 4.0s (chunk boundary) → Audio plays seamlessly from that point
- Seek to 8.1s (chunk boundary) → Audio plays seamlessly from that point

Implementation expectation: Playback-engine uses blob concatenation (`new Blob([blob1, blob2, blob3], {type: 'audio/mpeg'})`) to create single audio stream. HTML5 `<audio>` element plays concatenated blob as one continuous stream.

Alternative (sequential chunk playback with `ended` event chaining) is NOT acceptable because it introduces gaps between chunks.

### Seek Across Chunks Requirement

**Seek must work transparently** across chunk boundaries in multi-chunk sessions.

When I call `handle.seek(480)` (8:00) in a 12-minute session:
- Playback-engine calculates offset into concatenated blob
- HTML5 `<audio>` element `.currentTime` is set to 480
- Audio jumps to 8:00 (which may be in chunk 120 of a long session)
- I do NOT need to know which chunk contains 8:00

Playback-engine handles all chunk offset calculations internally. My seek bar just calls `handle.seek(seconds)` with linear time.

### Error Handling Patterns

**Pre-playback errors** (before audio starts):
- `playSession` returns `{error: 'session_not_found'}` → I show error toast "Session not found. Playback unavailable."
- `playSession` returns `{error: 'chunks_missing', missingChunkIds: []}` → I show error toast "Session has no playable audio."
- `playChunk` returns `{error: 'chunk_not_found'}` → I show error toast "Chunk not found."

I check return value for `error` field. If error exists, I do NOT get a playback handle.

**Runtime errors** (during playback):
- Playback starts successfully (handle returned), then fails
- Playback-engine emits `playbackError` event with reason
- I subscribe to `playbackError`, show error toast, log error
- Playback auto-stops on error (I just reset UI to idle state)

**User navigates away during playback**:
- User plays session, then taps Back button or navigates to Home
- I MUST call `handle.stop()` in component cleanup (React useEffect cleanup, Vue onBeforeUnmount, etc.)
- If I don't call `stop()`, audio continues playing in background and handle leaks (blob URL not revoked, event listeners not removed)

### Handle Lifecycle Management

**When is handle released?**
- Automatically when `ended` event fires (audio reaches end)
- Automatically when `stop()` is called
- Automatically when `playbackError` fires (error auto-stops playback)

**Do I need to call `stop()` before releasing handle reference?**
- YES, if playback is still active (playing or paused) and I'm navigating away or unmounting component
- NO, if playback already ended (handle auto-released on `ended` event)

**Can multiple handles be active simultaneously?**
- Yes, playback-engine allows simultaneous playback (multiple HTML5 audio elements)
- My responsibility: Call `stop()` on previous handle before starting new playback (avoid user confusion of overlapping audio)
- Exception: Developer mode may play chunk + session simultaneously for debugging (acceptable)

### Session-Store Integration Expectations

Playback-engine MUST read from session-store:
- `getSession(sessionId)` → session metadata (duration, chunkCount, etc.)
- `getChunksForSession(sessionId)` → chunk list (metadata only, NO blobs, sorted by seq asc)
- `getChunk(chunkId)` → chunk blob + metadata
- `getSnip(snipId)` → snip metadata (chunkRefs, startTime, endTime)

Playback-engine NEVER writes to session-store (read-only customer).

If session-store reads fail:
- `getSession` returns null → playback-engine returns `{error: 'session_not_found'}` to me
- `getChunk` returns null → playback-engine emits `playbackError('chunk_missing')` or skips chunk and continues
- `getChunksForSession` returns error → playback-engine returns error to me

### Performance Expectations

- `playSession` should start playback within 500ms for typical sessions (< 2 minutes, < 30 chunks)
- `playChunk` should start playback within 100ms (single chunk, small blob)
- Seek should be instantaneous (< 50ms) for HTML5 audio `.currentTime` set

If playback-engine needs to concatenate chunks, it should do so in memory (not write temporary files). Blob concatenation should be fast (< 100ms for 30 chunks).

### What I Do NOT Need

- I do NOT need playback-engine to manage UI state (play/pause button states, progress bar) — I own UI
- I do NOT need playback-engine to read snips or transcripts for display — I read those from session-store myself
- I do NOT need playback-engine to decide which audio to play — I decide (session, chunk, or snip) and call appropriate interface

### Summary of Interfaces

| Interface | Input | Output | Failure Result |
|-----------|-------|--------|----------------|
| `playSession(sessionId)` | sessionId (string) | Playback handle | `{error: 'session_not_found'}` or `{error: 'chunks_missing', missingChunkIds}` |
| `playChunk(chunkId)` | chunkId (string) | Playback handle | `{error: 'chunk_not_found'}` |
| `playSnip(snipId)` | snipId (string) | Playback handle | `{error: 'snip_not_found'}` or `{error: 'snip_chunks_missing', missingChunkIds}` |
| `handle.pause()` | None | void | None (no-op if already stopped) |
| `handle.resume()` | None | void | None (no-op if already stopped) |
| `handle.seek(time)` | time (number, seconds) | void | None (clamp to [0, duration] if out of range) |
| `handle.stop()` | None | void | None (no-op if already stopped, idempotent) |

All pre-playback errors returned as structured objects (NOT thrown exceptions). Runtime errors emitted as `playbackError` event.

## Producer Response

(To be filled by Phase 05 producer-response agent for playback-engine)

Playback-engine will respond here: how it will meet the PWA's request, what interfaces it will provide, what event formats it will emit, how it will implement audio concatenation (blob concatenation vs sequential playback), how it will handle errors, and what playback handle lifecycle management it expects from caller (does caller need to call `stop()` before releasing handle, or is handle auto-released when playback ends).
