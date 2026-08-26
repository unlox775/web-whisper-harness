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

(To be filled by Phase 04 customer-request agent for isolation-demo → capture-engine)

The isolation-demo customer will write its request here: what interfaces it needs from capture-engine, what inputs it will provide, what outputs it expects, how it will operate the package, and what validation it needs to see to trust the package.

## Producer Response

(To be filled by Phase 05 producer-response agent for capture-engine)

Capture-engine will respond here: how it will meet the isolation-demo's request, what interfaces it will expose for demo use, what data modes it supports (in-memory only for this demo), and how the demo proves the package works independently.
