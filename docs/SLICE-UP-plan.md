# Web Whisper Slice-Up Plan

This document proposes alternative product-boundary philosophies for rebuilding Web Whisper. Each alternative is a different way to slice the founder vision into independently valuable, testable products.

**Status**: Alternatives proposed. No selection made yet. Human chooses before Phase 02.

---

## Project Lexicon

These names come from the founder vision and describe the literal domain. Use them in planning; they are not frozen APIs.

- **Session** — one start-to-stop recording the user can list and open
- **Chunk** — a durable ~4s (or remainder) MP3 piece of a session, persisted immediately
- **Volume profile** — how loud a chunk was over time; feeds snips and the histogram
- **Snip** — a proposed speech segment, playable, optionally transcribed
- **Transcript** — Groq Whisper text attached to a snip or rolled up for a session
- **Capture** — the live microphone-to-chunks job
- **Playback** — hear a session, chunk, or snip
- **Doctor** — explicit diagnostic pass over a stored session (not the default UI)

---

## Plain-Language Job Map

In the order a person would explain them:

1. **Start recording** — tap Start, acquire microphone, begin PCM capture
2. **Encode and persist chunks** — every ~4s, encode PCM to MP3 chunk and write to durable storage immediately
3. **Stop recording** — tap Stop, flush remainder, reconcile session, mark ready or honestly report no audio
4. **List sessions** — show recorded sessions as cards with duration, timestamp, playback affordance
5. **Play a session** — open session, play the whole recording from its chunks
6. **Analyze volume** — compute volume profiles from chunks to identify quiet regions
7. **Propose snips** — use volume profiles to suggest speech segments with boundaries
8. **Validate Groq key** — check Settings API key, show transcription enabled/disabled
9. **Transcribe snips** — send snip audio to Groq Whisper, receive text, attach to snip
10. **Copy transcript** — make transcript text easy to copy (clipboard-first is next product step)
11. **Manage storage** — enforce retention policy and storage cap so device doesn't fill forever
12. **Diagnose capture** — developer mode: show chunk count, buffer size, volume histogram, per-chunk decode, doctor JSON

Example input/output for key jobs:

- **Encode and persist chunks**: Input = PCM samples (Float32Array), Output = MP3 chunk blob + chunk metadata written to IndexedDB
- **Analyze volume**: Input = chunk MP3 blob, Output = volume profile array (samples over time)
- **Propose snips**: Input = array of volume profiles for session, Output = array of snip boundaries (startTime, endTime, chunkRefs)
- **Transcribe snips**: Input = snip audio blob (concatenated chunks), Output = transcript text string from Groq API
- **Play a session**: Input = session ID, Output = audio playback from reassembled chunks

---

## Alternative A: Pipeline-Stage Slicing

**Principle**: Slice by the sequential data-transformation pipeline stages. Each package owns one major transform or storage responsibility.

### Package Count

- **1 app**: `apps/web-whisper-pwa`
- **4 lib packages**: `packages/lib/capture-engine`, `packages/lib/volume-analyzer`, `packages/lib/transcription-client`, `packages/lib/playback-engine`
- **1 datastore package**: `packages/datastore/session-store`
- **0 UI packages**: (UI stays in the app; no substantial independently valuable UI system selected)

**Total: 6 packages → 6 Phase 03 agents**

---

### packages/lib/capture-engine

**Boundary**: Owns the microphone-to-durable-chunk pipeline. Acquires mic, captures PCM, encodes MP3 chunks every ~4s, and writes them immediately to the session store. Stops on command or timeout. Does NOT analyze volume, propose snips, or manage playback.

**Main callable interfaces** (planning names):

- `startCapture(sessionId)` → returns capture handle
  - Input: new session ID from caller
  - Output: capture handle with `stop()` method
  - Caller: PWA app start-recording flow
  - Store changed: session-store (creates session, writes chunks as they encode)

- `stopCapture(handle)` → returns completion summary
  - Input: capture handle
  - Output: `{chunksWritten, totalDuration, hasAudio: boolean}`
  - Caller: PWA app stop-recording flow
  - Store changed: session-store (flushes final chunk, marks session complete)

- Events emitted: `chunkEncoded(sessionId, chunkId, duration)`, `captureError(sessionId, reason)`

**Isolation Demo**:

- **Runtime**: Web app (local dev server)
- **Device**: iPhone simulator / responsive mobile viewport
- **Launch**: `cd packages/lib/capture-engine/isolation-demo && npm start`
- **Screens**:
  - Main: "Start Capture" button, live chunk count, buffer size meter, total duration
  - Chunk list: shows each encoded chunk ID, duration, size, timestamp
  - Controls: Start, Stop, Reset (clears in-memory state), microphone permission status
- **Data mode**: Real write (creates test sessions in real session-store, clearly labeled as demo data)
- **Safe default**: Real write with demo-session prefix
- **Inputs**: Live microphone (requests permission), or simulated PCM stream toggle
- **Internal state**: capture active/idle, PCM buffer size, chunks encoded count, watchdog timer status
- **Outputs**: MP3 chunk blobs written to session-store, chunk metadata
- **External events**: `chunkEncoded`, `captureError` events logged to event feed panel
- **Internal telemetry**: PCM callback timing, encode duration, write timing, watchdog checks
- **Walkthrough value**: Proves that capture starts, encodes chunks every ~4s, persists them immediately, and stops cleanly or times out if mic is silent

**Secondary tools**: Developer panel disclosure showing raw PCM buffer snapshots, encode queue depth, IndexedDB write confirmations

---

### packages/lib/volume-analyzer

**Boundary**: Computes volume profiles from audio chunks and proposes snip boundaries based on quiet regions. Does NOT capture audio, play audio, or transcribe. Reads chunks from session-store.

**Main callable interfaces**:

- `analyzeChunk(chunkBlob)` → returns volume profile
  - Input: MP3 chunk blob
  - Output: `{chunkId, volumeSamples: Float32Array, maxVolume, avgVolume}`
  - Caller: PWA post-recording flow, or batch analysis
  - Store read: none (operates on blob)
  - Store changed: session-store (writes volume profile for chunk)

- `proposeSnips(sessionId)` → returns snip proposals
  - Input: session ID
  - Output: `[{startTime, endTime, chunkRefs, confidence}]`
  - Caller: PWA post-recording snip generation, or Doctor
  - Store read: session-store (reads all volume profiles for session)
  - Store changed: session-store (writes snip records)

- Events emitted: `volumeProfileReady(sessionId, chunkId)`, `snipsProposed(sessionId, snipCount)`

**Isolation Demo**:

- **Runtime**: Web app (local dev server)
- **Device**: iPhone simulator / responsive mobile viewport
- **Launch**: `cd packages/lib/volume-analyzer/isolation-demo && npm start`
- **Screens**:
  - Main: Upload or select chunk from fixture list, "Analyze Chunk" button, volume waveform visualization
  - Session-level: Select session from session-store, "Propose Snips" button, histogram with snip boundaries overlaid
  - Controls: Analyze single chunk, analyze all chunks for session, propose snips, adjust snip threshold slider
- **Data mode**: Fixture by default (pre-recorded test chunks), with "Use Real Sessions" toggle for read-only session-store access
- **Safe default**: Fixture mode
- **Inputs**: Fixture MP3 chunks, or sessions from real session-store (read-only in demo)
- **Internal state**: current chunk analysis progress, snip threshold setting, snip proposal algorithm parameters
- **Outputs**: Volume profile arrays, snip boundary proposals (visualized, not written in fixture mode)
- **External events**: `volumeProfileReady`, `snipsProposed` events in event feed
- **Internal telemetry**: Decode timing, volume computation timing, snip boundary algorithm decisions (why each cut was made)
- **Walkthrough value**: Proves that volume analysis extracts meaningful profiles, identifies quiet regions accurately, and proposes sensible snip boundaries; allows adjusting threshold to see impact

**Secondary tools**: Raw volume profile data inspector (JSON view), per-chunk decode verification, algorithm parameter tweaks

---

### packages/lib/transcription-client

**Boundary**: Sends audio to Groq Whisper API and returns transcript text. Validates API key. Does NOT decide which audio to transcribe, manage sessions, or propose snips. Receives audio blobs (snips), returns text.

**Main callable interfaces**:

- `validateKey(apiKey)` → returns validation result
  - Input: Groq API key string
  - Output: `{valid: boolean, errorMessage?: string}`
  - Caller: PWA Settings screen
  - Store read/changed: none (network call only)

- `transcribeAudio(audioBlob, apiKey)` → returns transcript
  - Input: audio blob (MP3), Groq API key
  - Output: `{text: string, language?: string, duration: number}`
  - Caller: PWA transcription flow, or batch transcription controller
  - Store read/changed: none (network call only; caller writes transcript to session-store)

- Events emitted: `transcriptionStarted(snipId)`, `transcriptionComplete(snipId, text)`, `transcriptionFailed(snipId, reason)`

**Isolation Demo**:

- **Runtime**: Web app (local dev server)
- **Device**: iPhone simulator / responsive mobile viewport
- **Launch**: `cd packages/lib/transcription-client/isolation-demo && npm start`
- **Screens**:
  - Main: API key input field, "Validate Key" button, validation status indicator (green enabled / red disabled)
  - Transcription panel: Upload audio file or select fixture, "Transcribe" button, transcript output text box, timing info
  - Batch queue: List of pending transcription jobs with status (queued, in-progress, complete, failed)
- **Data mode**: Fixture audio files by default, with "Use Real Snips" toggle for read-only session-store snip blobs
- **Safe default**: Fixture mode with example Groq test key
- **Inputs**: Fixture audio blobs (sample speech clips), or snip blobs from real session-store (read-only), API key from user
- **Internal state**: API key validation status, active transcription requests (with abort capability), retry count
- **Outputs**: Transcript text strings, timing/duration metadata
- **External events**: `transcriptionStarted`, `transcriptionComplete`, `transcriptionFailed` events in event feed
- **Internal telemetry**: API request timing, retry attempts, rate limit encounters, Groq response metadata
- **Walkthrough value**: Proves that key validation works correctly (accepts valid keys, rejects invalid), transcription returns accurate text for sample audio, and errors are reported clearly (network failure, invalid key, API error)

**Secondary tools**: Raw API response inspector (JSON view), network timing waterfall, simulated failure toggle (test error handling)

---

### packages/lib/playback-engine

**Boundary**: Plays audio from sessions, chunks, or snips. Reads audio blobs from session-store, reassembles them if needed, and provides playback controls. Does NOT capture, encode, analyze, or transcribe.

**Main callable interfaces**:

- `playSession(sessionId)` → returns playback controller
  - Input: session ID
  - Output: playback controller object with `play()`, `pause()`, `seek(time)`, `stop()`, `currentTime`, `duration`
  - Caller: PWA session detail view
  - Store read: session-store (reads all chunks for session, reassembles into playable blob or sequence)

- `playChunk(chunkId)` → returns playback controller
  - Input: chunk ID
  - Output: playback controller (same interface)
  - Caller: PWA developer mode chunk list, or Isolation Demos
  - Store read: session-store (reads single chunk blob)

- `playSnip(snipId)` → returns playback controller
  - Input: snip ID
  - Output: playback controller (same interface)
  - Caller: PWA snip list, transcription view
  - Store read: session-store (reads chunk blobs for snip range, reassembles)

- Events emitted: `playbackStarted(itemType, itemId)`, `playbackEnded(itemType, itemId)`, `playbackError(itemType, itemId, reason)`

**Isolation Demo**:

- **Runtime**: Web app (local dev server)
- **Device**: iPhone simulator / responsive mobile viewport
- **Launch**: `cd packages/lib/playback-engine/isolation-demo && npm start`
- **Screens**:
  - Main: Select item type (session, chunk, snip), select item from list, standard playback controls (play, pause, seek bar, current time, duration)
  - Queue panel: List of playback history, currently playing indicator
  - Waveform: Optional waveform visualization during playback
- **Data mode**: Fixture audio blobs by default, with "Use Real Sessions" toggle for read-only session-store access
- **Safe default**: Fixture mode with pre-recorded sample sessions
- **Inputs**: Fixture session/chunk/snip blobs, or real session-store items (read-only)
- **Internal state**: playback state (idle, playing, paused), current position, loaded audio buffer, error state
- **Outputs**: Audio playback to device speakers/headphones
- **External events**: `playbackStarted`, `playbackEnded`, `playbackError` events in event feed
- **Internal telemetry**: Chunk reassembly timing, audio buffer loading, seek operations, playback errors
- **Walkthrough value**: Proves that playback works for sessions (reassembles chunks correctly), individual chunks, and snips; seek and pause work; playback accurately reflects duration from chunk metadata

**Secondary tools**: Audio buffer inspector (shows loaded chunks, byte ranges, gaps if any), playback quality metrics

---

### packages/datastore/session-store

**Boundary**: The durable authority for sessions, chunks, volume profiles, snips, and transcripts. Owns the IndexedDB schema, retention policy, storage cap enforcement, and all read/write operations. Other packages call this store's interfaces; they do NOT write directly to IndexedDB.

**Main callable interfaces**:

- `createSession(metadata)` → returns session ID
  - Input: `{timestamp, deviceInfo?}`
  - Output: new session ID (string)
  - Caller: capture-engine at start
  - Store changed: session-store (creates session record)

- `writeChunk(sessionId, chunkBlob, metadata)` → returns chunk ID
  - Input: session ID, chunk MP3 blob, `{duration, startTime, byteSize}`
  - Output: chunk ID (string)
  - Caller: capture-engine during recording
  - Store changed: session-store (writes chunk blob + metadata)

- `getSession(sessionId)` → returns session record
  - Input: session ID
  - Output: `{id, timestamp, duration, chunkCount, status, snipCount?, transcriptStatus?}`
  - Caller: PWA session list, playback-engine, volume-analyzer
  - Store read: session-store

- `listSessions(options?)` → returns session list
  - Input: `{limit?, offset?, sortBy?}`
  - Output: array of session records (sorted by timestamp desc by default)
  - Caller: PWA home screen session list
  - Store read: session-store

- `getChunksForSession(sessionId)` → returns chunk array
  - Input: session ID
  - Output: `[{id, blob, startTime, duration}]`
  - Caller: playback-engine, volume-analyzer
  - Store read: session-store

- `writeVolumeProfile(chunkId, volumeData)` → returns success
  - Input: chunk ID, volume profile array
  - Output: boolean success
  - Caller: volume-analyzer
  - Store changed: session-store (writes volume profile for chunk)

- `writeSnip(sessionId, snipMetadata)` → returns snip ID
  - Input: session ID, `{startTime, endTime, chunkRefs, confidence?}`
  - Output: snip ID
  - Caller: volume-analyzer, PWA snip management
  - Store changed: session-store (creates snip record)

- `writeTranscript(snipId, transcriptText)` → returns success
  - Input: snip ID, transcript text string
  - Output: boolean success
  - Caller: PWA transcription flow (after calling transcription-client)
  - Store changed: session-store (attaches transcript to snip)

- `enforceRetentionPolicy()` → returns cleanup summary
  - Input: none (reads storage cap from settings)
  - Output: `{sessionsDeleted, bytesFreed}`
  - Caller: PWA background task, or manual cleanup in Settings
  - Store changed: session-store (deletes old sessions when cap exceeded)

- Events emitted: `sessionCreated(sessionId)`, `chunkWritten(sessionId, chunkId)`, `snipCreated(sessionId, snipId)`, `transcriptWritten(snipId)`, `retentionPolicyEnforced(summary)`

**Isolation Demo** (Store Inspector):

- **Runtime**: Web app (local dev server)
- **Device**: iPhone simulator / responsive mobile viewport
- **Launch**: `cd packages/datastore/session-store/isolation-demo && npm start`
- **Screens**:
  - Sessions tab: Paginated list of all sessions with metadata (timestamp, duration, chunk count, snip count, transcript status), "View Details" button
  - Session detail: Chunks list (ID, startTime, duration, byteSize, has volume profile?), Snips list (ID, startTime, endTime, has transcript?), raw JSON inspector
  - Chunks tab: All chunks across sessions, filterable by session, playback link (uses playback-engine fixture or read-only mode)
  - Snips tab: All snips, filterable by session, transcript preview, playback link
  - Storage tab: Total storage used, session count, chunk count, storage cap setting, "Enforce Retention Policy" button (shows what would be deleted), "Clear All Demo Data" button
  - Query panel: Ad-hoc queries (get session, list chunks for session, etc.) with JSON response
- **Data mode**: Real read-only by default (shows actual IndexedDB data without mutations), with "Enable Writes (Sandbox)" toggle that allows write operations but clearly labels them as sandbox/test
- **Safe default**: Real read-only
- **Inputs**: None for read-only; in write mode: manually create test sessions/chunks, or import fixture data
- **Internal state**: Current IndexedDB state (session/chunk/snip/volume profile/transcript counts), query history
- **Outputs**: Store data displayed as tables and JSON, retention policy simulation results
- **External events**: (Store does not emit external events directly; other packages do when calling store interfaces) Event feed shows write operations (session created, chunk written, etc.) in sandbox write mode
- **Internal telemetry**: IndexedDB transaction timing, storage quota warnings, retention policy enforcement logs
- **Walkthrough value**: Proves that all store interfaces work (create session, write chunk, write volume profile, write snip, write transcript), data relationships are correct (chunks belong to sessions, snips reference chunks, transcripts attach to snips), retention policy enforcement deletes old data correctly, storage cap is respected

**Secondary tools**: IndexedDB schema inspector (tables, indexes, record counts), export/import fixture data (JSON), clear all data button (with confirmation), storage quota display

---

### apps/web-whisper-pwa

**Boundary**: The user-facing Progressive Web App for iPhone. Owns navigation, UI screens (home, session list, session detail, settings, developer mode), platform permissions (microphone), settings persistence, and orchestration of the lib packages and session-store. Does NOT implement capture, volume analysis, transcription, or playback logic; it calls the lib packages for those jobs.

**Normal product screens**:

1. **Home / Session List** — Shows session cards (timestamp, duration, playback button), "Start Recording" FAB, navigation to Settings
   - Data: sessions from `session-store.listSessions()`
   - Main action: Tap "Start Recording" → calls `capture-engine.startCapture()`

2. **Recording (active)** — Large Stop button, live duration counter, chunk count (if developer mode), buffer size meter (if developer mode)
   - Data: capture-engine state via event feed (`chunkEncoded` events)
   - Main action: Tap "Stop" → calls `capture-engine.stopCapture()`, then navigates to session detail or back to session list

3. **Session Detail** — Session metadata, "Play Session" button, playback controls (when playing), snip list (if snips exist), "Transcribe" button (if Groq key valid and snips not yet transcribed), transcript text display (copy button)
   - Data: session from `session-store.getSession()`, snips from session-store, transcripts from session-store
   - Playback: calls `playback-engine.playSession()`
   - Transcription: calls `volume-analyzer.proposeSnips()` if needed, then for each snip calls `transcription-client.transcribeAudio()` and `session-store.writeTranscript()`
   - Main action: Play, transcribe, copy transcript, delete session

4. **Settings** — Groq API key input (with validation via `transcription-client.validateKey()`), transcription status indicator (enabled/disabled), storage cap slider, "Developer Mode" toggle, "Clear Old Sessions" button (manual retention enforcement)
   - Data: settings from localStorage or IndexedDB settings table
   - Validation: calls `transcription-client.validateKey()` on blur or button tap
   - Main action: Save settings, validate key, toggle developer mode

5. **Developer Mode Panels** (conditional, shown when developer mode enabled):
   - **Chunk List** (session detail): Shows all chunks for session with ID, duration, byteSize, "Play Chunk" button (calls `playback-engine.playChunk()`)
   - **Snip List** (session detail): Shows all snips with boundaries, confidence, "Play Snip" button (calls `playback-engine.playSnip()`)
   - **Volume Histogram** (session detail): Visualizes volume profiles across session timeline, overlays snip boundaries
   - **Doctor Panel** (session detail): "Run Doctor" button → performs coverage check (all chunks present? any gaps?), range access validation, per-chunk decode test (via volume-analyzer or playback-engine), snip scan, exports JSON report with findings
   - **Console** (separate screen from Settings): IndexedDB table inspector (shows sessions, chunks, snips, volume profiles, transcripts), per-session structured logs (if logging implemented)

**Data mode**: Real write. The PWA always operates on the real session-store and live microphone. Developer mode does not change data mode; it exposes additional diagnostic surfaces on the same real data.

**Isolation Demo**: N/A. The PWA is an app, not a package. Apps are already directly runnable and do not automatically need a separate Isolation Demo. The app itself is the product surface the founder walks.

**Secondary tools**: All developer mode panels are secondary. They must not substitute for the main jobs (record, list, play, transcribe). A founder walking the default app (developer mode off) should never have to read a log line to record a meeting.

---

## Alternative A: Data Walkthrough

**Concrete example**: User records a 2-minute lecture.

1. User opens PWA home screen, taps "Start Recording"
2. **PWA** calls `capture-engine.startCapture(sessionId)` (new session ID generated via `session-store.createSession()`)
3. **capture-engine** acquires microphone, begins PCM capture
4. Every ~4s:
   - **capture-engine** encodes PCM buffer to MP3 chunk blob
   - **capture-engine** calls `session-store.writeChunk(sessionId, chunkBlob, metadata)`
   - **session-store** writes chunk blob and metadata to IndexedDB
   - **capture-engine** emits `chunkEncoded(sessionId, chunkId)` event
   - **PWA** receives event, updates chunk count display (if developer mode)
5. At ~2 minutes, user taps "Stop"
6. **PWA** calls `capture-engine.stopCapture(handle)`
7. **capture-engine** flushes final PCM buffer (encodes remainder < 4s), writes final chunk, emits `chunkEncoded` event, returns `{chunksWritten: 30, totalDuration: 120.5, hasAudio: true}`
8. **PWA** navigates to session detail screen
9. User taps "Play Session"
10. **PWA** calls `playback-engine.playSession(sessionId)`
11. **playback-engine** calls `session-store.getChunksForSession(sessionId)`, receives array of 30 chunks
12. **playback-engine** reassembles chunks into playable audio (blob URL or sequence), returns playback controller
13. **PWA** renders playback controls (play/pause/seek), audio plays through device speakers
14. User hears the lecture. Playback proves the recording exists.
15. User taps "Transcribe" (Groq key already validated in Settings)
16. **PWA** calls `volume-analyzer.proposeSnips(sessionId)`
17. **volume-analyzer** calls `session-store.getChunksForSession(sessionId)`, analyzes each chunk via `analyzeChunk()`, computes volume profiles, writes them via `session-store.writeVolumeProfile()`, proposes snips based on quiet regions, writes snips via `session-store.writeSnip()`, emits `snipsProposed(sessionId, 8)` event, returns snip array
18. **PWA** receives 8 snips. For each snip:
    - **PWA** calls `session-store.getChunksForSession()` with snip's chunk refs, concatenates chunk blobs into snip audio blob
    - **PWA** calls `transcription-client.transcribeAudio(snipAudioBlob, apiKey)`
    - **transcription-client** sends audio to Groq API, waits for response, emits `transcriptionComplete(snipId, text)`, returns transcript
    - **PWA** calls `session-store.writeTranscript(snipId, text)`
19. After all 8 snips transcribed, **PWA** displays full session transcript (concatenated snip transcripts), with "Copy" button
20. User taps "Copy", transcript text is copied to clipboard
21. User closes PWA. Session, chunks, volume profiles, snips, and transcripts remain durable in IndexedDB.

**Failure case**: iOS mic ghost (mic granted but no PCM callbacks)

1. User taps "Start Recording"
2. **capture-engine** acquires microphone, starts watchdog timer (e.g., 10s), begins PCM capture
3. No PCM callbacks arrive (iOS issue)
4. Watchdog timer expires (no chunks encoded after 10s)
5. **capture-engine** emits `captureError(sessionId, "no_audio_received")`, stops capture, returns `{chunksWritten: 0, totalDuration: 0, hasAudio: false}`
6. **PWA** shows "Recording completed without playable audio" message (NOT "transcription failed"), offers "Delete Session" button
7. If developer mode enabled, **PWA** logs show: "Microphone acquired, PCM capture started, no callbacks received for 10s, capture stopped by watchdog"
8. Founder can see the diagnosis without the failure being papered over

---

## Alternative A: User Walkthrough

**Starting state**: iPhone with PWA installed (added to home screen), Groq API key already validated in Settings.

1. **Open PWA** from home screen → shows session list (empty or previous sessions)
2. **Tap "Start Recording"** → recording screen appears, duration counter starts (0:00, 0:01, 0:02...), if developer mode on: chunk count increments every ~4s (1, 2, 3...)
3. **Speak for 30 seconds** → duration counter reaches 0:30, chunk count is ~7
4. **Tap "Stop"** → recording stops, PWA navigates to session detail screen for new session
5. **Session detail shows**: Timestamp (just now), duration (0:30), "Play Session" button, "Transcribe" button (enabled because Groq key is valid)
6. **Tap "Play Session"** → playback controls appear (play button becomes pause, seek bar is enabled), audio plays back the recorded 30 seconds
7. **Hear the recording** → proves the recording exists and is durable
8. **Tap "Transcribe"** → PWA shows "Analyzing volume..." then "Transcribing..." progress indicators
9. **Wait 5-10 seconds** → transcript text appears below session metadata, organized by snip (or concatenated), with "Copy" button
10. **Read transcript** → confirms transcription is accurate
11. **Tap "Copy"** → transcript copied to clipboard, confirmation toast appears
12. **Navigate back to session list** → new session card is visible with timestamp, duration (0:30), play button
13. **Tap play button on session card** → inline playback starts (or opens session detail and plays)
14. **Navigate to Settings** → Groq API key is shown (masked), transcription status is "Enabled" (green indicator), storage cap slider, developer mode toggle (off by default)
15. **Toggle developer mode on** → navigate back to session detail
16. **Session detail now shows additional panels**: Chunk list (7 chunks with IDs, durations, play buttons), Snip list (snips with boundaries, play buttons), Volume Histogram (waveform with snip boundaries), Doctor button
17. **Tap "Doctor"** → Doctor runs coverage check, range access check, per-chunk decode test, snip scan, shows JSON report or summary ("All chunks present, no gaps, all chunks decode successfully, 3 snips found, coverage 100%")
18. **Navigate to Settings → Console (developer mode)** → shows IndexedDB tables (sessions table: 1 session, chunks table: 7 chunks, snips table: 3 snips, transcripts table: 3 transcripts), can inspect raw data
19. **Close PWA** → all data remains durable, session can be played again later

**Extension story (second session)**:

1. **Open PWA** → session list now shows 1 session (the 30s recording from before)
2. **Tap "Start Recording"** again → new session begins
3. **Record for 5 minutes** → chunk count reaches ~75 (if developer mode on)
4. **Tap "Stop"** → new session is in session list
5. **Session list now shows 2 sessions** (sorted newest first)
6. **Both sessions are playable and transcribable independently**

---

## Alternative A: Finished Picture

**When this is built, this is what you get:**

You have an iPhone PWA that feels like a tape recorder, with durable chunk-based recording, playback proof, and optional transcription.

**Starting data**: No prior sessions. Groq API key entered in Settings (validated, shows "Transcription Enabled").

**First useful version works**:

1. Open the installed PWA (from iPhone home screen, not Safari tab)
2. Default screen is the session list (empty or showing prior sessions, sorted newest first)
3. Tap the "Start Recording" FAB (floating action button, prominent, bottom-right)
4. Microphone permission prompt appears (iOS PWA re-prompts after cold start; this is expected platform behavior, not a product failure)
5. Grant permission → recording screen appears with live duration counter (0:00, 0:01, 0:02...) and a large "Stop" button
6. If developer mode is enabled in Settings: chunk count also visible (1, 2, 3... incrementing every ~4s)
7. Speak into the phone for 1-2 minutes
8. Tap "Stop" → recording stops, PWA shows the new session card in the session list (or navigates to session detail)
9. Session card shows: timestamp (e.g., "Just now" or "2 minutes ago"), duration (e.g., "1:42"), play button
10. Tap play button → audio plays back the recording (proves it exists)
11. If transcription is enabled (Groq key valid): session detail screen shows "Transcribe" button
12. Tap "Transcribe" → volume analysis runs (snips are proposed based on quiet regions), then each snip is sent to Groq Whisper
13. Wait 10-30 seconds (depending on session length and snip count)
14. Transcript text appears, organized by snip or concatenated for the session, with "Copy" button
15. Tap "Copy" → transcript is copied to clipboard (iOS paste will work immediately)
16. Navigate back to session list → first session is durable and replayable anytime

**Packages involved (under the hood, not visible in UI chrome)**:

- **apps/web-whisper-pwa**: All user-facing screens, navigation, settings, orchestration
- **packages/lib/capture-engine**: Microphone capture → PCM → encode MP3 chunks → write to session-store immediately
- **packages/lib/playback-engine**: Reassemble chunks and play audio for sessions, chunks, snips
- **packages/lib/volume-analyzer**: Compute volume profiles from chunks, propose snip boundaries based on quiet regions
- **packages/lib/transcription-client**: Send snip audio to Groq Whisper API, return transcript text
- **packages/datastore/session-store**: Durable IndexedDB authority for sessions, chunks, volume profiles, snips, transcripts; retention policy enforcement

**AI-assisted judgment**: Volume-based snip proposal is algorithmic (not AI); it identifies quiet regions to suggest speech segments. Groq Whisper transcription is AI, but treated as a third-party service (like a spell-checker): it receives audio, returns text, no local validation. If Groq returns nonsense, the transcript is nonsense (this is a "transcription quality" issue, not a "capture failure"). The PWA does not pretend a missing API key is a failed transcript; without a key, the app is still a working recorder.

**Extension (second session after first works)**:

1. Open PWA → session list shows the first session
2. Tap "Start Recording" again → new session begins (same flow as before)
3. Record for 5 minutes
4. Tap "Stop" → second session is in the list (sorted newest first)
5. Both sessions are independently playable and transcribable
6. If storage cap is reached (e.g., default 500 MB): navigate to Settings, tap "Clear Old Sessions" → retention policy runs, deletes oldest sessions until under cap, shows summary ("3 sessions deleted, 150 MB freed")
7. Or, retention policy runs automatically in background after each recording stop (product decision TBD in Phase 02)

**Visible end state**: A durable local catalog of recorded sessions (as many as storage cap allows), each with playback, snips, and transcripts (if Groq key present). No cloud upload. No cross-device sync. The product promise is local durability and trustworthy capture on one device.

**Developer mode (secondary, not required for the main job)**:

- Toggle developer mode in Settings → session detail screens now show chunk lists, snip lists, volume histograms, Doctor button
- Doctor performs diagnostic pass: coverage check (all chunks present? gaps?), per-chunk decode test, snip scan, exports JSON report
- Console screen shows IndexedDB tables and raw data
- These tools exist because the capture pipeline can lie (iOS mic ghost, time discrepancies, missing chunks). They stay secondary. A founder recording a lecture should never open the Console to know if the recording worked; playback is the proof.

---

## Alternative A: Strengths

1. **Clean pipeline boundaries**: Each lib package owns one major transform (capture, volume analysis, transcription, playback). No ambiguity about who does what.
2. **Single datastore authority**: Only session-store writes to IndexedDB. Other packages call store interfaces, reducing data corruption risk and making IndexedDB schema changes easier to reason about.
3. **Independently testable stages**: Capture can be tested with mock store writes. Volume analysis can be tested with fixture chunks. Transcription can be tested with sample audio (no capture dependency). Playback can be tested with fixture blobs.
4. **Small package count (6)**: Fewer Phase 03 agents, faster initial planning phase.
5. **Clear Isolation Demo value**: Each lib package Isolation Demo answers one atomic question ("Does capture encode and persist chunks immediately?" "Does volume analysis propose sensible snips?" "Does transcription return accurate text?" "Does playback reassemble and play correctly?")

---

## Alternative A: Risks

1. **Transcription orchestration complexity in PWA**: The PWA must orchestrate the transcription flow (call volume-analyzer to propose snips, fetch chunks for each snip, concatenate blobs, call transcription-client, write transcripts back to store). This orchestration logic is non-trivial and lives in the app rather than a dedicated lib package. If transcription flow becomes complex (batch queue, retry, partial failure recovery), the PWA may become bloated.
2. **Playback-engine chunk reassembly**: If chunk reassembly is non-trivial (handling gaps, time discrepancies, format inconsistencies), playback-engine may grow large. Currently scoped as "reassemble and play," but if playback needs gap detection, interpolation, or chunk reordering, this package's boundary may be too broad.
3. **No explicit "Settings Manager" package**: Settings (Groq key, storage cap, developer mode toggle) are managed directly by the PWA (localStorage or IndexedDB settings table). If settings become complex (multi-profile, sync, validation rules), this may need to become a lib package. For Phase 01, settings are simple enough to stay in the app.
4. **Volume-analyzer boundary may be too narrow**: Volume analysis and snip proposal are tightly coupled in this slice. If we later want to support manual snip boundary editing, snip merging, or alternative segmentation algorithms (e.g., Whisper's built-in timestamps), volume-analyzer may need to split into "volume-profile-computer" and "snip-boundary-proposer," or grow to include snip management. For Phase 01, combined is simpler.

---

## Alternative A: Why Choose This?

Choose Alternative A if you value:

- **Simplicity and speed**: Fewer packages (6 total) means faster Phase 03–05 planning and Phase 06 implementation.
- **Clear data authority**: Single session-store as the only IndexedDB writer reduces data corruption risk.
- **Pipeline clarity**: Each lib package is one stage of the audio processing pipeline (capture → chunks → volume profiles → snips → transcription → playback). Easy to explain to a founder: "Capture makes chunks, volume analysis proposes snips, transcription turns snips into text, playback proves it all works."
- **Testability first**: Each lib package Isolation Demo is a standalone test bench for one transform. No need to run the full app to prove capture, volume analysis, transcription, or playback works.

Do NOT choose Alternative A if:

- Transcription orchestration feels too complex for the PWA app (in which case, Alternative B's dedicated transcription-service package may be better)
- You want snip management (editing, merging, splitting) to be a separate package (Alternative A combines volume analysis and snip proposal; splitting them would add a 7th package)

---

---

## Alternative B: Job-Oriented Slicing

**Principle**: Slice by user-visible jobs rather than pipeline stages. Each package owns a complete job (recording with persistence, playback, speech segmentation, transcription) or a durable data concern (audio storage, transcript storage). This creates slightly more packages but reduces orchestration complexity in the PWA.

### Package Count

- **1 app**: `apps/web-whisper-pwa`
- **4 lib packages**: `packages/lib/recording-pipeline`, `packages/lib/playback-engine`, `packages/lib/speech-segmentation`, `packages/lib/transcription-service`
- **2 datastore packages**: `packages/datastore/audio-store`, `packages/datastore/transcript-store`
- **0 UI packages**: (UI stays in the app)

**Total: 7 packages → 7 Phase 03 agents**

---

### packages/lib/recording-pipeline

**Boundary**: Owns the complete recording job from microphone to durable chunks. Combines capture, encoding, and immediate persistence. Does NOT analyze volume, propose snips, transcribe, or play audio. Stops when commanded or on timeout (watchdog for mic ghost).

**Main callable interfaces**:

- `startRecording()` → returns recording controller
  - Input: none (creates new session internally via audio-store)
  - Output: recording controller with `stop()` method, `onChunkEncoded` event, `getDuration()`, `getChunkCount()`
  - Caller: PWA start-recording flow
  - Store changed: audio-store (creates session, writes chunks every ~4s)

- `stopRecording(controller)` → returns completion summary
  - Input: recording controller from startRecording
  - Output: `{sessionId, chunksWritten, totalDuration, hasAudio: boolean}`
  - Caller: PWA stop-recording flow
  - Store changed: audio-store (flushes final chunk, marks session complete)

- Events emitted: `recordingStarted(sessionId)`, `chunkEncoded(sessionId, chunkId, duration)`, `recordingStopped(sessionId, summary)`, `recordingError(sessionId, reason)`

**Isolation Demo**:

- **Runtime**: Web app (local dev server)
- **Device**: iPhone simulator / responsive mobile viewport
- **Launch**: `cd packages/lib/recording-pipeline/isolation-demo && npm start`
- **Screens**:
  - Main: "Start Recording" button, live duration counter, chunk count, total chunks encoded, "Stop Recording" button (disabled until recording active)
  - Chunk log: Real-time list of encoded chunks (ID, duration, byteSize, timestamp)
  - Status panel: Microphone permission status, recording state (idle, active, stopped, error), watchdog timer countdown
- **Data mode**: Real write (creates test sessions in real audio-store, clearly labeled as demo data)
- **Safe default**: Real write with demo-session prefix
- **Inputs**: Live microphone (requests permission), or simulated PCM stream toggle for testing without speaking
- **Internal state**: Recording active/idle, PCM buffer size, chunks encoded count, watchdog timer status, current session ID
- **Outputs**: MP3 chunk blobs written to audio-store, session record in audio-store
- **External events**: `recordingStarted`, `chunkEncoded`, `recordingStopped`, `recordingError` in event feed
- **Internal telemetry**: PCM callback timing, encode duration, audio-store write timing, watchdog checks, buffer overruns (if any)
- **Walkthrough value**: Proves that recording starts immediately, encodes chunks every ~4s, persists them to audio-store without waiting for stop, stops cleanly, and handles mic ghost timeout (watchdog stops recording if no audio received within 10s, reports `hasAudio: false`)

**Secondary tools**: Developer panel showing raw PCM buffer snapshots, encode queue depth, audio-store write confirmations, simulated mic failure toggle

---

### packages/lib/playback-engine

**Boundary**: Plays audio from sessions, chunks, or snips. Reads audio blobs from audio-store, reassembles them if needed, provides playback controls. Does NOT capture, encode, analyze, or transcribe. (Same as Alternative A playback-engine, but data source is audio-store instead of session-store.)

**Main callable interfaces**: (Same as Alternative A, but reading from audio-store)

- `playSession(sessionId)` → playback controller
- `playChunk(chunkId)` → playback controller
- `playSnip(snipId)` → playback controller
- Events emitted: `playbackStarted`, `playbackEnded`, `playbackError`

**Isolation Demo**: (Same structure as Alternative A, but uses audio-store for data)

- **Runtime**: Web app
- **Device**: iPhone simulator / responsive mobile viewport
- **Launch**: `cd packages/lib/playback-engine/isolation-demo && npm start`
- **Screens**: Select item type (session, chunk, snip), select item from list, playback controls
- **Data mode**: Fixture audio blobs by default, "Use Real Sessions" toggle for real audio-store access (read-only)
- **Safe default**: Fixture mode
- **Walkthrough value**: Proves playback works for sessions (reassembles chunks correctly), individual chunks, and snips; seek and pause work; duration is accurate

---

### packages/lib/speech-segmentation

**Boundary**: Analyzes audio to propose speech segments (snips). Computes volume profiles from chunks, identifies quiet regions, suggests snip boundaries, and writes snip records. Does NOT capture, play, or transcribe audio. Reads chunks from audio-store, writes snips to audio-store (or transcript-store if snips belong there; TBD in Phase 02 planning).

**Main callable interfaces**:

- `analyzeSession(sessionId)` → returns volume analysis result
  - Input: session ID
  - Output: `{sessionId, volumeProfiles: [{chunkId, volumeSamples, maxVolume}], analysisComplete: boolean}`
  - Caller: PWA post-recording flow, or Doctor
  - Store read: audio-store (reads all chunks for session)
  - Store changed: audio-store (writes volume profiles for chunks)

- `proposeSnips(sessionId, options?)` → returns snip proposals
  - Input: session ID, optional `{threshold, minSnipDuration, maxSnipDuration}`
  - Output: `[{startTime, endTime, chunkRefs, confidence, reason}]`
  - Caller: PWA transcription flow, or manual snip generation
  - Store read: audio-store (reads volume profiles for session)
  - Store changed: audio-store (writes snip records) OR transcript-store (TBD; see Risks section)

- Events emitted: `volumeAnalysisComplete(sessionId)`, `snipsProposed(sessionId, snipCount)`, `segmentationError(sessionId, reason)`

**Isolation Demo**:

- **Runtime**: Web app
- **Device**: iPhone simulator / responsive mobile viewport
- **Launch**: `cd packages/lib/speech-segmentation/isolation-demo && npm start`
- **Screens**:
  - Main: Select session from audio-store (fixture or real read-only), "Analyze Volume" button, volume waveform visualization (all chunks combined), "Propose Snips" button, snip boundary threshold slider
  - Snip list panel: Shows proposed snips (startTime, endTime, duration, confidence, reason: "quiet boundary at 12.3s"), play button for each snip (calls playback-engine fixture)
  - Algorithm tuning: Adjust threshold, min/max snip duration, rerun proposal, compare results
- **Data mode**: Fixture sessions by default, "Use Real Sessions" toggle for real audio-store (read-only, does not write snips in real mode unless explicitly enabled)
- **Safe default**: Fixture mode
- **Inputs**: Fixture sessions with pre-computed chunks, or real sessions from audio-store
- **Internal state**: Current session analysis progress, volume profile cache, snip proposal algorithm parameters
- **Outputs**: Volume profile arrays, snip boundary proposals (visualized, written to audio-store in fixture or sandbox mode)
- **External events**: `volumeAnalysisComplete`, `snipsProposed` in event feed
- **Internal telemetry**: Chunk decode timing, volume computation timing, snip boundary algorithm decisions (why each cut was made, confidence score)
- **Walkthrough value**: Proves that volume analysis extracts meaningful profiles from real recorded chunks, identifies quiet regions accurately, proposes sensible snip boundaries, and allows tuning threshold to see impact on snip count and boundaries

**Secondary tools**: Raw volume profile JSON inspector, per-chunk decode verification, algorithm parameter tweaks, simulated "all quiet" or "no quiet" sessions to test edge cases

---

### packages/lib/transcription-service

**Boundary**: Manages transcription workflow end-to-end. Validates Groq API key, fetches snips from audio-store, sends snip audio to Groq Whisper, receives transcripts, writes transcripts to transcript-store. Handles batch queue, retries, partial failures. Does NOT decide which sessions to transcribe (PWA calls it), does not analyze volume or propose snips (speech-segmentation does that), does not capture or play audio.

**Main callable interfaces**:

- `validateKey(apiKey)` → returns validation result
  - Input: Groq API key string
  - Output: `{valid: boolean, errorMessage?: string}`
  - Caller: PWA Settings screen
  - Store read/changed: none (network call only)

- `transcribeSession(sessionId, apiKey)` → returns transcription job controller
  - Input: session ID, Groq API key
  - Output: transcription job controller with `abort()`, `getProgress()`, `onComplete(callback)`, `onError(callback)`
  - Caller: PWA transcription flow (after ensuring snips exist via speech-segmentation)
  - Store read: audio-store (reads snips for session, fetches chunk blobs for each snip, concatenates into snip audio blobs)
  - Store changed: transcript-store (writes transcript for each snip as it completes)

- `transcribeSnip(snipId, apiKey)` → returns transcript (low-level interface for single-snip transcription)
  - Input: snip ID, Groq API key
  - Output: `{snipId, text, language?, duration, confidence?}`
  - Caller: transcribeSession internally, or manual single-snip transcription from Developer mode
  - Store read: audio-store (reads chunk blobs for snip, concatenates)
  - Store changed: transcript-store (writes transcript for snip)

- Events emitted: `transcriptionStarted(sessionId, snipCount)`, `snipTranscribed(sessionId, snipId, text)`, `transcriptionComplete(sessionId, successCount, failureCount)`, `transcriptionError(sessionId, snipId, reason)`

**Isolation Demo**:

- **Runtime**: Web app
- **Device**: iPhone simulator / responsive mobile viewport
- **Launch**: `cd packages/lib/transcription-service/isolation-demo && npm start`
- **Screens**:
  - Key validation panel: API key input, "Validate Key" button, validation status (green enabled / red disabled / yellow validating)
  - Single-snip transcription: Upload audio file or select fixture snip, "Transcribe" button, transcript output, timing info
  - Session transcription: Select session from audio-store (fixture or real read-only), "Transcribe Session" button, batch progress bar (e.g., "3 / 8 snips transcribed"), snip-by-snip status list (queued, in-progress, complete, failed), transcript preview for each snip
  - Queue manager: List of active transcription jobs (session-level), abort button, retry failed snips button
- **Data mode**: Fixture audio files and sessions by default, "Use Real Sessions" toggle for real audio-store (read-only for audio, real-write for transcript-store in sandbox mode)
- **Safe default**: Fixture mode with example Groq test key
- **Inputs**: Fixture audio blobs and sessions, or real sessions from audio-store (read-only), API key from user
- **Internal state**: API key validation status, active transcription jobs (with progress), retry count per snip, rate limit status
- **Outputs**: Transcript text strings written to transcript-store (or shown in demo UI without persisting in fixture mode)
- **External events**: `transcriptionStarted`, `snipTranscribed`, `transcriptionComplete`, `transcriptionError` in event feed
- **Internal telemetry**: API request timing, retry attempts, rate limit encounters, Groq response metadata, batch queue depth, partial failure recovery
- **Walkthrough value**: Proves that key validation works (accepts valid, rejects invalid), single-snip transcription returns accurate text for sample audio, session-level transcription handles batch queue (processes snips sequentially or in parallel, TBD), retries failed snips, reports partial failures clearly (e.g., "7 of 8 snips transcribed, 1 failed"), and allows aborting long transcription jobs

**Secondary tools**: Raw API response inspector (JSON), network timing waterfall, simulated failure toggle (test retry logic), rate limit simulator

---

### packages/datastore/audio-store

**Boundary**: Durable authority for audio-related data: sessions, chunks, volume profiles, and snips. Owns IndexedDB schema for audio tables, retention policy enforcement (deletes old sessions when storage cap exceeded), and all read/write operations for audio data. Does NOT store transcripts (transcript-store owns those). Other packages call this store's interfaces; they do NOT write directly to IndexedDB.

**Main callable interfaces**:

- `createSession(metadata)` → returns session ID
- `writeChunk(sessionId, chunkBlob, metadata)` → returns chunk ID
- `getSession(sessionId)` → returns session record
- `listSessions(options?)` → returns session list
- `getChunksForSession(sessionId)` → returns chunk array
- `writeVolumeProfile(chunkId, volumeData)` → returns success
- `writeSnip(sessionId, snipMetadata)` → returns snip ID (OR: snips may belong to transcript-store; TBD in Phase 02)
- `getSnipsForSession(sessionId)` → returns snip array
- `enforceRetentionPolicy()` → returns cleanup summary (deletes old sessions when storage cap exceeded)

- Events emitted: `sessionCreated`, `chunkWritten`, `volumeProfileWritten`, `snipCreated`, `retentionPolicyEnforced`

**Isolation Demo** (Store Inspector):

- **Runtime**: Web app
- **Device**: iPhone simulator / responsive mobile viewport
- **Launch**: `cd packages/datastore/audio-store/isolation-demo && npm start`
- **Screens**:
  - Sessions tab: Paginated list of all sessions (timestamp, duration, chunk count, snip count), "View Details" button
  - Session detail: Chunks list (ID, startTime, duration, byteSize, has volume profile?), Snips list (ID, startTime, endTime, chunkRefs), raw JSON inspector
  - Chunks tab: All chunks across sessions, filterable by session
  - Snips tab: All snips across sessions, filterable by session
  - Volume profiles tab: Shows which chunks have volume profiles, visualize profile for selected chunk
  - Storage tab: Total storage used, session count, chunk count, storage cap setting, "Enforce Retention Policy" button (shows simulation: what would be deleted), "Clear All Demo Data" button
- **Data mode**: Real read-only by default, "Enable Writes (Sandbox)" toggle for write operations (clearly labeled as sandbox/test)
- **Safe default**: Real read-only
- **Inputs**: None for read-only; in write mode: manually create test sessions/chunks, import fixture data
- **Internal state**: Current IndexedDB state (session/chunk/volume profile/snip counts), storage quota
- **Outputs**: Store data displayed as tables and JSON, retention policy simulation results
- **External events**: (Store does not emit events directly; other packages do when calling store interfaces) In sandbox write mode, event feed shows write operations
- **Internal telemetry**: IndexedDB transaction timing, storage quota warnings, retention policy enforcement logs
- **Walkthrough value**: Proves all audio-store interfaces work (create session, write chunk, write volume profile, write snip), data relationships are correct (chunks belong to sessions, snips reference chunks), retention policy deletes old sessions correctly, storage cap is respected, no orphaned chunks or snips after retention enforcement

**Secondary tools**: IndexedDB schema inspector (tables, indexes, record counts), export/import fixture data (JSON), clear all data button (with confirmation), storage quota display, orphaned data detector (finds chunks/snips without parent sessions)

---

### packages/datastore/transcript-store

**Boundary**: Durable authority for transcription-related data: transcripts attached to snips, session-level transcript rollups, transcription status (pending, complete, failed), and transcription job history. Owns IndexedDB schema for transcript tables. Does NOT store audio data (audio-store owns sessions, chunks, snips). Other packages call this store's interfaces.

**Main callable interfaces**:

- `writeTranscript(snipId, transcriptData)` → returns success
  - Input: snip ID (from audio-store), transcript text, language, confidence, duration
  - Output: boolean success
  - Caller: transcription-service after Groq API returns transcript
  - Store changed: transcript-store (writes transcript record linked to snipId)

- `getTranscript(snipId)` → returns transcript record
  - Input: snip ID
  - Output: `{snipId, text, language?, confidence?, createdAt}`
  - Caller: PWA session detail view, playback with transcript display

- `getTranscriptsForSession(sessionId)` → returns transcript array
  - Input: session ID (from audio-store)
  - Output: `[{snipId, text, startTime, endTime}]` (ordered by snip startTime)
  - Caller: PWA session detail view (to show full session transcript), copy transcript flow

- `getTranscriptionStatus(sessionId)` → returns status summary
  - Input: session ID
  - Output: `{totalSnips, transcribedSnips, pendingSnips, failedSnips, lastTranscribedAt}`
  - Caller: PWA session list (to show transcription badge: "Transcribed" or "3 / 8 snips"), transcription-service (to resume partial jobs)

- `markTranscriptionFailed(snipId, reason)` → returns success
  - Input: snip ID, failure reason string
  - Output: boolean success
  - Caller: transcription-service when Groq API fails for a snip
  - Store changed: transcript-store (marks snip as failed, stores reason)

- Events emitted: `transcriptWritten(snipId)`, `transcriptionStatusChanged(sessionId, status)`

**Isolation Demo** (Store Inspector):

- **Runtime**: Web app
- **Device**: iPhone simulator / responsive mobile viewport
- **Launch**: `cd packages/datastore/transcript-store/isolation-demo && npm start`
- **Screens**:
  - Transcripts tab: List of all transcripts (snipId, sessionId, text preview, language, createdAt), "View Full Text" button
  - Session transcription status tab: List of sessions with transcription status (session ID, totalSnips, transcribedSnips, pendingSnips, failedSnips, lastTranscribedAt), "View Session Transcripts" button
  - Failed transcriptions tab: List of snips with failed transcription (snipId, sessionId, failureReason, attemptedAt), "Retry" button (calls transcription-service in sandbox mode)
  - Query panel: Ad-hoc queries (get transcript, get transcripts for session, get transcription status) with JSON response
- **Data mode**: Real read-only by default, "Enable Writes (Sandbox)" toggle for write operations (clearly labeled)
- **Safe default**: Real read-only
- **Inputs**: None for read-only; in write mode: manually create test transcripts, import fixture data
- **Internal state**: Current IndexedDB state (transcript count, failed transcript count), per-session transcription status cache
- **Outputs**: Transcript data displayed as tables and JSON, transcription status summaries
- **External events**: In sandbox write mode, event feed shows write operations (`transcriptWritten`, `transcriptionStatusChanged`)
- **Internal telemetry**: IndexedDB transaction timing, orphaned transcript detector (transcripts for snips that no longer exist in audio-store)
- **Walkthrough value**: Proves all transcript-store interfaces work (write transcript, get transcript, get transcripts for session, get transcription status, mark failed), transcription status is accurate (counts match actual transcript records), failed transcriptions are tracked with reasons, no orphaned transcripts after audio-store retention enforcement

**Secondary tools**: IndexedDB schema inspector, export/import fixture data, clear all transcripts button (with confirmation), orphaned transcript cleanup (deletes transcripts for snips that no longer exist in audio-store)

---

### apps/web-whisper-pwa

**Boundary**: User-facing Progressive Web App for iPhone. Owns navigation, UI screens (home, session list, session detail, settings, developer mode), platform permissions (microphone), settings persistence, and orchestration of lib packages and datastores. Does NOT implement capture, playback, segmentation, or transcription logic; calls lib packages for those jobs.

**Normal product screens**:

1. **Home / Session List** — Session cards (timestamp, duration, transcription status badge, play button), "Start Recording" FAB, navigation to Settings
   - Data: sessions from `audio-store.listSessions()`, transcription status from `transcript-store.getTranscriptionStatus(sessionId)` for each session
   - Main action: Tap "Start Recording" → calls `recording-pipeline.startRecording()`

2. **Recording (active)** — Large Stop button, live duration counter, chunk count (if developer mode)
   - Data: recording-pipeline events (`chunkEncoded`)
   - Main action: Tap "Stop" → calls `recording-pipeline.stopRecording()`, navigates to session detail

3. **Session Detail** — Session metadata, "Play Session" button, playback controls, transcription status ("Transcribed" or "Transcribe" button), full session transcript (if transcribed), "Copy Transcript" button (if transcribed)
   - Data: session from `audio-store.getSession()`, transcripts from `transcript-store.getTranscriptsForSession()`, transcription status from `transcript-store.getTranscriptionStatus()`
   - Playback: calls `playback-engine.playSession()`
   - Transcription: if snips don't exist yet, calls `speech-segmentation.proposeSnips()`, then calls `transcription-service.transcribeSession()`
   - Main action: Play, transcribe, copy transcript, delete session

4. **Settings** — Groq API key input (with validation via `transcription-service.validateKey()`), transcription status indicator (enabled/disabled), storage cap slider, "Developer Mode" toggle, "Clear Old Sessions" button (manual retention enforcement via `audio-store.enforceRetentionPolicy()`)
   - Data: settings from localStorage
   - Validation: calls `transcription-service.validateKey()` on blur
   - Main action: Save settings, validate key, toggle developer mode

5. **Developer Mode Panels** (conditional, shown when developer mode enabled):
   - **Chunk List** (session detail): calls `audio-store.getChunksForSession()`, shows chunk IDs, durations, play buttons (calls `playback-engine.playChunk()`)
   - **Snip List** (session detail): calls `audio-store.getSnipsForSession()`, shows snip boundaries, play buttons (calls `playback-engine.playSnip()`)
   - **Volume Histogram** (session detail): calls `audio-store.getChunksForSession()` (reads volume profiles from audio-store), visualizes volume timeline with snip boundaries
   - **Doctor Panel** (session detail): "Run Doctor" button → performs coverage check (calls `audio-store.getSession()` and `audio-store.getChunksForSession()`, checks for gaps), per-chunk decode test (calls `playback-engine` or speech-segmentation to decode each chunk), snip scan (checks snip boundaries against chunk ranges), exports JSON report
   - **Console** (separate screen from Settings): shows audio-store tables (sessions, chunks, volume profiles, snips) and transcript-store tables (transcripts, transcription status) via store inspector interfaces (read-only), per-session structured logs (if logging implemented)

**Data mode**: Real write. The PWA always operates on real datastores and live microphone. Developer mode does not change data mode; it exposes additional diagnostic surfaces.

**Isolation Demo**: N/A. The PWA is an app, not a package. Apps do not automatically need a separate Isolation Demo.

---

## Alternative B: Data Walkthrough

**Concrete example**: User records a 2-minute lecture.

1. User opens PWA home screen, taps "Start Recording"
2. **PWA** calls `recording-pipeline.startRecording()`
3. **recording-pipeline** creates new session via `audio-store.createSession()`, acquires microphone, begins PCM capture, starts watchdog timer
4. Every ~4s:
   - **recording-pipeline** encodes PCM buffer to MP3 chunk blob
   - **recording-pipeline** calls `audio-store.writeChunk(sessionId, chunkBlob, metadata)`
   - **audio-store** writes chunk blob and metadata to IndexedDB
   - **recording-pipeline** emits `chunkEncoded(sessionId, chunkId)` event
   - **PWA** receives event, updates chunk count display (if developer mode)
5. At ~2 minutes, user taps "Stop"
6. **PWA** calls `recording-pipeline.stopRecording(controller)`
7. **recording-pipeline** flushes final PCM buffer, writes final chunk via `audio-store.writeChunk()`, marks session complete, emits `recordingStopped` event, returns `{sessionId, chunksWritten: 30, totalDuration: 120.5, hasAudio: true}`
8. **PWA** navigates to session detail screen
9. User taps "Play Session"
10. **PWA** calls `playback-engine.playSession(sessionId)`
11. **playback-engine** calls `audio-store.getChunksForSession(sessionId)`, receives array of 30 chunks with blobs
12. **playback-engine** reassembles chunks into playable audio, returns playback controller
13. **PWA** renders playback controls, audio plays
14. User hears the lecture (playback proof)
15. User taps "Transcribe" (Groq key already validated in Settings)
16. **PWA** checks if snips exist for session: calls `audio-store.getSnipsForSession(sessionId)`, receives empty array (snips not yet proposed)
17. **PWA** calls `speech-segmentation.proposeSnips(sessionId)`
18. **speech-segmentation** calls `audio-store.getChunksForSession(sessionId)`, analyzes each chunk (computes volume profiles), writes volume profiles via `audio-store.writeVolumeProfile()`, proposes 8 snips based on quiet regions, writes snips via `audio-store.writeSnip()`, emits `snipsProposed(sessionId, 8)`, returns snip array
19. **PWA** now has 8 snips. Calls `transcription-service.transcribeSession(sessionId, apiKey)`
20. **transcription-service** calls `audio-store.getSnipsForSession(sessionId)`, receives 8 snips. For each snip:
    - **transcription-service** fetches chunk blobs from `audio-store.getChunksForSession()` filtered by snip's chunkRefs, concatenates into snip audio blob
    - **transcription-service** sends snip audio to Groq API, waits for response
    - **transcription-service** receives transcript text, calls `transcript-store.writeTranscript(snipId, {text, language, ...})`
    - **transcription-service** emits `snipTranscribed(sessionId, snipId, text)`
    - **PWA** receives event, updates progress indicator (e.g., "3 / 8 snips transcribed")
21. After all 8 snips transcribed, **transcription-service** emits `transcriptionComplete(sessionId, 8, 0)` (8 success, 0 failures)
22. **PWA** calls `transcript-store.getTranscriptsForSession(sessionId)`, receives 8 transcripts (ordered by snip startTime), concatenates them, displays full session transcript with "Copy" button
23. User taps "Copy", transcript text copied to clipboard
24. User closes PWA. Session, chunks, volume profiles, and snips remain in audio-store; transcripts remain in transcript-store.

**Failure case**: Partial transcription failure (1 of 8 snips fails due to network error)

1. User taps "Transcribe" → **transcription-service** begins transcribing 8 snips
2. Snips 1-6 transcribe successfully (written to transcript-store)
3. Snip 7 fails (network timeout) → **transcription-service** retries 3 times, still fails, calls `transcript-store.markTranscriptionFailed(snip7Id, "Network timeout after 3 retries")`, emits `transcriptionError(sessionId, snip7Id, reason)`
4. Snip 8 transcribes successfully
5. **transcription-service** emits `transcriptionComplete(sessionId, 7, 1)` (7 success, 1 failure)
6. **PWA** displays partial transcript (snips 1-6, 8) with warning badge: "7 of 8 snips transcribed. 1 failed. Tap to retry."
7. User taps "Retry Failed" → **PWA** calls `transcription-service.transcribeSnip(snip7Id, apiKey)` (single-snip retry)
8. If retry succeeds → **PWA** refreshes transcript, now shows complete 8-snip transcript

---

## Alternative B: User Walkthrough

(Same overall flow as Alternative A, with minor differences in terminology. The user experience is nearly identical.)

**Starting state**: iPhone with PWA installed, Groq API key validated in Settings.

1. **Open PWA** → session list (empty or prior sessions)
2. **Tap "Start Recording"** → recording screen, duration counter starts, chunk count increments every ~4s (if developer mode on)
3. **Speak for 30 seconds** → duration reaches 0:30, chunk count ~7
4. **Tap "Stop"** → recording stops, navigate to session detail
5. **Session detail shows**: Timestamp, duration (0:30), "Play Session" button, "Transcribe" button (enabled if Groq key valid)
6. **Tap "Play Session"** → playback controls appear, audio plays
7. **Hear the recording** → proves it exists and is durable
8. **Tap "Transcribe"** → PWA shows "Analyzing volume..." then "Transcribing..." (progress: "1 / 3 snips transcribed", "2 / 3", "3 / 3")
9. **Wait 5-10 seconds** → transcript text appears (concatenated from 3 snips), "Copy" button
10. **Tap "Copy"** → transcript copied to clipboard
11. **Navigate back to session list** → new session card shows timestamp, duration (0:30), transcription badge ("Transcribed" green checkmark), play button
12. **Tap play button** → inline playback or opens session detail and plays
13. **Navigate to Settings** → Groq API key (masked), transcription status "Enabled", storage cap slider, developer mode toggle
14. **Toggle developer mode on** → navigate to session detail
15. **Session detail now shows**: Chunk list, Snip list, Volume Histogram, Doctor button
16. **Tap "Doctor"** → Doctor runs checks, shows JSON report or summary ("All chunks present, no gaps, 3 snips, coverage 100%")
17. **Navigate to Settings → Console** → shows audio-store tables (sessions, chunks, snips) and transcript-store tables (transcripts), inspect raw data
18. **Close PWA** → all data durable

**Extension story (second session)**: Same as Alternative A.

---

## Alternative B: Finished Picture

**When this is built, this is what you get:**

You have an iPhone PWA that feels like a tape recorder, with durable chunk-based recording, playback proof, and optional transcription. (Same end state as Alternative A.)

**Starting data**: No prior sessions. Groq API key entered in Settings (validated, shows "Transcription Enabled").

**First useful version works**: (Same flow as Alternative A: open PWA, tap Start Recording, record for 1-2 minutes, tap Stop, play back to prove it exists, tap Transcribe, wait, transcript appears, tap Copy.)

**Packages involved (under the hood)**:

- **apps/web-whisper-pwa**: All user-facing screens, navigation, settings, orchestration
- **packages/lib/recording-pipeline**: Microphone capture → PCM → encode MP3 chunks → write to audio-store immediately (combines capture and persist into one package)
- **packages/lib/playback-engine**: Reassemble chunks and play audio for sessions, chunks, snips
- **packages/lib/speech-segmentation**: Compute volume profiles, propose snip boundaries based on quiet regions
- **packages/lib/transcription-service**: Manage transcription workflow (fetch snips, send to Groq, write transcripts to transcript-store, handle batch queue and retries)
- **packages/datastore/audio-store**: Durable IndexedDB authority for sessions, chunks, volume profiles, snips; retention policy enforcement
- **packages/datastore/transcript-store**: Durable IndexedDB authority for transcripts, transcription status, failed transcription tracking

**AI-assisted judgment**: Same as Alternative A (volume-based snip proposal is algorithmic, Groq Whisper is external AI, no local validation).

**Extension (second session)**: Same as Alternative A (open PWA, record second session, both sessions playable and transcribable independently, retention policy enforces storage cap).

**Visible end state**: Same as Alternative A (durable local catalog of sessions, playback, snips, transcripts, no cloud upload).

**Developer mode (secondary)**: Same as Alternative A (chunk lists, snip lists, volume histogram, Doctor, Console showing audio-store and transcript-store tables).

---

## Alternative B: Strengths

1. **Job-level cohesion**: recording-pipeline owns the complete "record and persist" job (capture + encode + write). No need to coordinate capture-engine and session-store separately; it's one package. Similarly, transcription-service owns the complete transcription workflow (fetch snips, send to Groq, write transcripts, handle retries), reducing orchestration complexity in the PWA.
2. **Cleaner separation of concerns for data**: audio-store owns audio data (sessions, chunks, volume profiles, snips); transcript-store owns transcript data. This makes it easier to reason about data ownership and lifecycle. For example, if we later want to export transcripts separately (e.g., "Export all transcripts as JSON"), transcript-store is the single source of truth.
3. **Transcription orchestration is a first-class package**: transcription-service handles batch queue, retries, partial failures, progress tracking. The PWA calls one method (`transcribeSession()`) and gets progress events; it doesn't need to loop over snips, concatenate blobs, or handle Groq errors itself. This makes the PWA simpler and moves complexity into a testable, isolated package.
4. **Snip and transcript lifecycle clarity**: Snips are proposed by speech-segmentation and stored in audio-store (or transcript-store if we decide snips belong with transcripts). Transcripts are written by transcription-service and stored in transcript-store. The relationship between snips and transcripts is explicit: snips are audio segments (audio-store), transcripts are text derived from snips (transcript-store). If we later want to re-transcribe a snip (e.g., user edits snip boundaries and re-runs transcription), transcript-store tracks transcription history per snip.
5. **Failure recovery and partial transcription**: transcription-service handles partial failures gracefully (7 of 8 snips transcribed, 1 failed). The PWA can show partial results and offer "Retry Failed" without re-transcribing successful snips. transcript-store tracks failed transcriptions with reasons, making debugging easier.

---

## Alternative B: Risks

1. **Higher package count (7 vs 6)**: Alternative B has 7 packages vs Alternative A's 6. This means one additional Phase 03 agent, slightly longer planning phases (Phases 03–05), and more coordination documents (one more set of customer relationships). If speed is critical, Alternative A's simpler structure may be preferable.
2. **Snip ownership ambiguity**: Are snips part of audio-store (they reference audio chunks) or transcript-store (they are units of transcription)? Alternative B's description assumes audio-store owns snips, but this is TBD. If snips move to transcript-store later, speech-segmentation would write to transcript-store instead of audio-store, creating a dependency from speech-segmentation to transcript-store. This may feel awkward (speech-segmentation is audio analysis, not transcription). **Resolution required in Phase 02**: Decide whether snips belong to audio-store (as audio segment metadata) or transcript-store (as transcription units). Recommendation: audio-store owns snips (they are audio segment metadata, usable even without transcription), and transcript-store references snips by ID.
3. **recording-pipeline may be too broad**: recording-pipeline combines capture, encoding, and persistence. If we later want to support alternative capture sources (e.g., upload pre-recorded audio, or capture from a different device), or alternative persistence targets (e.g., cloud storage instead of IndexedDB), recording-pipeline's boundary may be too rigid. Alternative A's separate capture-engine and session-store allows swapping capture or storage independently. For Phase 01, combined is simpler; for future extension, separation may be better.
4. **transcript-store may be under-utilized in Phase 01**: transcript-store's main job is storing transcripts and tracking transcription status. In Phase 01, this is straightforward (write transcript, read transcript, mark failed). If transcript-store has only 3-4 interfaces and minimal logic, it may feel like over-engineering vs. storing transcripts directly in audio-store as a `transcripts` table. Counter-argument: Separate transcript-store makes it easier to add transcript-specific features later (e.g., transcript versioning, re-transcription history, transcript export, transcript search index). If we foresee transcript-heavy features, separate store is justified. If transcripts remain simple (text attached to snips), storing them in audio-store may be sufficient.

---

## Alternative B: Why Choose This?

Choose Alternative B if you value:

- **Job-level encapsulation**: Each lib package owns a complete user-visible job (recording with persistence, transcription with retry, speech segmentation, playback). Easier to explain to a founder: "recording-pipeline does the whole recording job, transcription-service does the whole transcription job."
- **Transcription workflow robustness**: transcription-service handles batch queue, retries, partial failures, progress tracking as a first-class concern. The PWA doesn't need to orchestrate transcription; it just calls `transcribeSession()` and listens for events.
- **Data ownership clarity**: audio-store owns audio, transcript-store owns transcripts. Clear separation makes it easier to reason about data lifecycle, retention policy (e.g., "delete old audio but keep transcripts for 1 year"), and future features (e.g., transcript export, transcript search).
- **Failure recovery**: Partial transcription failures are handled gracefully. Users can see partial results and retry failed snips without re-transcribing successful ones.

Do NOT choose Alternative B if:

- You prioritize speed over structure (Alternative B has 7 packages vs Alternative A's 6; one extra Phase 03 agent)
- You want to keep capture and storage separate for future flexibility (e.g., alternative capture sources or cloud storage; Alternative A's capture-engine + session-store separation is cleaner for this)
- You think transcript-store is over-engineering for Phase 01 (if transcripts are simple text attached to snips, storing them in audio-store may be sufficient)

---

---

## Heading Counts

Counting major headings (packages and apps) for each alternative:

**Alternative A**:
- `apps/web-whisper-pwa` (1)
- `packages/lib/capture-engine` (2)
- `packages/lib/volume-analyzer` (3)
- `packages/lib/transcription-client` (4)
- `packages/lib/playback-engine` (5)
- `packages/datastore/session-store` (6)

**Total: 6 major headings → 6 Phase 03 agents**

**Alternative B**:
- `apps/web-whisper-pwa` (1)
- `packages/lib/recording-pipeline` (2)
- `packages/lib/playback-engine` (3)
- `packages/lib/speech-segmentation` (4)
- `packages/lib/transcription-service` (5)
- `packages/datastore/audio-store` (6)
- `packages/datastore/transcript-store` (7)

**Total: 7 major headings → 7 Phase 03 agents**

---

## Selection Decision

**No selection made yet.** Human must choose one alternative before Phase 02 scaffolding begins.

**Next step**: Review both alternatives with the founder (Dave). Consider:

- Do you prefer fewer packages (Alternative A: 6 packages, faster Phase 03–05) or job-level encapsulation (Alternative B: 7 packages, recording-pipeline owns the whole recording job, transcription-service owns the whole transcription workflow)?
- Do you want capture and storage separate for future flexibility (Alternative A: capture-engine + session-store) or combined for simplicity (Alternative B: recording-pipeline includes persistence)?
- Do you want a single datastore (Alternative A: session-store owns all data) or separate audio and transcript stores (Alternative B: audio-store + transcript-store, clearer data ownership)?
- Do you want transcription orchestration in the PWA (Alternative A: PWA loops over snips, calls transcription-client, writes transcripts) or in a dedicated package (Alternative B: transcription-service handles batch queue, retries, partial failures)?

After selection, proceed to Phase 02: record the selected alternative at the top of this document, scaffold packages and customer stubs, generate Phase 03–07 scripts, and commit the Phase 02 checkpoint.
