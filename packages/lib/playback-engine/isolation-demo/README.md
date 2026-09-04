# Playback Engine Isolation Demo

Package-local runnable demo for operating playback-engine independently without the production PWA.

## Purpose

Proves that playback-engine:
- Plays sessions (concatenates all chunks, plays full session audio)
- Plays chunks (plays single chunk audio)
- Plays snips (concatenates chunk range for snip, plays snip audio)
- Plays an uploaded session archive zip (RAM chunks → `playBlobs` session concat)
- Supports playback controls (play, pause, resume, seek, stop, volume)
- Tracks playback state (current time, duration, playing/paused/stopped status)
- Emits playback events (playing, paused, ended, error)
- Volume slider audibly changes loudness via `PlaybackHandle.setVolume` (Web Audio GainNode)

## iOS volume quirk

**iOS Safari ignores `HTMLAudioElement.volume`.** The property updates, but audible output stays at 1.0. Desktop Chrome usually honors `element.volume`.

This package routes playback through:

`HTMLAudioElement` → `AudioContext.createMediaElementSource` → `GainNode` → `destination`

`setVolume(0..1)` writes `gain.value` (clamped). The Isolation Demo Volume slider must change audible level, not just move the range input. Confirm on iPhone Safari when possible; Chrome plus this note is the fallback.

## Runtime

- **Platform**: Web app (local dev server, factory floor operating surface)
- **Viewport**: Desktop browser (wider factory floor, not phone-shaped)
- **Launch**: `cd packages/lib/playback-engine/isolation-demo && npm start` (or equivalent)

## Data Mode

Three play sources (chip in the top chrome):

- **LIVE FROM CAPTURE (in-memory)** — record with capture-engine, play RAM chunks via `playBlobs`
- **FIXTURE MODE (mock audio)** — simulated session with 3 chunks (4.0s, 4.1s, 3.5s) and 2 snips
- **ARCHIVE UPLOAD** — file input (`accept` zip) parsed with `@web-whisper/session-store` `parseSessionArchive`. Non-null chunk blobs stay in RAM and play as **session concat** through the same `playBlobs` path as live. Per-chunk / snip radios stay fixture-only (archives are session-concat).

Does **not** open `web-whisper-db`. Does **not** reimplement the zip / `manifest.json` format.

Clear errors in the archive status line and event feed:

- Bad zip / cannot read archive
- Not a Web Whisper session archive (missing manifest / wrong `kind`)
- Unsupported archive version
- No playable audio in archive (purged or metadata-only)

**Safe default**: Live capture (no session-store write). Fixture remains available for known tones.

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
- Volume slider: 0..1, step 0.01, default 1.0; calls `handle.setVolume` (GainNode). Drag toward 0 → quieter; toward 1 → louder. Pause, change slider, resume → new level applies.
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

(For Phase 06 implementation agent)

### Fixture Audio Generation

**Option 1: Pre-encoded fixture MP3 files** (RECOMMENDED for simplicity)

Bundle 3 pre-encoded MP3 files with the demo:
- `fixtures/chunk-0.mp3` (4.0s duration, ~32KB, 250Hz sine wave or "First chunk" speech)
- `fixtures/chunk-1.mp3` (4.1s duration, ~33KB, 500Hz sine wave or "Second chunk" speech)
- `fixtures/chunk-2.mp3` (3.5s duration, ~28KB, 750Hz sine wave or "Third chunk" speech)

Each chunk should be distinguishable by ear (different tones or speech samples) so the developer can verify concatenation and seek operations are correct. If all chunks sound identical, validation is impossible.

Use a tool like `ffmpeg` to generate fixture MP3s:
```bash
# Generate 4.0s 250Hz sine wave, encode to MP3 at 64kbps (matches capture-engine bitrate)
ffmpeg -f lavfi -i "sine=frequency=250:duration=4.0" -codec:a libmp3lame -b:a 64k fixtures/chunk-0.mp3

# Generate 4.1s 500Hz sine wave
ffmpeg -f lavfi -i "sine=frequency=500:duration=4.1" -codec:a libmp3lame -b:a 64k fixtures/chunk-1.mp3

# Generate 3.5s 750Hz sine wave
ffmpeg -f lavfi -i "sine=frequency=750:duration=3.5" -codec:a libmp3lame -b:a 64k fixtures/chunk-2.mp3
```

Or use speech samples:
```bash
# Generate 4.0s speech "First chunk" using text-to-speech (macOS `say` command example)
say -v "Alex" -o fixtures/chunk-0.aiff "First chunk, zero to four seconds"
ffmpeg -i fixtures/chunk-0.aiff -codec:a libmp3lame -b:a 64k -t 4.0 fixtures/chunk-0.mp3

# Generate 4.1s speech "Second chunk"
say -v "Alex" -o fixtures/chunk-1.aiff "Second chunk, four to eight seconds"
ffmpeg -i fixtures/chunk-1.aiff -codec:a libmp3lame -b:a 64k -t 4.1 fixtures/chunk-1.mp3

# Generate 3.5s speech "Third chunk"
say -v "Alex" -o fixtures/chunk-2.aiff "Third chunk, eight to twelve seconds"
ffmpeg -i fixtures/chunk-2.aiff -codec:a libmp3lame -b:a 64k -t 3.5 fixtures/chunk-2.mp3
```

Load fixture MP3s in demo:
```typescript
// Fetch fixture MP3 files as blobs
const chunk0Blob = await fetch('/fixtures/chunk-0.mp3').then(r => r.blob());
const chunk1Blob = await fetch('/fixtures/chunk-1.mp3').then(r => r.blob());
const chunk2Blob = await fetch('/fixtures/chunk-2.mp3').then(r => r.blob());

// Fixture session metadata
const fixtureSession = {
  sessionId: 'demo-session-001',
  duration: 11.6,
  chunkIds: ['demo-chunk-000', 'demo-chunk-001', 'demo-chunk-002'],
  createdAt: new Date().toISOString(),
};

const fixtureChunks = [
  { chunkId: 'demo-chunk-000', sessionId: 'demo-session-001', startTime: 0.0, endTime: 4.0, duration: 4.0, blob: chunk0Blob, blobSize: chunk0Blob.size },
  { chunkId: 'demo-chunk-001', sessionId: 'demo-session-001', startTime: 4.0, endTime: 8.1, duration: 4.1, blob: chunk1Blob, blobSize: chunk1Blob.size },
  { chunkId: 'demo-chunk-002', sessionId: 'demo-session-001', startTime: 8.1, endTime: 11.6, duration: 3.5, blob: chunk2Blob, blobSize: chunk2Blob.size },
];

const fixtureSnips = [
  { snipId: 'demo-snip-000', sessionId: 'demo-session-001', label: 'First snip', startTime: 0.0, endTime: 8.1, duration: 8.1, chunkRefs: ['demo-chunk-000', 'demo-chunk-001'] },
  { snipId: 'demo-snip-001', sessionId: 'demo-session-001', label: 'Second snip', startTime: 8.1, endTime: 11.6, duration: 3.5, chunkRefs: ['demo-chunk-002'] },
];
```

**Option 2: Runtime-generated fixture audio** (more complex, no bundle size cost)

Use Web Audio API to generate sine waves at runtime, encode to MP3 using `lamejs` or similar encoder:
```typescript
// Generate 4.0s 250Hz sine wave using Web Audio API
const audioContext = new AudioContext({ sampleRate: 44100 });
const duration = 4.0;
const frequency = 250;
const sampleRate = audioContext.sampleRate;
const numSamples = duration * sampleRate;
const audioBuffer = audioContext.createBuffer(1, numSamples, sampleRate);
const channelData = audioBuffer.getChannelData(0);

for (let i = 0; i < numSamples; i++) {
  channelData[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate);
}

// Encode to MP3 using lamejs (same encoder as capture-engine)
const mp3Encoder = new lamejs.Mp3Encoder(1, sampleRate, 64); // 1 channel, 64kbps bitrate
const samples = new Int16Array(channelData.length);
for (let i = 0; i < channelData.length; i++) {
  samples[i] = channelData[i] * 32767; // Convert float to int16
}
const mp3Data = mp3Encoder.encodeBuffer(samples);
const mp3End = mp3Encoder.flush();
const chunk0Blob = new Blob([mp3Data, mp3End], { type: 'audio/mpeg' });

// Repeat for chunks 1 and 2 with different frequencies and durations
```

This approach produces fixture audio at runtime without bundling MP3 files, but requires `lamejs` library and is more complex. Only use if bundle size is a concern (3 fixture MP3s are ~100KB total, negligible for a dev tool).

### Fixture Snip Definitions

Snips are defined in fixture data based on chunk references:

- **Snip 0**: Chunks 0–1 (0.0s to 8.1s, 8.1s total duration). Concatenate `chunk0Blob` and `chunk1Blob`.
- **Snip 1**: Chunk 2 only (8.1s to 11.6s, 3.5s total duration). Use `chunk2Blob` directly (no concatenation needed for single-chunk snip).

When demo calls `playSnip('demo-snip-000')`, playback-engine reads snip metadata, gets chunk IDs [demo-chunk-000, demo-chunk-001], reads those chunk blobs, concatenates them into one blob, plays the blob.

### Audio Concatenation

Use `new Blob([blob1, blob2, blob3], {type: 'audio/mpeg'})` for multi-chunk sessions and multi-chunk snips:

```typescript
// Concatenate all session chunks (session playback)
const sessionBlob = new Blob(
  [chunk0Blob, chunk1Blob, chunk2Blob],
  { type: 'audio/mpeg' }
);

// Concatenate snip chunks (snip playback)
const snip0Blob = new Blob(
  [chunk0Blob, chunk1Blob],
  { type: 'audio/mpeg' }
);

// Single chunk (chunk playback or single-chunk snip)
const chunk1BlobDirect = chunk1Blob; // No concatenation needed
```

MP3 format supports concatenation without re-encoding. A concatenated MP3 blob is valid and playable by HTML5 `<audio>` element.

### HTML5 Audio Element Management

Create one `<audio>` element per playback handle:

```typescript
function playSession(sessionId: string): PlaybackHandle {
  // Read session from fixture store or real store
  const session = getSession(sessionId);
  if (!session) {
    return { error: 'session_not_found', sessionId };
  }

  // Read and concatenate chunks
  const chunkBlobs = session.chunkIds.map(id => getChunk(id).blob);
  const sessionBlob = new Blob(chunkBlobs, { type: 'audio/mpeg' });

  // Create audio element (detached, not appended to DOM)
  const audio = new Audio();
  const blobUrl = URL.createObjectURL(sessionBlob);
  audio.src = blobUrl;

  // Create playback handle
  const handle: PlaybackHandle = {
    state: 'playing',
    currentTime: 0,
    duration: 0,
    pause: () => { audio.pause(); },
    resume: () => { audio.play(); },
    seek: (time: number) => { audio.currentTime = time; },
    stop: () => {
      audio.pause();
      audio.currentTime = 0;
      URL.revokeObjectURL(blobUrl);
      handle.state = 'stopped';
      handle.emit('stopped', {});
    },
    on: (event, callback) => { /* event emitter */ },
    emit: (event, payload) => { /* event emitter */ },
  };

  // Attach HTML5 audio event listeners
  audio.addEventListener('loadedmetadata', () => {
    handle.duration = audio.duration;
  });

  audio.addEventListener('play', () => {
    handle.state = 'playing';
    handle.emit('playing', { currentTime: audio.currentTime, duration: audio.duration });
  });

  audio.addEventListener('pause', () => {
    handle.state = 'paused';
    handle.emit('paused', { currentTime: audio.currentTime });
  });

  audio.addEventListener('timeupdate', () => {
    handle.currentTime = audio.currentTime;
    handle.emit('timeupdate', { currentTime: audio.currentTime });
  });

  audio.addEventListener('seeked', () => {
    handle.emit('seeked', { currentTime: audio.currentTime });
  });

  audio.addEventListener('ended', () => {
    handle.state = 'stopped';
    handle.emit('ended', {});
    URL.revokeObjectURL(blobUrl);
  });

  audio.addEventListener('error', (e) => {
    handle.emit('playbackError', { reason: 'audio_decode_failed', detail: e });
  });

  // Start playback
  audio.play().catch(err => {
    handle.emit('playbackError', { reason: 'audio_play_failed', detail: err });
  });

  return handle;
}
```

Audio element is created detached (not appended to DOM). HTML5 audio playback does not require DOM attachment. If browser requires DOM attachment (iOS Safari quirks), append to hidden container: `document.getElementById('playback-audio-container').appendChild(audio)`.

### Seek Implementation

Use HTML5 `.currentTime` property:

```typescript
handle.seek = (time: number) => {
  // Clamp time to [0, duration]
  const clampedTime = Math.max(0, Math.min(time, audio.duration || 0));
  audio.currentTime = clampedTime;
  // 'seeked' event fires automatically, handle.emit('seeked', ...) called in event listener
};
```

For concatenated blobs (multi-chunk sessions), `.currentTime` works transparently across chunk boundaries. The browser treats the concatenated MP3 as one continuous audio stream. No manual chunk offset calculation needed.

### Real Store Read-Only Mode

When "Enable Real Store" toggled ON, demo reads from sandbox IndexedDB (`web-whisper-demo-db`, not production `web-whisper-db`):

```typescript
// Open sandbox IndexedDB
const db = await openDB('web-whisper-demo-db', 1, {
  upgrade(db) {
    // Create object stores matching session-store schema (sessions, chunks, snips)
    if (!db.objectStoreNames.contains('sessions')) {
      db.createObjectStore('sessions', { keyPath: 'sessionId' });
    }
    if (!db.objectStoreNames.contains('chunks')) {
      db.createObjectStore('chunks', { keyPath: 'chunkId' });
    }
    if (!db.objectStoreNames.contains('snips')) {
      db.createObjectStore('snips', { keyPath: 'snipId' });
    }
  },
});

// Read sessions from sandbox store
const sessions = await db.getAll('sessions');

// Populate session selector dropdown in demo UI
sessionSelector.innerHTML = sessions.map(s => 
  `<option value="${s.sessionId}">${s.sessionId} (${s.duration.toFixed(1)}s, ${s.chunkIds.length} chunks)</option>`
).join('');

// When user selects a session and clicks Play, read chunks from sandbox store
const selectedSessionId = sessionSelector.value;
const session = await db.get('sessions', selectedSessionId);
const chunkBlobs = await Promise.all(
  session.chunkIds.map(id => db.get('chunks', id).then(chunk => chunk.blob))
);

// Call playback-engine as usual (playback-engine does not know this is real store vs fixture)
const handle = playSession(selectedSessionId);
```

Sandbox IndexedDB is separate from production (`web-whisper-db`). Demo does NOT write to sandbox store (read-only mode). Developer can populate sandbox store manually (open browser DevTools → Application → IndexedDB → web-whisper-demo-db → add sessions/chunks) or copy sessions from production store for testing.

### Demo UI Implementation

**Framework**: React or vanilla JS (coordinate with project setup; prefer React if PWA uses React, for consistency)

**Layout**: CSS Grid or Flexbox, 4 regions (top chrome, fixture data panel, playback control panel, event feed panel)

**Top chrome**: Fixed header, full width, `position: fixed; top: 0; left: 0; right: 0; height: 60px; background: #f0f0f0; z-index: 100;`

**Panels below chrome**: 3 columns (flex or grid), equal width or 1/4 + 1/2 + 1/4 split

**Event feed**: Scrollable div, `overflow-y: auto; max-height: calc(100vh - 60px);`, autoscroll to bottom when new event added (`scrollTop = scrollHeight`)

**Color coding**: Use inline styles or CSS classes for event types (green = playing/ended, yellow = paused, red = stopped/error, cyan = seeked, gray = timeupdate)

**Buttons**: Styled with color, full-width or fixed width, enable/disable based on playback state (Play enabled only when idle, Pause enabled only when playing, Resume enabled only when paused, Stop enabled when playing or paused)

**Seek slider**: `<input type="range" min="0" max={duration} step="0.1" value={currentTime} onChange={handleSeek} />`, update `value` in real-time during playback (re-render on `timeupdate` event)

**Time display**: Format as `"M:SS"` (e.g., "5:32") or `"S.S"` (e.g., "5.5s") depending on preference. Update on every `timeupdate` event.

### Validation Walkthrough

After implementation, the Phase 06 agent should perform this walkthrough:

1. Launch demo: `cd packages/lib/playback-engine/isolation-demo && npm start`
2. Default state: Fixture mode, top chrome shows "FIXTURE MODE (mock audio)", fixture data panel shows demo-session-001 (11.6s, 3 chunks, 2 snips)
3. Play session: Click "Play Session" button, verify audio plays for 11.6s, verify time display updates "0.0s / 11.6s" → "11.6s / 11.6s", verify event feed logs `playing` → many `timeupdate` → `ended`
4. Pause: Play session, wait 5s, click "Pause", verify audio pauses, time freezes at "5.0s / 11.6s", event feed logs `paused`
5. Resume: Click "Resume", verify audio resumes from 5.0s, time continues updating, event feed logs `playing`
6. Seek: Play session, wait 2s, move seek slider to 8.0s, verify audio jumps to 8.0s, event feed logs `seeked`
7. Stop: Play session, wait 3s, click "Stop", verify audio stops, time resets to "0.0s / 11.6s", event feed logs `stopped`
8. Play chunk: Select "Play Chunk", select "Chunk 1 (4.1s)", click "Play", verify audio plays for 4.1s (should sound like 500Hz sine wave or "Second chunk" speech), time display "0.0s / 4.1s"
9. Play snip: Select "Play Snip", select "Snip 0 (8.1s)", click "Play", verify audio plays for 8.1s (should sound like chunks 0 and 1 concatenated seamlessly), time display "0.0s / 8.1s"
10. Seamless concatenation: Play session, listen carefully at 4.0s and 8.1s (chunk boundaries), verify NO audible gap, click, or time skip
11. (Optional) Real store mode: Toggle "Enable Real Store" ON, if sandbox store has sessions, select one, play it, verify audio plays from real chunks

If all validations pass, playback-engine core logic is proven correct.
