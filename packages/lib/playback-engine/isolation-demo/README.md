# Playback Engine Isolation Demo

Package-local runnable demo for operating playback-engine independently without the production PWA.

## Purpose

Proves that playback-engine:
- Plays sessions (concatenates all chunks, plays full session audio)
- Plays chunks (plays single chunk audio)
- Plays snips (concatenates chunk range for snip, plays snip audio)
- Supports playback controls (play, pause, resume, seek, stop)
- Tracks playback state (current time, duration, playing/paused/stopped status)
- Emits playback events (playing, paused, ended, error)

## Runtime

- **Platform**: Web app (local dev server, factory floor operating surface)
- **Viewport**: Desktop browser (wider factory floor, not phone-shaped)
- **Launch**: `cd packages/lib/playback-engine/isolation-demo && npm start` (or equivalent)

## Data Mode

**Fixture by default** (simulated session with 3 chunks: 4.0s, 4.1s, 3.5s; 2 snips: chunks 0–1 = 8.1s, chunks 2–2 = 3.5s). Optionally, **real session-store read-only** mode (sandbox IndexedDB instance, not production).

**Safe default**: Fixture mode (no session-store dependency, known audio data for testing).

## Panel-Based Layout

**4 distinct regions:**

### 1. Top Chrome Panel (fixed header, spans full width)

- **Left**: "Playback Engine Isolation Demo" heading (bold)
- **Center**: Data mode chip: "FIXTURE MODE (mock audio)" (default, gray border) or "REAL STORE (read-only)" (cyan border, if real store mode enabled)
- **Right**: "Enable Real Store" toggle (checkbox or switch; when ON → demo reads from sandbox IndexedDB instead of fixture)

### 2. Fixture Data Panel (left third of viewport, below chrome)

**Components (only visible in fixture mode):**
- Heading: "Fixture Session Data" (small gray text)
- Session info: "Session ID: demo-session-001, Duration: 11.6s, Chunks: 3"
- Chunk list (read-only, shows fixture chunk metadata):
  - Chunk 0: 0.0s – 4.0s (4.0s duration, 32,768 bytes)
  - Chunk 1: 4.0s – 8.1s (4.1s duration, 33,024 bytes)
  - Chunk 2: 8.1s – 11.6s (3.5s duration, 28,160 bytes)
- Snip list (read-only, shows fixture snip metadata):
  - Snip 0: Chunks 0–1, 0.0s – 8.1s (8.1s duration, "First snip")
  - Snip 1: Chunks 2–2, 8.1s – 11.6s (3.5s duration, "Second snip")

**Components (visible in real store mode):**
- Heading: "Real Store Session Data" (small gray text)
- Session selector dropdown: List of available sessions from sandbox IndexedDB (if any; if none, show "No sessions available, use fixture mode")
- Selected session info: Session ID, duration, chunk count, snip count (populated after session selected)

**Behaviors:**
- When "Enable Real Store" toggled ON → fixture data hidden, real store session selector visible
- When session selected from dropdown (real store mode) → session info populates, playback target list updates with real session/chunk/snip IDs

### 3. Playback Control Panel (center third of viewport, below chrome)

**Components:**
- Playback target selector:
  - Radio buttons: "Play Session" (default), "Play Chunk", "Play Snip"
  - Dropdown (when "Play Chunk" selected): Chunk 0, Chunk 1, Chunk 2 (fixture mode) or real chunk IDs (real store mode)
  - Dropdown (when "Play Snip" selected): Snip 0, Snip 1 (fixture mode) or real snip IDs (real store mode)
- "Play" button (cyan, full-width, enabled when no playback active)
- "Pause" button (yellow, full-width, enabled when playback active)
- "Resume" button (cyan, full-width, enabled when playback paused)
- "Stop" button (red, full-width, enabled when playback active or paused)
- Seek slider: "Seek to time: 0.0s ← → 11.6s" (horizontal slider, enabled when playback active or paused; max value = current target duration)
- Current playback state: "State: Idle" (gray) / "Playing" (green) / "Paused" (yellow) / "Stopped" (red)
- Current time / duration: "Time: 0.0s / 11.6s" (updates in real-time during playback)

**Behaviors:**
- When "Play" clicked → playback starts (audio plays), "Play" button disables, "Pause" / "Stop" buttons enable, state changes to "Playing" (green), time counter starts updating
- When "Pause" clicked → playback pauses, "Pause" button disables, "Resume" / "Stop" buttons enable, state changes to "Paused" (yellow), time counter freezes
- When "Resume" clicked → playback resumes, "Resume" button disables, "Pause" / "Stop" buttons enable, state changes to "Playing" (green), time counter resumes
- When "Stop" clicked → playback stops, time resets to 0.0s, all buttons reset (only "Play" enabled), state changes to "Stopped" (red) then "Idle" (gray)
- When seek slider moved → playback jumps to selected time (if playing, continues playing from new time; if paused, pauses at new time)
- When playback ends naturally (reaches end of audio) → state changes to "Idle" (gray), time resets to 0.0s, buttons reset

### 4. Event Feed Panel (right third of viewport, below chrome, scrollable)

**Components:**
- Heading: "Playback Events" (small gray text)
- Scrollable event log (most recent at bottom, autoscrolls):
  - `playing(handle=abc123, currentTime=0.0s, duration=11.6s)` (green text, timestamp)
  - `timeupdate(currentTime=1.5s)` (gray, emits every 0.5s during playback)
  - `paused(handle=abc123, currentTime=5.2s)` (yellow)
  - `playing(handle=abc123, currentTime=5.2s, duration=11.6s)` (green, after resume)
  - `seeked(newTime=8.0s)` (cyan, when seek slider moved)
  - `ended(handle=abc123)` (blue, when playback reaches end)
  - `stopped(handle=abc123)` (red, when Stop button clicked)
  - `playbackError(handle=abc123, reason="chunk_not_found")` (red, if error occurs)

**Behaviors:**
- When any playback event occurs → new log entry appends to bottom, autoscrolls to show latest
- When "Stop" clicked or playback ends → final event logged (`stopped` or `ended`)

## Before / After States

**Before state (page load, fixture mode, idle):**
- Top chrome: "FIXTURE MODE (mock audio)" chip, "Enable Real Store" toggle OFF
- Fixture data panel: Session info visible (demo-session-001, 11.6s, 3 chunks), chunk list visible, snip list visible
- Playback control panel: "Play Session" selected (radio), "Play" button enabled (cyan), other buttons disabled (gray), seek slider at 0.0s, state "Idle" (gray), time "0.0s / 11.6s"
- Event feed panel: Empty, placeholder text "No events yet. Click 'Play' to start playback."

**After state (after Play clicked → played for 5s → Pause clicked):**
- Top chrome: Same as before
- Fixture data panel: Same as before
- Playback control panel: "Play Session" selected, "Play" button disabled, "Pause" button disabled, "Resume" enabled (cyan), "Stop" enabled (red), seek slider at 5.0s, state "Paused" (yellow), time "5.0s / 11.6s"
- Event feed panel: Multiple events visible:
  - `playing(handle=abc123, currentTime=0.0s, duration=11.6s)` (green, timestamp 12:34:56.100)
  - `timeupdate(currentTime=0.5s)` (gray, 12:34:56.600)
  - `timeupdate(currentTime=1.0s)` (gray, 12:34:57.100)
  - ... (multiple timeupdate events)
  - `timeupdate(currentTime=5.0s)` (gray, 12:35:01.100)
  - `paused(handle=abc123, currentTime=5.0s)` (yellow, 12:35:01.200)

**After state (after Resume → seek slider moved to 8.0s → played to end):**
- Event feed panel: Additional events visible:
  - `playing(handle=abc123, currentTime=5.0s, duration=11.6s)` (green, after Resume)
  - `seeked(newTime=8.0s)` (cyan, after seek slider moved)
  - `timeupdate(currentTime=8.5s)` (gray)
  - `timeupdate(currentTime=9.0s)` (gray)
  - ... (more timeupdate events)
  - `timeupdate(currentTime=11.6s)` (gray)
  - `ended(handle=abc123)` (blue, playback reached end)
- Playback control panel: State "Idle" (gray), time "0.0s / 11.6s" (reset), "Play" button enabled, other buttons disabled

## What This Demo Does NOT Do

- Does not capture audio (capture-engine does that)
- Does not analyze volume or propose snips (volume-analyzer does that)
- Does not transcribe audio (transcription-client does that)
- Does not own playback UI in production (PWA owns the player controls; this demo only exercises playback-engine's programmatic interface)
- Playback-engine's public interface expects session-store reads (`playSession(sessionId)` → reads chunks from store)
- This demo exercises the CORE LOGIC (read audio, concatenate chunks, play, pause, seek, stop) without the PWA orchestration
- In fixture mode, storage integration is mocked (fixture blobs are in-memory)
- In real store mode, storage integration is proven (sandbox IndexedDB reads, but not production data)

## Implementation Notes

(To be filled by Phase 06 implementation agent)

- Fixture audio generation: Generate 3 MP3 blobs with known durations (4.0s, 4.1s, 3.5s) using Web Audio API or pre-encoded fixture files
- Fixture snip definitions: Snip 0 = chunks 0–1, Snip 1 = chunks 2–2
- Audio concatenation: Use `new Blob([blob1, blob2, blob3], {type: 'audio/mpeg'})` for multi-chunk playback, or sequential playback with `ended` event listener
- HTML5 audio element: Create `<audio>` element per playback handle, set `src = URL.createObjectURL(blob)`, call `.play()` / `.pause()` / `.currentTime = X`
- Seek implementation: Set `.currentTime` property on HTML5 audio element
- Real store read-only mode: Read from sandbox IndexedDB (separate database name, not production "web-whisper-db"), list sessions, read chunks for selected session, read snips, construct blobs for playback
