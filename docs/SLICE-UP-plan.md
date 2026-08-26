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

- **Runtime**: Web app (local dev server, factory floor operating surface)
- **Device**: Desktop browser viewport (wider factory floor, not phone-shaped)
- **Launch**: `cd packages/lib/capture-engine/isolation-demo && npm start`
- **Data mode**: **In-memory only** (no IndexedDB, no session-store writes). Reset discards all. Chunks live in RAM as a demo session object until browser tab closes or Reset is clicked.
- **Safe default**: In-memory with simulated PCM stream (no mic permission required by default)

**Panel-based layout (5 distinct regions):**

1. **Top chrome panel** (fixed header, spans full width):
   - Left: "Capture Engine Isolation Demo" heading (bold)
   - Center: Data mode chip "IN-MEMORY (not persisted)" (cyan border, white text)
   - Right: Microphone permission status ("Granted" green / "Denied" red / "Not requested" gray)

2. **Control panel** (left third of viewport, below chrome):
   - "Start Capture" button (cyan, full-width in panel, disabled when capture active)
   - "Stop Capture" button (red, full-width, disabled when capture idle)
   - "Reset" button (gray, full-width, clears RAM chunks + resets state; always enabled)
   - Audio source toggle: "Live Microphone" vs "Simulated PCM stream" (radio buttons or toggle switch)
     - Live Microphone: requests permission, uses real mic input (user must speak)
     - Simulated PCM: generates synthetic audio waveform (no mic needed, automatic "speech")
   - When "Start Capture" clicked → button disables, "Stop Capture" enables, live meters start updating, watchdog timer starts (10s countdown), chunks begin encoding every ~4s
   - When "Stop Capture" clicked → capture stops, final chunk flushes, buttons reset (Start enabled, Stop disabled), meters freeze at final values

3. **Live meters panel** (center third, below chrome):
   - Duration counter: "Duration: 0.00s" (updates every frame from PCM sample count, NOT wall clock)
   - PCM buffer fill: Horizontal progress bar "PCM buffer: 1024 / 2048 samples" (fills and drains as encode happens)
   - Chunks encoded: "Chunks: 0" (increments when each chunk encodes: 0 → 1 → 2 → 3...)
   - Watchdog countdown: "Watchdog: 10.0s" (counts down from 10s; if reaches 0 before first chunk encodes, capture auto-stops with "no audio received" error)
   - When capture active: all meters update in real-time (duration climbs, buffer fills/drains, chunk count increments, watchdog resets after first chunk or counts down if mic silent)
   - When capture stops: meters freeze at final values (duration = total, buffer = 0 or remainder, chunks = final count, watchdog = "N/A")

4. **Chunk tape panel** (right third, below chrome, scrollable list):
   - Heading: "In-Memory Chunks (RAM only)" (small gray text)
   - List of encoded chunks (grows as capture runs; each chunk is a row):
     - Column 1: Seq number (0, 1, 2, 3...)
     - Column 2: Start time (e.g., "0.00s", "4.12s", "8.24s")
     - Column 3: End time (e.g., "4.12s", "8.24s", "12.35s")
     - Column 4: Byte length (e.g., "32,768 bytes", "31,245 bytes")
     - Column 5: "Play" button (inline, plays THIS chunk's in-memory blob via HTML5 audio; does NOT call playback-engine or session-store)
   - When "Start Capture" clicked and first chunk encodes (~4s): first row appears (Seq 0, Start 0.00s, End ~4.0s, ~32KB, Play button)
   - When each subsequent chunk encodes: new row appears below (Seq 1, Seq 2, etc.)
   - When "Reset" clicked: entire list clears (no rows), in-memory blobs are discarded
   - Scrolls vertically if > ~10 chunks (keeps growing until Reset or tab close)

5. **Event/failure panel** (bottom strip, spans full width, secondary disclosure):
   - Collapsible section (collapsed by default): "Show Event Feed ▶" (click to expand → "Hide Event Feed ▼")
   - When expanded: scrollable log of events (most recent at bottom, autoscrolls):
     - `chunkEncoded(seq=0, duration=4.12s, bytes=32768)` (green text, timestamp)
     - `chunkEncoded(seq=1, duration=4.11s, bytes=31245)` (green)
     - `captureError(reason="no_audio_received", watchdog_timeout=10s)` (red, if mic silent for 10s)
     - `captureStopped(totalChunks=7, totalDuration=28.5s, hasAudio=true)` (blue)
   - When collapsed: only heading visible ("Show Event Feed ▶"), no vertical space used
   - NOT the main product of this demo (chunk tape is the product); event feed is diagnostic/telemetry for debugging

**Before state** (page load, capture idle):
- Control panel: "Start Capture" enabled (cyan), "Stop Capture" disabled (gray), "Reset" enabled, audio source = "Simulated PCM" by default
- Live meters: Duration 0.00s, PCM buffer 0 / 2048, Chunks 0, Watchdog N/A (not started)
- Chunk tape: Empty (no rows), heading visible ("In-Memory Chunks (RAM only)")
- Event feed: Collapsed, no events yet

**After state** (after Start → speak/simulate for 12s → Stop):
- Control panel: "Start Capture" enabled (ready for next capture), "Stop Capture" disabled, "Reset" enabled
- Live meters: Duration 12.35s (frozen), PCM buffer 0 / 2048 (flushed), Chunks 3, Watchdog N/A (stopped)
- Chunk tape: 3 rows visible (Seq 0, 1, 2 with start/end times, byte lengths, Play buttons)
- Event feed: (if expanded) shows 3 `chunkEncoded` events + 1 `captureStopped` event

**Walkthrough value**: Proves that capture-engine acquires audio (live mic or simulated), encodes MP3 chunks every ~4s, keeps them in memory temporarily (NOT persisted to store), provides duration from PCM sample count (not wall clock), detects mic ghost (watchdog timeout), and flushes final chunk < 4s on stop. Operator can play each chunk immediately from RAM to verify encoding worked. Reset discards everything (proves in-memory, not durable).

**What this demo does NOT do**: Does not call session-store. Does not write to IndexedDB. Does not create sessions. Capture-engine's public interface is `startCapture(sessionId)` which expects a caller-provided session ID and writes to session-store; this demo exercises the CORE LOGIC (acquire mic, capture PCM, encode chunks, detect failures) without the storage integration. Storage integration is proven in session-store's Isolation Demo or the final PWA.

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

- **Runtime**: Web app (local dev server, factory floor)
- **Device**: Desktop browser viewport (wider factory floor)
- **Launch**: `cd packages/lib/volume-analyzer/isolation-demo && npm start`
- **Data mode**: **Fixture by default** (pre-recorded test chunks with known volume patterns). Optional: "Use Real Sessions" toggle for read-only session-store access (does not write volume profiles or snips in demo). Optional: "Live from Capture" mode (includes capture-engine as demo dependency, produces audio in-memory, analyzes it immediately, does not persist).
- **Safe default**: Fixture mode (3–5 sample chunks: speech, silence, mixed, music, quiet speech)

**Panel-based layout (5 regions + optional capture panel):**

1. **Top chrome panel** (fixed header, spans full width):
   - Left: "Volume Analyzer Isolation Demo" heading
   - Center: Data mode chip "FIXTURE" / "REAL SESSIONS (read-only)" / "LIVE FROM CAPTURE (in-memory)" (changes based on mode selector)
   - Right: Mode selector dropdown: "Fixture" (default), "Real Sessions", "Live from Capture"

2. **Input selection panel** (left sidebar, 1/4 width):
   - **Fixture mode** (default):
     - Heading: "Fixture Chunks"
     - List of fixture chunks (radio buttons or clickable rows): "Speech 10s", "Silence 8s", "Mixed 15s", "Music 12s", "Quiet speech 9s"
     - Selected chunk highlighted (cyan border)
     - "Analyze Selected Chunk" button (cyan, analyzes single chunk → updates waveform + volume profile below)
   - **Real Sessions mode** (when toggled):
     - Heading: "Sessions from Store"
     - Dropdown: "Select session..." (lists sessions from session-store, read-only)
     - After selection: "Session XYZ: 45.2s, 11 chunks" (metadata)
     - "Analyze All Chunks" button (analyzes all chunks in session → updates histogram below)
     - "Propose Snips" button (after analysis complete, proposes snip boundaries → updates histogram with snip overlays)
   - **Live from Capture mode** (when toggled):
     - Includes capture-engine mini control panel: "Start Capture", "Stop Capture", "Audio Source: Simulated PCM"
     - After stop: "Captured X chunks (in-memory), Y seconds"
     - "Analyze Captured Audio" button (analyzes in-memory chunks from capture → updates histogram)
     - "Propose Snips" button (proposes snips from in-memory volume profiles)

3. **Volume waveform panel** (center, 50% width, single-chunk view):
   - Heading: "Chunk Volume Waveform" (only visible when single chunk is analyzed)
   - Waveform visualization: X-axis = time (0s → chunk duration), Y-axis = volume (0 → 100%)
     - Green line: volume samples over time (updated after "Analyze Selected Chunk")
     - Quiet regions (< threshold): shaded red or gray background
   - Below waveform: "Max volume: 85%, Avg volume: 42%, Quiet regions: 3" (metadata from analysis)
   - When no chunk selected: placeholder "Select and analyze a chunk to see waveform"
   - When chunk analyzed: waveform renders with volume profile array (sampled every ~100ms → points on line)

4. **Session histogram panel** (center, 50% width, session-level view; replaces waveform when session is analyzed):
   - Heading: "Session Volume Histogram" (only visible when full session analyzed)
   - Histogram visualization: X-axis = session timeline (0s → session duration), Y-axis = volume
     - Blue bars: aggregated volume per chunk (one bar per chunk, height = avg volume for that chunk)
     - Vertical red lines: proposed snip boundaries (appear after "Propose Snips" clicked)
     - Labels above snip boundaries: "Snip 0", "Snip 1", "Snip 2" (snip IDs)
   - Below histogram: "Session: 45.2s, 11 chunks, 4 snips proposed" (metadata)
   - When no session selected: placeholder "Select and analyze a session to see histogram"

5. **Volume profile data panel** (right sidebar, 1/4 width):
   - Heading: "Volume Profile Data"
   - When single chunk analyzed:
     - "Chunk ID: fixture-speech-10s" (or chunk seq from session)
     - "Duration: 10.23s"
     - "Sample count: 102" (one sample per ~100ms)
     - "Max volume: 85%"
     - "Avg volume: 42%"
     - Expandable: "Raw volume array (JSON)" → shows `[0.12, 0.45, 0.67, ...]` (Float32Array as JSON)
   - When session analyzed:
     - "Session ID: abc123" (or "In-memory from capture")
     - "Total duration: 45.2s"
     - "Chunks analyzed: 11"
     - "Snips proposed: 4"
     - Expandable: "Snip boundaries (JSON)" → shows `[{startTime: 0.0, endTime: 12.3, confidence: 0.87}, ...]`

6. **Algorithm tuning panel** (bottom strip, secondary disclosure):
   - Collapsible: "Show Algorithm Parameters ▶" (collapsed by default)
   - When expanded:
     - Snip threshold slider: "Quiet threshold: 30%" (0–100%, adjusts what counts as "quiet")
     - Min snip duration: "5s" (number input, snips shorter than this are merged)
     - Max snip duration: "60s" (number input, snips longer than this are split)
     - "Rerun Snip Proposal" button (re-proposes snips with new parameters → histogram updates)
   - When parameters change and "Rerun" clicked: histogram snip boundaries update (red lines move, snip count may change)

7. **Event feed panel** (bottom strip, collapsed by default):
   - Collapsible: "Show Event Feed ▶"
   - When expanded: `volumeProfileReady(chunkId=0)`, `volumeProfileReady(chunkId=1)`, `snipsProposed(sessionId=abc, snipCount=4, avgConfidence=0.82)`, decode timing logs, algorithm decision logs ("Snip boundary at 12.3s: quiet region detected, confidence 87%")

**Before state** (page load, Fixture mode):
- Input selection: "Speech 10s" selected (first fixture in list)
- Volume waveform: placeholder "Select and analyze..."
- Volume profile data: empty
- Algorithm tuning: collapsed, default parameters (threshold 30%, min 5s, max 60s)

**After state** (Fixture mode, "Speech 10s" analyzed):
- Input selection: "Speech 10s" highlighted
- Volume waveform: green line showing volume over 10s, 2 quiet regions shaded red (0–1s, 8–10s)
- Volume profile data: "Chunk ID: fixture-speech-10s, Duration: 10.23s, Max 85%, Avg 42%", raw array expandable
- Algorithm tuning: still collapsed (not needed for single-chunk analysis)

**After state** (Real Sessions mode, session analyzed, snips proposed):
- Input selection: "Session abc123: 45.2s, 11 chunks" selected
- Session histogram: 11 blue bars (one per chunk), 4 vertical red lines (snip boundaries at 0s, 12.3s, 28.7s, 41.0s, 45.2s), snip labels above
- Volume profile data: "Session ID: abc123, Duration 45.2s, Chunks 11, Snips 4", snip boundaries JSON expandable
- Algorithm tuning: expanded, slider adjusted to 25% → "Rerun" clicked → histogram updates (snip boundaries move, now 3 snips instead of 4)

**Walkthrough value**: Proves that volume-analyzer decodes chunks, computes volume profiles (samples over time), visualizes volume waveforms and histograms, identifies quiet regions accurately, proposes snip boundaries based on threshold (algorithmic, not AI), and allows tuning parameters to see impact on snip proposals. Operator can use fixtures (safe, repeatable), real sessions (read-only), or live-captured audio (in-memory from capture-engine) without launching the PWA.

**Optional capture integration** (Live from Capture mode): Volume-analyzer demo MAY include capture-engine as a demo dependency. When "Live from Capture" mode is selected, a mini capture control panel appears in the input selection sidebar. Operator clicks "Start Capture" → speaks or uses simulated PCM → clicks "Stop Capture" → captured chunks live in RAM (not persisted) → clicks "Analyze Captured Audio" → volume profiles computed from in-memory chunks → histogram displays → clicks "Propose Snips" → snip boundaries proposed. This proves the full capture → volume analysis → snip proposal flow without persisting to session-store. Discarded when page reloads or mode changes.

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

- **Runtime**: Web app (local dev server, factory floor)
- **Device**: Desktop browser viewport
- **Launch**: `cd packages/lib/transcription-client/isolation-demo && npm start`
- **Data mode**: **Fixture by default** (5–10 sample speech audio clips with known correct transcripts for comparison). Optional: "Use Real Snips" (read-only session-store snip blobs). Optional: "Live from Capture" (capture-engine produces audio in-memory, transcribes immediately, no persist).
- **Safe default**: Fixture mode with example Groq test key (clearly labeled "Demo key, may be rate-limited")

**Panel-based layout (6 regions):**

1. **Top chrome panel** (fixed header, spans full width):
   - Left: "Transcription Client Isolation Demo" heading
   - Center: Data mode chip "FIXTURE" / "REAL SNIPS (read-only)" / "LIVE FROM CAPTURE" (mode selector)
   - Right: API key validation status: "Key valid ✓" (green) / "Key invalid ✗" (red) / "Key missing" (gray)

2. **API key panel** (top left, 1/3 width):
   - Heading: "Groq API Key"
   - Text input field: "sk-..." (masked by default, "Show" toggle to reveal)
   - "Validate Key" button (cyan, click → calls `validateKey(apiKey)` → updates status in chrome)
   - Validation result below input:
     - If valid: "Key valid ✓ Transcription enabled" (green text)
     - If invalid: "Key invalid ✗ Error: [Groq error message]" (red text)
     - If missing: "No key entered. Add key to enable transcription." (gray text)
   - Help text: "Need a key? Create one in Groq Console (link). Demo key provided for testing." (small gray)
   - When "Validate Key" clicked: button disables briefly (~500ms), spinner appears, then result displays

3. **Audio input selection panel** (top center, 1/3 width):
   - **Fixture mode** (default):
     - Heading: "Fixture Audio Clips"
     - List of fixture audio clips (radio buttons): "Speech sample 1 (8s)", "Speech sample 2 (5s)", "Quiet speech (12s)", "Accented speech (10s)", "Music (not speech, 6s)"
     - Each row: clip name, duration, "Play" button (plays fixture audio locally, no transcription yet)
     - Selected clip highlighted (cyan border)
   - **Real Snips mode**:
     - Heading: "Snips from Store"
     - Dropdown: "Select session..." → lists sessions → "Select snip..." → lists snips from that session
     - Selected snip: "Snip 3 of Session abc: 12.3s–18.7s (6.4s)"
     - "Play Snip" button (plays snip audio from session-store, read-only)
   - **Live from Capture mode**:
     - Heading: "Capture Audio Now"
     - Mini capture controls: "Start Capture", "Stop Capture", "Audio Source: Simulated PCM"
     - After stop: "Captured 2 chunks (8.5s total, in-memory)"
     - "Use Captured Audio" button (selects in-memory audio for transcription)

4. **Transcription control panel** (top right, 1/3 width):
   - Heading: "Transcribe Selected Audio"
   - "Transcribe" button (cyan, full-width, click → sends selected audio to Groq → transcript appears in output panel below)
     - Disabled if: no audio selected OR API key invalid OR transcription already in progress
     - Enabled when: audio selected AND key valid AND idle
   - Status indicator below button:
     - Idle: "Ready to transcribe" (gray)
     - In progress: "Transcribing... [spinner] Elapsed: 2.3s" (yellow, updates every 100ms)
     - Complete: "Transcription complete in 3.8s" (green)
     - Failed: "Transcription failed: [error]" (red)
   - "Abort" button (red, only visible during in-progress; click → cancels API request, returns to idle)

5. **Transcript output panel** (center, 50% width, below input panels):
   - Heading: "Transcript Output"
   - When idle (no transcription run yet): placeholder "Select audio and click Transcribe to see output"
   - When in progress: "Transcribing... (waiting for Groq API response)" (spinner)
   - When complete:
     - Transcript text (large, readable font): "This is the transcribed text from the audio clip. It should match the original speech closely."
     - Below text: "Language: en, Duration: 8.2s, Confidence: 0.94" (metadata from Groq response)
     - "Copy to Clipboard" button (click → copies transcript text, shows "Copied!" toast)
   - When failed:
     - Error message (red): "Transcription failed: Invalid API key" / "Network error: timeout after 30s" / "Rate limit exceeded"
     - "Retry" button (click → retries same audio with same key)

6. **Batch queue panel** (right sidebar, 25% width):
   - Heading: "Transcription Queue" (for testing batch behavior, optional advanced feature)
   - List of queued jobs (rows):
     - Job 1: "Speech sample 1 (8s) - Complete ✓" (green)
     - Job 2: "Speech sample 2 (5s) - In progress... 2.1s" (yellow, spinner)
     - Job 3: "Quiet speech (12s) - Queued" (gray, waiting)
     - Job 4: "Accented speech (10s) - Failed ✗" (red, with "Retry" button)
   - "Add Selected to Queue" button (adds currently selected audio to queue without transcribing immediately)
   - "Process Queue" button (transcribes all queued items sequentially, updates status for each)
   - When batch processing: jobs move from "Queued" → "In progress" → "Complete" or "Failed" one at a time

7. **Network telemetry panel** (bottom strip, secondary disclosure):
   - Collapsible: "Show Network Telemetry ▶" (collapsed by default)
   - When expanded:
     - API request timing: "Request sent at 14:23:45.123, Response received at 14:23:48.987, Elapsed: 3.864s"
     - Retry count: "Retries: 0" (increments if network failure and retry occurs)
     - Rate limit status: "Rate limit: OK" / "Rate limit: WARNING (90% of quota)" / "Rate limit: EXCEEDED (429 response)"
     - Raw Groq API response (JSON): Expandable, shows `{"text": "...", "language": "en", "duration": 8.2, ...}`
     - Simulated failure toggle: "Simulate network failure" (checkbox, forces next transcription to fail for testing error handling)

8. **Event feed panel** (bottom strip, collapsed by default):
   - Collapsible: "Show Event Feed ▶"
   - When expanded: `transcriptionStarted(audioId=fixture-1)`, `transcriptionComplete(audioId=fixture-1, text="...", duration=3.8s)`, `transcriptionFailed(audioId=fixture-2, reason="Network timeout")`, `keyValidated(valid=true)`

**Before state** (page load, Fixture mode):
- API key panel: Demo key pre-filled, status "Key valid ✓" (auto-validated on load)
- Audio input: "Speech sample 1 (8s)" selected (first fixture)
- Transcription control: "Transcribe" button enabled (cyan), status "Ready to transcribe"
- Transcript output: placeholder "Select audio and click Transcribe..."
- Batch queue: empty (no jobs)

**After state** (Fixture mode, "Speech sample 1" transcribed successfully):
- API key panel: unchanged (still valid)
- Audio input: "Speech sample 1" still selected
- Transcription control: status "Transcription complete in 3.8s" (green)
- Transcript output: "This is the transcribed text..." (actual transcript from Groq), "Language: en, Duration: 8.2s, Confidence: 0.94", "Copy to Clipboard" button
- Batch queue: if used, Job 1 shows "Complete ✓" with transcript text preview

**After state** (batch queue with 3 jobs, 1 complete, 1 in progress, 1 failed):
- Batch queue: Job 1 "Complete ✓" (green), Job 2 "In progress... 2.1s" (yellow), Job 3 "Failed ✗ Rate limit exceeded" (red, "Retry" button)
- Transcript output: shows Job 1's transcript (most recent complete)
- Network telemetry: (if expanded) shows rate limit warning "90% of quota"

**Walkthrough value**: Proves that transcription-client validates Groq API keys correctly (accepts valid, rejects invalid with specific error), sends audio to Groq Whisper API, receives transcript text with metadata (language, duration, confidence), handles errors clearly (network timeout, invalid key, rate limit), supports retry, and can process multiple audio clips sequentially (batch queue). Operator can use fixtures (safe, known correct transcripts for comparison), real snips (read-only from session-store), or live-captured audio (in-memory from capture-engine) without launching the PWA.

**Optional capture integration** (Live from Capture mode): Transcription-client demo MAY include capture-engine as a demo dependency. When "Live from Capture" mode is selected, a mini capture panel appears in the audio input selection area. Operator captures live speech → stops → selects captured audio → transcribes → sees transcript. Captured audio stays in-memory (not persisted). Proves the full capture → transcribe flow without session-store.

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

- **Runtime**: Web app (local dev server, factory floor)
- **Device**: Desktop browser viewport
- **Launch**: `cd packages/lib/playback-engine/isolation-demo && npm start`
- **Data mode**: **Fixture by default** (3–5 pre-recorded fixture sessions with known durations, chunk counts). Optional: "Use Real Sessions" (read-only session-store access). Optional: "Live from Capture" (capture-engine produces audio in-memory, playback immediately, no persist).
- **Safe default**: Fixture mode (Fixture session 1: 12.5s speech, 3 chunks; Fixture session 2: 8.3s silence, 2 chunks; Fixture session 3: 45s mixed, 11 chunks)

**Panel-based layout (5 regions):**

1. **Top chrome panel** (fixed header, spans full width):
   - Left: "Playback Engine Isolation Demo" heading
   - Center: Data mode chip "FIXTURE" / "REAL SESSIONS (read-only)" / "LIVE FROM CAPTURE (in-memory)"
   - Right: Mode selector dropdown: "Fixture" (default), "Real Sessions", "Live from Capture"

2. **Item selection panel** (left sidebar, 1/4 width):
   - **Fixture mode** (default):
     - Heading: "Fixture Items"
     - Tab pills: "Sessions" (active), "Chunks", "Snips"
     - Sessions tab: List of fixture sessions (radio buttons): "Session 1: Speech 12.5s (3 chunks)", "Session 2: Silence 8.3s (2 chunks)", "Session 3: Mixed 45s (11 chunks)"
     - Chunks tab: List of fixture chunks: "Chunk 0 (0–4.2s)", "Chunk 1 (4.2–8.5s)", "Chunk 2 (8.5–12.5s)"
     - Snips tab: List of fixture snips: "Snip 0 (0–5.1s)", "Snip 1 (5.1–12.5s)"
     - Selected item highlighted (cyan border)
   - **Real Sessions mode**:
     - Heading: "Sessions from Store"
     - Dropdown: "Select session..." → lists sessions from session-store (read-only)
     - After selection: "Session abc: 45.2s, 11 chunks" (metadata)
     - Radio buttons: "Play whole session" (default), "Play chunks individually", "Play snips individually"
     - If "chunks" or "snips" selected: secondary list appears with chunk/snip IDs to select
   - **Live from Capture mode**:
     - Heading: "Capture Audio Now"
     - Mini capture controls: "Start Capture", "Stop Capture", "Audio Source: Simulated PCM"
     - After stop: "Captured 3 chunks (12.5s total, in-memory)"
     - Radio buttons: "Play whole capture" (default), "Play chunks individually"

3. **Playback control panel** (center top, 50% width):
   - Heading: "Playback Controls"
   - Currently playing: "Session 1: Speech 12.5s" (item name, updates when selection changes)
   - Standard playback buttons (horizontal row, large, touch-friendly):
     - "Play" button (▶, cyan, click → starts playback, changes to "Pause")
     - "Pause" button (⏸, replaces Play when playing, click → pauses, changes back to Play)
     - "Stop" button (⏹, red, click → stops playback, resets position to 0:00)
   - Seek bar (horizontal slider, below buttons):
     - Scrubber: blue progress bar (fills left-to-right as playback progresses)
     - Thumb: draggable handle (click and drag → seeks to new position, updates current time immediately)
     - Time labels: "Current: 3.2s / Total: 12.5s" (updates every 100ms during playback)
   - Volume slider (below seek bar, optional): "Volume: 80%" (0–100%, adjusts playback volume)
   - When "Play" clicked: button changes to "Pause", seek bar scrubber begins filling, current time increments, audio plays from speakers
   - When "Pause" clicked: button changes back to "Play", scrubber freezes, current time stops incrementing, audio stops
   - When scrubber dragged to 7.5s: playback jumps to 7.5s immediately, current time updates, audio continues from new position
   - When playback reaches end (current time = total duration): "Play" button re-enables, scrubber resets to 0:00, audio stops

4. **Waveform visualization panel** (center bottom, 50% width):
   - Heading: "Audio Waveform" (optional, shows amplitude over time)
   - Waveform graph: X-axis = time (0 → total duration), Y-axis = amplitude (-100% to +100%)
     - Blue waveform: audio amplitude samples (rendered from loaded audio buffer)
     - Red vertical line: current playback position (moves left-to-right as playback progresses, synced with seek bar)
   - When idle (no item loaded): placeholder "Select and play an item to see waveform"
   - When playing: red line moves smoothly across waveform, synced with current time
   - When scrubber dragged: red line jumps to new position immediately

5. **Playback queue/history panel** (right sidebar, 1/4 width):
   - Heading: "Playback History"
   - List of recently played items (most recent at top, max 10 rows):
     - Row 1: "Session 1: Speech 12.5s - Played 2 min ago ✓" (green checkmark)
     - Row 2: "Chunk 0 (0–4.2s) - Played 5 min ago ✓"
     - Row 3: "Session 3: Mixed 45s - Playback failed ✗ (Error: decode error)" (red X)
   - Currently playing indicator: Row for active item has pulsing cyan border + "▶ Playing now..." (updates in real-time)
   - Click on history row: re-loads that item into playback controls (stops current playback, loads selected item, does not auto-play)

6. **Audio buffer inspector panel** (bottom strip, secondary disclosure):
   - Collapsible: "Show Audio Buffer Inspector ▶" (collapsed by default)
   - When expanded:
     - Buffer status: "Loaded: 3 chunks, Total bytes: 98,304, Duration: 12.5s"
     - Chunk details table (if playing session reassembled from chunks):
       - Column 1: Chunk seq (0, 1, 2)
       - Column 2: Byte range (0–32768, 32768–65536, 65536–98304)
       - Column 3: Time range (0–4.2s, 4.2–8.5s, 8.5–12.5s)
       - Column 4: Decode status ("OK ✓" green / "Failed ✗" red)
     - Gap detection: "Gaps detected: None" (green) / "Gaps: chunk 3 missing (12.5–16.7s)" (red, if chunk missing in session)
     - Reassembly timing: "Chunk reassembly took 45ms" (performance metric)
   - When playing single chunk or snip: simpler view "Loaded: 1 chunk, 32,768 bytes, 4.2s, Decode: OK ✓"

7. **Event feed panel** (bottom strip, collapsed by default):
   - Collapsible: "Show Event Feed ▶"
   - When expanded: `playbackStarted(itemType="session", itemId="fixture-1")`, `playbackEnded(itemType="session", itemId="fixture-1")`, `playbackError(itemType="chunk", itemId="chunk-3", reason="Decode error: invalid MP3 header")`, seek operation logs, buffer loading logs

**Before state** (page load, Fixture mode):
- Item selection: "Session 1: Speech 12.5s (3 chunks)" selected (first fixture)
- Playback control: "Play" button enabled (cyan), seek bar at 0:00 / 12.5s, paused state
- Waveform: placeholder "Select and play..."
- Playback queue: empty (no history yet)

**After state** (Fixture mode, Session 1 played to completion):
- Item selection: "Session 1" still selected
- Playback control: "Play" button enabled (ready to replay), seek bar at 0:00 / 12.5s (reset), paused state
- Waveform: blue waveform visible (loaded from buffer), red line at 0:00
- Playback queue: "Session 1: Speech 12.5s - Played just now ✓" (green, in history)

**After state** (Fixture mode, Session 1 playing, at 7.5s, then paused):
- Item selection: "Session 1" selected
- Playback control: "Pause" button visible (was Play, now paused), seek bar at 7.5s / 12.5s (scrubber halfway), current time "7.5s"
- Waveform: red line at 7.5s position (frozen, not moving)
- Playback queue: "Session 1: Speech 12.5s - ▶ Playing now... (paused)" (cyan border, pulsing)

**After state** (Real Sessions mode, session abc with 11 chunks, chunk 5 missing → playback error):
- Item selection: "Session abc: 45.2s, 11 chunks" selected
- Playback control: "Play" attempted, but error occurred → "Stop" button visible, seek bar at 0:00 (never progressed)
- Waveform: partial waveform (chunks 0–4 loaded, then gap, then chunks 6–10), red line at 0:00
- Audio buffer inspector: (if expanded) "Gaps: chunk 5 missing (20.8–24.9s)" (red)
- Playback queue: "Session abc: 45.2s - Playback failed ✗ (Gap detected: missing chunk 5)" (red X)

**Walkthrough value**: Proves that playback-engine loads audio (session reassembles chunks, single chunk, snip concatenates chunks), plays audio from speakers/headphones, provides standard playback controls (play, pause, stop, seek), accurately reflects duration from chunk metadata, handles chunk reassembly correctly (no gaps or time skips), detects gaps/missing chunks and reports errors, and syncs waveform visualization with current playback position. Operator can use fixtures (safe, known durations), real sessions (read-only from session-store), or live-captured audio (in-memory from capture-engine) without launching the PWA.

**Optional capture integration** (Live from Capture mode): Playback-engine demo MAY include capture-engine as a demo dependency. When "Live from Capture" mode is selected, mini capture controls appear. Operator captures live speech → stops → captured chunks stay in-memory → clicks "Play whole capture" → playback-engine reassembles in-memory chunks and plays them back. Proves capture → playback flow without session-store. Audio discarded when page reloads.

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

- **Runtime**: Web app (local dev server, factory floor)
- **Device**: Desktop browser viewport (store inspector needs table space)
- **Launch**: `cd packages/datastore/session-store/isolation-demo && npm start`
- **Data mode**: **Real read-only by default** (shows actual IndexedDB data from this browser, no mutations). Optional: "Enable Writes (Sandbox)" toggle (allows write operations, clearly labeled as sandbox/test, writes to real IndexedDB but with "DEMO-" prefix on session IDs). Optional: "Live from Capture" (includes capture-engine, produces audio and writes to real IndexedDB with sandbox labels).
- **Safe default**: Real read-only (inspect existing sessions from prior PWA usage or other demos, no writes)

**Panel-based layout (6 tabs + chrome):**

1. **Top chrome panel** (fixed header, spans full width):
   - Left: "Session Store Isolation Demo" heading
   - Center: Data mode chip "READ-ONLY" / "SANDBOX WRITE ENABLED" / "LIVE FROM CAPTURE (writing)" (red chip when writes enabled, yellow when capture active)
   - Right: Storage quota display "Using 127 MB / 500 MB device storage" (reads from IndexedDB API, live quota)
   - Write mode toggle (right, below quota): "Enable Writes (Sandbox)" checkbox (off by default, red when on)

2. **Tab navigation** (below chrome, horizontal tabs):
   - "Sessions" (active by default)
   - "Chunks"
   - "Snips"
   - "Volume Profiles"
   - "Transcripts"
   - "Storage"
   - "Query Console"
   - Active tab: cyan underline, bold text

3. **Sessions tab** (default active):
   - Heading: "All Sessions"
   - Filters (top of panel): "Sort by: Timestamp desc" (dropdown), "Limit: 50" (input), "Show only: All / Demo sessions / Real sessions" (radio buttons)
   - Sessions table (scrollable, paginated):
     - Column 1: Session ID (e.g., "abc123", "DEMO-xyz789")
     - Column 2: Timestamp (e.g., "2026-08-26 14:23:45")
     - Column 3: Duration (e.g., "45.2s")
     - Column 4: Chunk count (e.g., "11")
     - Column 5: Snip count (e.g., "4" or "–" if not yet proposed)
     - Column 6: Transcript status ("Transcribed ✓" green / "Partial 3/4" yellow / "None" gray)
     - Column 7: "View Details" button (click → expands row inline or opens detail overlay)
   - When "View Details" clicked: detail overlay or inline expansion shows:
     - Session JSON (raw): `{"id": "abc123", "timestamp": 1724687025, "duration": 45.2, ...}`
     - Chunks list: "11 chunks" (link to Chunks tab filtered by this session)
     - Snips list: "4 snips" (link to Snips tab filtered by this session)
     - Transcripts: "4 transcripts" (link to Transcripts tab filtered by this session)
     - "Delete Session" button (red, only visible in sandbox write mode, deletes session + cascades to chunks/snips/volume profiles/transcripts)
   - Pagination: "Showing 1–50 of 127 sessions" (prev/next buttons if > 50)
   - If no sessions: "No sessions found. (Create one with capture or import fixture data.)"

4. **Chunks tab**:
   - Heading: "All Chunks"
   - Filters: "Filter by session: All / [dropdown: abc123, xyz789, ...]", "Sort by: startTime asc"
   - Chunks table:
     - Column 1: Chunk ID (e.g., "chunk-0", "chunk-1")
     - Column 2: Session ID (e.g., "abc123", link to Sessions tab)
     - Column 3: Start time (e.g., "0.0s", "4.2s", "8.5s")
     - Column 4: Duration (e.g., "4.2s")
     - Column 5: Byte size (e.g., "32,768 bytes")
     - Column 6: Has volume profile? ("Yes ✓" green / "No" gray)
     - Column 7: "Play" button (plays chunk via inline HTML5 audio element, reads blob from IndexedDB)
   - When "Play" clicked: audio element appears below row, plays chunk audio, "Stop" button replaces "Play"
   - If filtered by session: "Showing 11 chunks from session abc123" (table only shows chunks for that session, sorted by startTime)

5. **Snips tab**:
   - Heading: "All Snips"
   - Filters: "Filter by session: All / [dropdown]", "Show only: With transcripts / Without transcripts / All"
   - Snips table:
     - Column 1: Snip ID (e.g., "snip-0", "snip-1")
     - Column 2: Session ID (link)
     - Column 3: Start time → End time (e.g., "0.0s → 12.3s")
     - Column 4: Duration (e.g., "12.3s")
     - Column 5: Chunk refs (e.g., "chunks 0–2")
     - Column 6: Has transcript? ("Yes ✓" green / "No" gray)
     - Column 7: Transcript preview (first 50 chars, e.g., "This is the transcribed text from the...")
     - Column 8: "Play" button (plays snip via playback-engine fixture or inline audio, reads chunk blobs from IndexedDB and concatenates)
   - When snip row clicked: detail overlay shows full transcript text (if exists), snip JSON, chunk refs with byte ranges

6. **Volume Profiles tab**:
   - Heading: "All Volume Profiles"
   - Filters: "Filter by session: All / [dropdown]"
   - Volume profiles table:
     - Column 1: Chunk ID (link to Chunks tab)
     - Column 2: Session ID (link)
     - Column 3: Max volume (e.g., "85%")
     - Column 4: Avg volume (e.g., "42%")
     - Column 5: Sample count (e.g., "102 samples")
     - Column 6: "View Waveform" button (opens overlay with line graph: X = time, Y = volume, data from volumeSamples Float32Array)
   - When "View Waveform" clicked: modal/overlay appears with volume waveform graph (same as volume-analyzer demo waveform panel)

7. **Transcripts tab**:
   - Heading: "All Transcripts"
   - Filters: "Filter by session: All / [dropdown]"
   - Transcripts table:
     - Column 1: Transcript ID (e.g., "transcript-0")
     - Column 2: Snip ID (link to Snips tab)
     - Column 3: Session ID (link)
     - Column 4: Text preview (first 100 chars)
     - Column 5: Language (e.g., "en")
     - Column 6: "View Full" button (opens overlay with full transcript text, copyable)
   - When "View Full" clicked: modal with full transcript text (large readable font), "Copy to Clipboard" button

8. **Storage tab**:
   - Heading: "Storage Management"
   - Storage quota panel (top):
     - "Total storage used: 127 MB / 500 MB device storage" (progress bar, green if < 80%, yellow if 80–95%, red if > 95%)
     - Breakdown by table:
       - Sessions: "45 MB (127 sessions)"
       - Chunks: "75 MB (1,245 chunks)"
       - Volume Profiles: "3 MB (1,245 profiles)"
       - Snips: "2 MB (348 snips)"
       - Transcripts: "2 MB (348 transcripts)"
   - Retention policy panel (middle):
     - Heading: "Retention Policy"
     - "Storage cap setting: 500 MB" (input, editable in sandbox write mode)
     - "Oldest session: 2026-07-15 14:23:45" (link to session)
     - "Enforce Retention Policy" button (cyan, click → simulates retention: shows which sessions would be deleted to get under cap, does NOT actually delete in read-only mode; in sandbox write mode, deletes with confirmation)
     - After "Enforce" clicked (simulation in read-only): "Simulation: 12 sessions would be deleted (oldest first), freeing 45 MB. No changes made (read-only mode)."
     - After "Enforce" clicked (sandbox write mode, confirmed): "Deleted 12 sessions, freed 45 MB. Storage now: 82 MB / 500 MB."
   - Cleanup panel (bottom):
     - "Orphaned data detector" (runs scan, finds chunks/snips/volume profiles/transcripts without parent sessions)
     - "Scan for orphaned data" button (click → scans IndexedDB, reports: "3 orphaned chunks, 1 orphaned transcript")
     - "Clean Up Orphaned Data" button (red, only enabled if orphans found and sandbox write mode on, deletes orphans with confirmation)
     - "Clear All Demo Data" button (red, only visible in sandbox write mode, deletes all sessions/chunks/snips/profiles/transcripts with "DEMO-" prefix, shows confirmation modal "Delete 23 demo sessions and all related data?")
     - "Export All Data" button (cyan, exports entire IndexedDB as JSON, downloads file)
     - "Import Fixture Data" button (cyan, uploads JSON, writes to IndexedDB in sandbox write mode, loads 5–10 fixture sessions with chunks/snips/transcripts)

9. **Query Console tab**:
   - Heading: "Ad-Hoc Queries"
   - Query input panel (top):
     - "Method" dropdown: "getSession", "listSessions", "getChunksForSession", "writeChunk", "writeSnip", etc. (all session-store interface methods)
     - Parameter inputs (dynamic, change based on selected method):
       - Example: "getSession" → "Session ID: [input: abc123]"
       - Example: "listSessions" → "Limit: [input: 50]", "Offset: [input: 0]", "Sort by: [dropdown: timestamp desc]"
     - "Execute Query" button (cyan, click → calls selected method with parameters, displays result below)
   - Query result panel (bottom):
     - Result type: "Success ✓" green / "Error ✗" red
     - Result data (JSON, formatted, syntax-highlighted): `{"id": "abc123", "timestamp": 1724687025, ...}`
     - Timing: "Query executed in 12ms"
     - "Copy Result" button (copies JSON to clipboard)
   - Query history (sidebar, last 10 queries):
     - "getSession(abc123) - Success ✓ 2 min ago"
     - "listSessions(limit=50) - Success ✓ 5 min ago"
     - Click on history item: re-loads that query into input panel (does not auto-execute)

10. **Capture integration panel** (overlay, only visible when "Live from Capture" mode enabled):
    - When "Enable Writes (Sandbox)" is checked AND "Live from Capture" toggle is checked (appears below write toggle):
      - Overlay panel slides in from right (or bottom): "Capture Audio → Store"
      - Mini capture controls: "Start Capture", "Stop Capture", "Audio Source: Simulated PCM"
      - When "Start Capture" clicked: capture begins, chunks encode every ~4s, session-store.createSession() called (writes real session to IndexedDB with "DEMO-capture-" prefix), session-store.writeChunk() called for each chunk (writes real chunks to IndexedDB)
      - Live feedback: "Session DEMO-capture-1234 created, writing chunks... (Chunk 0 written, Chunk 1 written, ...)"
      - When "Stop Capture" clicked: capture stops, final chunk flushes, session complete
      - "View Created Session" button (link to Sessions tab, filtered to show DEMO-capture-1234)
    - Proves the full capture → session-store write flow: capture-engine calls session-store interfaces, data lands in IndexedDB, store inspector shows it immediately in Sessions/Chunks tabs

**Before state** (page load, Real read-only mode, Sessions tab):
- Top chrome: "READ-ONLY" chip (gray), storage quota "127 MB / 500 MB"
- Sessions tab active: table shows 127 sessions (from prior PWA usage or other demos), sorted by timestamp desc, paginated
- Write toggle: unchecked (off)

**After state** (Real read-only, Sessions tab, session abc123 details viewed):
- Sessions tab: row for abc123 expanded, detail overlay shows session JSON, "11 chunks" link, "4 snips" link, "4 transcripts" link
- "Delete Session" button NOT visible (read-only mode)

**After state** (Sandbox write mode enabled, Storage tab, retention policy enforced):
- Top chrome: "SANDBOX WRITE ENABLED" chip (red), storage quota "82 MB / 500 MB" (reduced after enforcement)
- Storage tab active: "Deleted 12 sessions, freed 45 MB" confirmation message (green)
- Sessions tab (if switched back): 12 oldest sessions no longer in table (deleted)

**After state** (Sandbox write + Live from Capture mode, captured 12.5s audio):
- Top chrome: "LIVE FROM CAPTURE (writing)" chip (yellow during capture, red after stop)
- Capture overlay: "Session DEMO-capture-1234 created, Chunks: 3, Duration: 12.5s, ✓ Complete"
- "View Created Session" clicked → Sessions tab, filtered to DEMO-capture-1234, row shows session with 3 chunks
- Chunks tab, filtered by DEMO-capture-1234: 3 rows (chunk 0, 1, 2 with start/end times, byte sizes, all have "Play" buttons)

**Walkthrough value**: Proves that session-store is the durable IndexedDB authority, all store interfaces work correctly (read sessions, chunks, snips, volume profiles, transcripts; write sessions/chunks/profiles/snips/transcripts in sandbox mode), data relationships are correct (chunks belong to sessions, snips reference chunks, transcripts attach to snips), retention policy enforcement deletes oldest sessions when cap exceeded, orphaned data detector finds and cleans up orphans, storage quota is respected, and the full capture → store → inspect flow works (when live capture is integrated). Operator can inspect real sessions (read-only, from prior PWA usage), create sandbox demo sessions (sandbox write mode), or capture live audio and watch it land in IndexedDB immediately (live from capture mode).

**Optional capture integration** (Live from Capture mode): Session-store demo MAY include capture-engine as a demo dependency. When "Enable Writes (Sandbox)" is checked and "Live from Capture" toggle is enabled, a capture overlay panel appears. Operator clicks "Start Capture" → capture-engine acquires mic (or uses simulated PCM) → encodes chunks → calls session-store.createSession() and session-store.writeChunk() for each chunk → chunks land in real IndexedDB with "DEMO-capture-" prefix → operator clicks "Stop Capture" → session complete → clicks "View Created Session" → Sessions tab shows new session with all chunks. Proves session-store interfaces work end-to-end when called by capture-engine. Sandbox sessions can be deleted with "Clear All Demo Data" button.

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

- **Runtime**: Web app (local dev server, factory floor)
- **Device**: Desktop browser viewport (wider factory floor, not phone-shaped)
- **Launch**: `cd packages/lib/recording-pipeline/isolation-demo && npm start`
- **Data mode**: **In-memory only** (no IndexedDB, no audio-store writes). Reset discards all. Chunks live in RAM as a demo session object until browser tab closes or Reset is clicked. This demo exercises the CORE LOGIC (acquire mic, capture PCM, encode chunks, detect failures) without the audio-store integration. Store integration is proven in audio-store's Isolation Demo or the final PWA.
- **Safe default**: In-memory with simulated PCM stream (no mic permission required by default)

**Panel-based layout** (same 5-region structure as Alternative A capture-engine, relabeled for recording-pipeline):

1. **Top chrome panel** (fixed header, spans full width):
   - Left: "Recording Pipeline Isolation Demo" heading (bold)
   - Center: Data mode chip "IN-MEMORY (not persisted)" (cyan border, white text)
   - Right: Microphone permission status ("Granted" green / "Denied" red / "Not requested" gray)

2. **Control panel** (left third of viewport, below chrome):
   - "Start Recording" button (cyan, full-width in panel, disabled when recording active)
   - "Stop Recording" button (red, full-width, disabled when recording idle)
   - "Reset" button (gray, full-width, clears RAM chunks + resets state; always enabled)
   - Audio source toggle: "Live Microphone" vs "Simulated PCM stream" (radio buttons or toggle switch)
     - Live Microphone: requests permission, uses real mic input (user must speak)
     - Simulated PCM: generates synthetic audio waveform (no mic needed, automatic "speech")
   - When "Start Recording" clicked → button disables, "Stop Recording" enables, live meters start updating, watchdog timer starts (10s countdown), chunks begin encoding every ~4s
   - When "Stop Recording" clicked → recording stops, final chunk flushes, buttons reset (Start enabled, Stop disabled), meters freeze at final values

3. **Live meters panel** (center third, below chrome):
   - Duration counter: "Duration: 0.00s" (updates every frame from PCM sample count, NOT wall clock)
   - PCM buffer fill: Horizontal progress bar "PCM buffer: 1024 / 2048 samples" (fills and drains as encode happens)
   - Chunks encoded: "Chunks: 0" (increments when each chunk encodes: 0 → 1 → 2 → 3...)
   - Watchdog countdown: "Watchdog: 10.0s" (counts down from 10s; if reaches 0 before first chunk encodes, recording auto-stops with "no audio received" error)
   - When recording active: all meters update in real-time (duration climbs, buffer fills/drains, chunk count increments, watchdog resets after first chunk or counts down if mic silent)
   - When recording stops: meters freeze at final values (duration = total, buffer = 0 or remainder, chunks = final count, watchdog = "N/A")

4. **Chunk tape panel** (right third, below chrome, scrollable list):
   - Heading: "In-Memory Chunks (RAM only)" (small gray text)
   - List of encoded chunks (grows as recording runs; each chunk is a row):
     - Column 1: Seq number (0, 1, 2, 3...)
     - Column 2: Start time (e.g., "0.00s", "4.12s", "8.24s")
     - Column 3: End time (e.g., "4.12s", "8.24s", "12.35s")
     - Column 4: Byte length (e.g., "32,768 bytes", "31,245 bytes")
     - Column 5: "Play" button (inline, plays THIS chunk's in-memory blob via HTML5 audio; does NOT call playback-engine or audio-store)
   - When "Start Recording" clicked and first chunk encodes (~4s): first row appears (Seq 0, Start 0.00s, End ~4.0s, ~32KB, Play button)
   - When each subsequent chunk encodes: new row appears below (Seq 1, Seq 2, etc.)
   - When "Reset" clicked: entire list clears (no rows), in-memory blobs are discarded
   - Scrolls vertically if > ~10 chunks (keeps growing until Reset or tab close)

5. **Event/failure panel** (bottom strip, spans full width, secondary disclosure):
   - Collapsible section (collapsed by default): "Show Event Feed ▶" (click to expand → "Hide Event Feed ▼")
   - When expanded: scrollable log of events (most recent at bottom, autoscrolls):
     - `recordingStarted(sessionId=demo-12345)` (blue, timestamp)
     - `chunkEncoded(seq=0, duration=4.12s, bytes=32768)` (green text, timestamp)
     - `chunkEncoded(seq=1, duration=4.11s, bytes=31245)` (green)
     - `recordingError(reason="no_audio_received", watchdog_timeout=10s)` (red, if mic silent for 10s)
     - `recordingStopped(sessionId=demo-12345, totalChunks=7, totalDuration=28.5s, hasAudio=true)` (blue)
   - When collapsed: only heading visible ("Show Event Feed ▶"), no vertical space used
   - NOT the main product of this demo (chunk tape is the product); event feed is diagnostic/telemetry for debugging

**Before state** (page load, recording idle):
- Control panel: "Start Recording" enabled (cyan), "Stop Recording" disabled (gray), "Reset" enabled, audio source = "Simulated PCM" by default
- Live meters: Duration 0.00s, PCM buffer 0 / 2048, Chunks 0, Watchdog N/A (not started)
- Chunk tape: Empty (no rows), heading visible ("In-Memory Chunks (RAM only)")
- Event feed: Collapsed, no events yet

**After state** (after Start → speak/simulate for 12s → Stop):
- Control panel: "Start Recording" enabled (ready for next recording), "Stop Recording" disabled, "Reset" enabled
- Live meters: Duration 12.35s (frozen), PCM buffer 0 / 2048 (flushed), Chunks 3, Watchdog N/A (stopped)
- Chunk tape: 3 rows visible (Seq 0, 1, 2 with start/end times, byte lengths, Play buttons)
- Event feed: (if expanded) shows `recordingStarted`, 3 `chunkEncoded` events, `recordingStopped` event

**Walkthrough value**: Proves that recording-pipeline acquires audio (live mic or simulated), encodes MP3 chunks every ~4s, keeps them in memory temporarily (NOT persisted to store), provides duration from PCM sample count (not wall clock), detects mic ghost (watchdog timeout), and flushes final chunk < 4s on stop. Operator can play each chunk immediately from RAM to verify encoding worked. Reset discards everything (proves in-memory, not durable).

**What this demo does NOT do**: Does not call audio-store. Does not write to IndexedDB. Does not create sessions. Recording-pipeline's public interface is `startRecording()` which internally creates a session via audio-store and writes chunks; this demo exercises the CORE LOGIC (acquire mic, capture PCM, encode chunks, detect failures) without the storage integration. Storage integration is proven in audio-store's Isolation Demo (which includes recording-pipeline as a demo dependency, writing to real IndexedDB in sandbox mode) or the final PWA.

---

### packages/lib/playback-engine

**Boundary**: Plays audio from sessions, chunks, or snips. Reads audio blobs from audio-store, reassembles them if needed, provides playback controls. Does NOT capture, encode, analyze, or transcribe. (Same as Alternative A playback-engine, but data source is audio-store instead of session-store.)

**Main callable interfaces**: (Same as Alternative A, but reading from audio-store)

- `playSession(sessionId)` → playback controller
- `playChunk(chunkId)` → playback controller
- `playSnip(snipId)` → playback controller
- Events emitted: `playbackStarted`, `playbackEnded`, `playbackError`

**Isolation Demo**: Same panel-based layout as Alternative A playback-engine (see Alternative A for full 5-region detail), but reads from **audio-store** instead of session-store.

- **Runtime**: Web app (local dev server, factory floor)
- **Device**: Desktop browser viewport
- **Launch**: `cd packages/lib/playback-engine/isolation-demo && npm start`
- **Data mode**: Fixture by default (3–5 pre-recorded fixture sessions), "Use Real Sessions" (read-only audio-store access), "Live from Capture" (recording-pipeline produces audio in-memory, playback immediately, no persist)
- **Safe default**: Fixture mode
- **Panel structure** (see Alternative A playback-engine for full component/behavior detail):
  1. Top chrome: Data mode chip, mode selector
  2. Item selection: Fixture items (Sessions/Chunks/Snips tabs), Real Sessions dropdown, or Live from Capture mini recording controls
  3. Playback control: Play/Pause/Stop buttons, seek bar with scrubber, current/total time, volume slider
  4. Waveform visualization: Blue waveform with red vertical line (current playback position)
  5. Playback queue/history: Recently played items, currently playing indicator
  6. Audio buffer inspector: Loaded chunks, byte ranges, decode status, gap detection, reassembly timing
  7. Event feed: playbackStarted, playbackEnded, playbackError, seek logs

**Walkthrough value**: Proves that playback-engine loads audio from audio-store (session reassembles chunks, single chunk, snip concatenates chunks), plays audio from speakers, provides standard playback controls (play, pause, stop, seek), accurately reflects duration from chunk metadata, handles chunk reassembly correctly (no gaps or time skips), detects gaps/missing chunks and reports errors, and syncs waveform visualization with current playback position. Operator can use fixtures, real sessions (read-only from audio-store), or live-captured audio (in-memory from recording-pipeline) without launching the PWA.

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

**Isolation Demo**: Same panel-based layout as Alternative A volume-analyzer (see Alternative A for full 6-region detail with optional capture integration), but reads from **audio-store** instead of session-store and is named "Speech Segmentation" instead of "Volume Analyzer".

- **Runtime**: Web app (local dev server, factory floor)
- **Device**: Desktop browser viewport
- **Launch**: `cd packages/lib/speech-segmentation/isolation-demo && npm start`
- **Data mode**: Fixture by default (pre-recorded test chunks with known volume patterns), "Use Real Sessions" (read-only audio-store access), "Live from Capture" (recording-pipeline produces audio in-memory, analyzes immediately, no persist)
- **Safe default**: Fixture mode (3–5 sample chunks: speech, silence, mixed, music, quiet speech)
- **Panel structure** (see Alternative A volume-analyzer for full component/behavior detail):
  1. Top chrome: "Speech Segmentation Isolation Demo" heading, data mode chip, mode selector
  2. Input selection: Fixture chunks (radio list), Real Sessions (dropdown → session → chunks), or Live from Capture (mini recording controls)
  3. Volume waveform (single-chunk view): X-axis = time, Y-axis = volume, green line with quiet regions shaded, max/avg volume metadata
  4. Session histogram (session-level view): Blue bars (one per chunk), vertical red lines (snip boundaries), snip labels
  5. Volume profile data: Chunk/session metadata, duration, sample count, max/avg volume, expandable JSON (volume array, snip boundaries)
  6. Algorithm tuning (secondary): Snip threshold slider (0–100%), min/max snip duration inputs, "Rerun Snip Proposal" button
  7. Event feed: volumeAnalysisComplete, snipsProposed, decode timing, algorithm decision logs

**Walkthrough value**: Proves that speech-segmentation decodes chunks from audio-store, computes volume profiles (samples over time), visualizes volume waveforms and histograms, identifies quiet regions accurately, proposes snip boundaries based on threshold (algorithmic, not AI), and allows tuning parameters to see impact on snip proposals. Operator can use fixtures (safe, repeatable), real sessions (read-only from audio-store), or live-captured audio (in-memory from recording-pipeline) without launching the PWA.

**Optional recording integration** (Live from Capture mode): Speech-segmentation demo MAY include recording-pipeline as a demo dependency. When "Live from Capture" mode is selected, mini recording controls appear. Operator starts recording → speaks or uses simulated PCM → stops recording → captured chunks live in RAM → clicks "Analyze Captured Audio" → volume profiles computed → histogram displays → clicks "Propose Snips" → snip boundaries proposed. Proves the full recording → volume analysis → snip proposal flow without persisting to audio-store. Discarded when page reloads or mode changes.

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

**Isolation Demo**: Similar panel-based layout to Alternative A transcription-client (see Alternative A for 8-region detail), but with enhanced batch queue features (session-level transcription with progress tracking, retry logic, partial failure recovery) and reads from **audio-store** + writes to **transcript-store** instead of session-store.

- **Runtime**: Web app (local dev server, factory floor)
- **Device**: Desktop browser viewport
- **Launch**: `cd packages/lib/transcription-service/isolation-demo && npm start`
- **Data mode**: Fixture by default (5–10 sample speech audio clips with known correct transcripts), "Use Real Snips" (read-only audio-store for snip blobs, real-write transcript-store in sandbox mode), "Live from Capture" (recording-pipeline produces audio in-memory, transcribes immediately, no persist to audio-store but MAY write to transcript-store in sandbox mode)
- **Safe default**: Fixture mode with example Groq test key (clearly labeled "Demo key, may be rate-limited")
- **Panel structure** (see Alternative A transcription-client for similar layout; transcription-service adds batch queue sophistication):
  1. Top chrome: "Transcription Service Isolation Demo" heading, data mode chip, API key validation status
  2. API key panel: Groq API key input (masked, "Show" toggle), "Validate Key" button, validation result (valid ✓ green / invalid ✗ red / missing gray), help text with demo key notice
  3. Audio input selection: Fixture audio clips (radio list with Play buttons), Real Snips (session dropdown → snip dropdown, Play button), or Live from Capture (mini recording controls → captured audio → "Use Captured Audio")
  4. Transcription control: "Transcribe" button (cyan, disabled if no audio OR invalid key OR in progress), status indicator (Idle / In progress with elapsed time / Complete / Failed), "Abort" button (red, only visible during in progress)
  5. Transcript output: Placeholder (idle) / "Transcribing..." spinner (in progress) / Transcript text with metadata (language, duration, confidence) + "Copy to Clipboard" button (complete) / Error message + "Retry" button (failed)
  6. **Batch queue panel** (right sidebar, enhanced for transcription-service):
     - Heading: "Session Transcription Queue" (for batch session-level transcription)
     - When session selected (Real Snips mode): "Session abc: 45.2s, 4 snips" metadata, "Transcribe All Snips" button (adds all 4 snips to queue)
     - Queue list (rows, one per snip in batch):
       - Snip 1: "Snip 0 (0–12.3s) - Complete ✓" (green, transcript preview)
       - Snip 2: "Snip 1 (12.3–28.7s) - In progress... 2.3s" (yellow, spinner, progress bar)
       - Snip 3: "Snip 2 (28.7–41.0s) - Queued" (gray, waiting)
       - Snip 4: "Snip 3 (41.0–45.2s) - Failed ✗ Rate limit exceeded" (red, "Retry" button)
     - Batch progress: "3 / 4 snips transcribed (75%), 1 failed" (summary at bottom of queue)
     - "Abort All" button (red, stops batch, cancels queued snips, aborts in-progress snip)
     - "Retry Failed" button (cyan, retries only failed snips in queue)
     - When batch completes: "Session transcription complete: 3 success, 1 failed" (green/yellow)
  7. Network telemetry (secondary): API request timing, retry count (increments on network failure), rate limit status (OK / WARNING / EXCEEDED), raw Groq API response JSON (expandable), simulated failure toggle
  8. Event feed (secondary): transcriptionStarted, snipTranscribed, transcriptionComplete, transcriptionError, batch queue depth logs

**Walkthrough value**: Proves that transcription-service validates Groq API keys correctly (accepts valid, rejects invalid with specific error), sends audio to Groq Whisper API, receives transcript text with metadata, handles errors clearly (network timeout, invalid key, rate limit), supports retry, **handles session-level batch transcription** (queues all snips for a session, transcribes sequentially or in parallel, tracks progress per snip, reports partial failures, allows retry of only failed snips, allows aborting entire batch), and writes transcripts to transcript-store (in sandbox write mode). Operator can use fixtures (safe, known correct transcripts for comparison), real snips (read-only from audio-store, writes to transcript-store in sandbox mode), or live-captured audio (in-memory from recording-pipeline) without launching the PWA.

**Optional recording integration** (Live from Capture mode): Transcription-service demo MAY include recording-pipeline as a demo dependency. When "Live from Capture" mode is selected, mini recording controls appear. Operator captures live speech → stops → captured audio (in-memory chunks) → must first use speech-segmentation to propose snips from in-memory chunks → then selects snips → transcribes → sees transcripts. Proves the full recording → segmentation → transcription flow without persisting audio to audio-store (transcripts MAY be written to transcript-store in sandbox mode if enabled, but linked to in-memory snip IDs that won't persist).

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

**Isolation Demo** (Store Inspector): Same multi-tab panel-based layout as Alternative A session-store (see Alternative A for full 10-region detail with tabs and optional capture integration), but named "Audio Store" and only stores **audio-related data** (sessions, chunks, volume profiles, snips). Does NOT store transcripts (transcript-store owns those).

- **Runtime**: Web app (local dev server, factory floor)
- **Device**: Desktop browser viewport (store inspector needs table space)
- **Launch**: `cd packages/datastore/audio-store/isolation-demo && npm start`
- **Data mode**: Real read-only by default (shows actual IndexedDB audio data from this browser, no mutations), "Enable Writes (Sandbox)" toggle (writes to real IndexedDB with "DEMO-" prefix), "Live from Capture" (includes recording-pipeline, produces audio and writes to real IndexedDB with sandbox labels)
- **Safe default**: Real read-only
- **Panel structure** (see Alternative A session-store for full component/behavior detail; audio-store has same 6 tabs but NO Transcripts tab):
  1. Top chrome: "Audio Store Isolation Demo" heading, data mode chip (READ-ONLY / SANDBOX WRITE / LIVE FROM CAPTURE), storage quota display, write mode toggle
  2. **Tab navigation**: Sessions, Chunks, Snips, Volume Profiles, Storage, Query Console (NO Transcripts tab; transcripts live in transcript-store)
  3. **Sessions tab**: Paginated table (sessionId, timestamp, duration, chunk count, snip count), filters, "View Details" button → detail overlay (session JSON, chunks/snips links, "Delete Session" in sandbox write mode)
  4. **Chunks tab**: Table (chunkId, sessionId, startTime, duration, byteSize, has volume profile?, "Play" button), filterable by session
  5. **Snips tab**: Table (snipId, sessionId, startTime→endTime, duration, chunkRefs, "Play" button), filterable by session (NO transcript preview column; transcripts are in transcript-store)
  6. **Volume Profiles tab**: Table (chunkId, sessionId, maxVolume, avgVolume, sampleCount, "View Waveform" button → waveform overlay)
  7. **Storage tab**: Storage quota display, breakdown by audio tables (sessions, chunks, volume profiles, snips), retention policy panel ("Enforce Retention Policy" button → simulates or deletes in sandbox write), cleanup panel (orphaned data detector, "Clear All Demo Data", export/import)
  8. **Query Console tab**: Method dropdown (getSession, listSessions, getChunksForSession, writeChunk, writeSnip, etc.), parameter inputs, "Execute Query" button, result panel (JSON, timing, success/error), query history
  9. **Capture integration panel** (overlay, when "Enable Writes (Sandbox)" + "Live from Capture" toggled): Mini recording controls → "Start Recording" → recording-pipeline begins → session-store.createSession() + writeChunk() called → chunks land in real IndexedDB with "DEMO-capture-" prefix → "Stop Recording" → "View Created Session" → Sessions tab shows new session with all chunks

**Walkthrough value**: Proves that audio-store is the durable IndexedDB authority for audio data, all audio-store interfaces work correctly (read sessions/chunks/snips/volume profiles; write sessions/chunks/profiles/snips in sandbox mode), data relationships are correct (chunks belong to sessions, snips reference chunks, volume profiles attach to chunks), retention policy deletes oldest sessions when cap exceeded, orphaned data detector finds and cleans orphans, storage quota is respected, and the full recording → audio-store → inspect flow works (when live recording is integrated). Operator can inspect real sessions (read-only, from prior PWA usage), create sandbox demo sessions (sandbox write mode), or capture live audio and watch it land in IndexedDB immediately (live from capture mode).

**Optional recording integration** (Live from Capture mode): Audio-store demo MAY include recording-pipeline as a demo dependency. When "Enable Writes (Sandbox)" is checked and "Live from Capture" toggle is enabled, a recording overlay panel appears. Operator clicks "Start Recording" → recording-pipeline acquires mic (or uses simulated PCM) → encodes chunks → calls audio-store.createSession() and audio-store.writeChunk() for each chunk → chunks land in real IndexedDB with "DEMO-capture-" prefix → operator clicks "Stop Recording" → session complete → clicks "View Created Session" → Sessions tab shows new session with all chunks. Proves audio-store interfaces work end-to-end when called by recording-pipeline. Sandbox sessions can be deleted with "Clear All Demo Data" button.

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

- **Runtime**: Web app (local dev server, factory floor)
- **Device**: Desktop browser viewport (store inspector needs table space)
- **Launch**: `cd packages/datastore/transcript-store/isolation-demo && npm start`
- **Data mode**: Real read-only by default (shows actual IndexedDB transcript data from this browser, no mutations), "Enable Writes (Sandbox)" toggle (writes to real IndexedDB, clearly labeled as sandbox/test), "Live from Transcription-Service" (includes transcription-service as demo dependency, transcribes fixture or captured audio, writes transcripts to real IndexedDB with sandbox labels)
- **Safe default**: Real read-only

**Panel-based layout (4 tabs + chrome):**

1. **Top chrome panel** (fixed header, spans full width):
   - Left: "Transcript Store Isolation Demo" heading
   - Center: Data mode chip "READ-ONLY" / "SANDBOX WRITE ENABLED" / "LIVE FROM TRANSCRIPTION-SERVICE (writing)" (red chip when writes enabled)
   - Right: Transcript count "348 transcripts across 127 sessions" (reads from IndexedDB)
   - Write mode toggle (right, below count): "Enable Writes (Sandbox)" checkbox (off by default, red when on)

2. **Tab navigation** (below chrome, horizontal tabs):
   - "Transcripts" (active by default)
   - "Transcription Status"
   - "Failed Transcriptions"
   - "Query Console"
   - Active tab: cyan underline, bold text

3. **Transcripts tab** (default active):
   - Heading: "All Transcripts"
   - Filters: "Filter by session: All / [dropdown]", "Sort by: Created desc", "Limit: 50"
   - Transcripts table (scrollable, paginated):
     - Column 1: Transcript ID (e.g., "transcript-0", "transcript-1")
     - Column 2: Snip ID (e.g., "snip-0", link to audio-store snips in new tab if available)
     - Column 3: Session ID (e.g., "abc123", link to audio-store sessions)
     - Column 4: Text preview (first 100 chars, e.g., "This is the transcribed text from the audio clip...")
     - Column 5: Language (e.g., "en", "es", "fr")
     - Column 6: Created at (timestamp, e.g., "2026-08-26 14:23:45")
     - Column 7: "View Full" button (click → opens overlay with full transcript text, "Copy to Clipboard" button)
   - When "View Full" clicked: modal overlay appears with full transcript text (large readable font, ~16px), metadata (snipId, sessionId, language, confidence if available, createdAt), "Copy to Clipboard" button (copies text → shows "Copied!" toast)
   - Pagination: "Showing 1–50 of 348 transcripts" (prev/next buttons if > 50)
   - If no transcripts: "No transcripts found. (Create one with transcription-service or import fixture data.)"

4. **Transcription Status tab**:
   - Heading: "Transcription Status by Session"
   - Filters: "Filter by status: All / Fully transcribed / Partially transcribed / Not started / Failed"
   - Transcription status table:
     - Column 1: Session ID (link to audio-store sessions)
     - Column 2: Total snips (e.g., "8")
     - Column 3: Transcribed snips (e.g., "7" green / "8" green / "0" gray)
     - Column 4: Pending snips (e.g., "0" gray / "1" yellow)
     - Column 5: Failed snips (e.g., "1" red / "0" gray)
     - Column 6: Last transcribed at (timestamp or "—" if none)
     - Column 7: Status badge ("Fully transcribed ✓" green / "Partial 7/8" yellow / "Not started" gray / "Failed ✗" red)
     - Column 8: "View Session Transcripts" button (link to Transcripts tab filtered by this session)
   - When row clicked: detail overlay shows full status breakdown per snip (Snip 0: transcribed ✓, Snip 1: transcribed ✓, Snip 2: failed ✗ "Rate limit exceeded", etc.)

5. **Failed Transcriptions tab**:
   - Heading: "Failed Transcriptions"
   - Filters: "Filter by session: All / [dropdown]", "Sort by: Attempted desc"
   - Failed transcriptions table:
     - Column 1: Snip ID (link to audio-store snips)
     - Column 2: Session ID (link to audio-store sessions)
     - Column 3: Failure reason (e.g., "Rate limit exceeded", "Network timeout", "Invalid API key", "Audio decode error")
     - Column 4: Attempted at (timestamp, e.g., "2026-08-26 14:23:45")
     - Column 5: Retry count (e.g., "3 retries" or "No retries yet")
     - Column 6: "Retry" button (red, only enabled in sandbox write mode, calls transcription-service to retry this snip)
   - When "Retry" clicked (sandbox write mode): transcription-service attempts to transcribe snip again → on success, row disappears from Failed tab and new transcript appears in Transcripts tab → on failure, failure reason updates and retry count increments
   - If no failed transcriptions: "No failed transcriptions. All snips transcribed successfully!"

6. **Query Console tab**:
   - Heading: "Ad-Hoc Queries"
   - Query input panel:
     - "Method" dropdown: "getTranscript", "getTranscriptsForSession", "getTranscriptionStatus", "writeTranscript", "markTranscriptionFailed" (all transcript-store interface methods)
     - Parameter inputs (dynamic, change based on selected method):
       - Example: "getTranscript" → "Snip ID: [input: snip-0]"
       - Example: "getTranscriptsForSession" → "Session ID: [input: abc123]"
       - Example: "writeTranscript" (sandbox write mode only) → "Snip ID: [input]", "Text: [textarea]", "Language: [input: en]"
     - "Execute Query" button (cyan, click → calls selected method, displays result below)
   - Query result panel:
     - Result type: "Success ✓" green / "Error ✗" red
     - Result data (JSON, formatted): `[{"snipId": "snip-0", "text": "...", "language": "en", ...}]`
     - Timing: "Query executed in 8ms"
     - "Copy Result" button (copies JSON)
   - Query history (sidebar, last 10): "getTranscriptsForSession(abc123) - Success ✓ 2 min ago", click to reload

7. **Transcription-service integration panel** (overlay, only visible when "Live from Transcription-Service" mode enabled):
   - When "Enable Writes (Sandbox)" is checked AND "Live from Transcription-Service" toggle is checked (appears below write toggle):
     - Overlay panel slides in: "Transcribe Audio → Store"
     - Mini transcription-service controls: API key input (pre-filled with demo key), audio source selector (Fixture audio / Upload file / Live from Capture), "Transcribe" button
     - When "Transcribe" clicked: transcription-service validates key → sends audio to Groq → receives transcript → calls transcript-store.writeTranscript() → transcript lands in real IndexedDB with DEMO label
     - Live feedback: "Transcribed snip DEMO-snip-1234, wrote transcript to store" (green)
     - "View Created Transcript" button (link to Transcripts tab, filtered to show DEMO-snip-1234 transcript)
   - Proves the full transcription-service → transcript-store write flow: transcription-service calls transcript-store interfaces, transcripts land in IndexedDB, store inspector shows them immediately in Transcripts tab

**Before state** (page load, Real read-only mode, Transcripts tab):
- Top chrome: "READ-ONLY" chip (gray), transcript count "348 transcripts"
- Transcripts tab active: table shows 348 transcripts (from prior PWA usage or other demos), sorted by created desc, paginated
- Write toggle: unchecked (off)

**After state** (Real read-only, Transcription Status tab, session abc123 viewed):
- Transcription Status tab: row for abc123 shows "Session abc123: 8 snips, 7 transcribed, 0 pending, 1 failed, Status: Partial 7/8" (yellow)
- "View Session Transcripts" clicked → Transcripts tab, filtered by abc123, shows 7 transcript rows

**After state** (Sandbox write mode, Failed Transcriptions tab, snip-7 retried successfully):
- Top chrome: "SANDBOX WRITE ENABLED" chip (red)
- Failed Transcriptions tab: row for snip-7 disappears (no longer failed)
- Transcripts tab (if switched): new row for snip-7 transcript appears (green, just created)
- Transcription Status tab (if switched): session abc123 now shows "8 transcribed, 0 failed, Status: Fully transcribed ✓" (green)

**After state** (Sandbox write + Live from Transcription-Service mode, transcribed fixture audio):
- Top chrome: "LIVE FROM TRANSCRIPTION-SERVICE (writing)" chip (yellow during transcription, red after write)
- Transcription-service overlay: "Transcribed snip DEMO-snip-1234, wrote transcript to store ✓" (green confirmation)
- "View Created Transcript" clicked → Transcripts tab, filtered to DEMO-snip-1234, row shows transcript with text preview
- "View Full" clicked → modal shows full transcript text from Groq

**Walkthrough value**: Proves that transcript-store is the durable IndexedDB authority for transcripts, all transcript-store interfaces work correctly (read transcripts, transcription status, failed transcription records; write transcripts/failed records in sandbox mode), transcription status is accurate (counts match actual transcript records, fully/partially/not started/failed badges are correct), failed transcriptions are tracked with reasons and retry counts, orphaned transcript detector finds transcripts for snips that no longer exist in audio-store, and the full transcription-service → transcript-store → inspect flow works (when live transcription-service is integrated). Operator can inspect real transcripts (read-only, from prior PWA usage), create sandbox demo transcripts (sandbox write mode via manual writeTranscript calls or transcription-service integration), or transcribe live audio and watch transcripts land in IndexedDB immediately (live from transcription-service mode).

**Optional transcription-service integration** (Live from Transcription-Service mode): Transcript-store demo MAY include transcription-service as a demo dependency. When "Enable Writes (Sandbox)" is checked and "Live from Transcription-Service" toggle is enabled, a transcription overlay panel appears. Operator selects audio source (fixture, upload, or live from recording-pipeline if further integrated) → enters Groq API key (or uses demo key) → clicks "Transcribe" → transcription-service sends audio to Groq → receives transcript → calls transcript-store.writeTranscript() → transcript lands in real IndexedDB with DEMO label → operator clicks "View Created Transcript" → Transcripts tab shows new transcript. Proves transcript-store interfaces work end-to-end when called by transcription-service. Sandbox transcripts can be deleted with "Clear All Transcripts" button (if added to transcript-store in Phase 02).

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
