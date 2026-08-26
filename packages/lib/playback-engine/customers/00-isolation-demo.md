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

(To be filled by Phase 04 customer-request agent for isolation-demo → playback-engine)

The isolation-demo customer will write its request here: what interfaces it needs from playback-engine (`playSession`, `playChunk`, `playSnip`, playback handle methods), what inputs it will provide (fixture session ID or real session ID from sandbox store), what outputs it expects (playback handle with methods and events), and what validation it needs to see to trust the package.

## Producer Response

(To be filled by Phase 05 producer-response agent for playback-engine)

Playback-engine will respond here: how it will meet the isolation-demo's request, what interfaces it will expose for demo use, what data modes it supports (fixture by default, optionally real store read-only), and how the demo proves the package works independently.
