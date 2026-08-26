# Phase 04: Isolation Demo → playback-engine Customer Request

**Date**: 2026-08-26  
**Phase**: 04 (Customer Requests)  
**Relationship**: Isolation Demo → packages/lib/playback-engine  
**Customer Document**: `packages/lib/playback-engine/customers/00-isolation-demo.md`

## Relationship Summary

The Isolation Demo is the standing founder/developer customer that operates playback-engine independently to prove audio playback works correctly, including seamless multi-chunk concatenation, playback controls (pause/resume/seek/stop), and event emission. It is the package factory floor for validating playback logic.

## Customer Request Content

The Isolation Demo's customer request in `packages/lib/playback-engine/customers/00-isolation-demo.md` specifies:

- **Safe default: Fixture session**: Demo defaults to fixture session (3 distinguishable chunks: tone A/4.0s, tone B/4.1s, tone C/3.5s, total 11.6s). Chunks MUST be distinguishable so operator can hear whether concatenation is correct and seek is working. 2 snips: snip 0 (chunks 0–1, 8.1s), snip 1 (chunk 2, 3.5s).

- **Interfaces needed**: `playSession(sessionId)`, `playChunk(chunkId)`, `playSnip(snipId)` all return playback handle. Handle provides: `pause()`, `resume()`, `seek(time)`, `stop()`, `state` (readonly), `currentTime` (readonly), `duration` (readonly), event subscription (`on`, `off`).

- **Playback events needed**: `playing` ({currentTime, duration}), `paused` ({currentTime}), `timeupdate` ({currentTime}, every ~250ms), `seeked` ({currentTime}), `ended` ({}), `stopped` ({}), `playbackError` ({reason, detail}).

- **Visual proof: Seamless multi-chunk concatenation**: Operator clicks "Play Session" (3 chunks, 11.6s) → listens → should hear tone A (4s) → tone B (4.1s) → tone C (3.5s) with NO audible gap, click, or time skip at boundaries (4.0s and 8.1s). Time display climbs smoothly: "4.0s / 11.6s" → "4.1s / 11.6s" (no jump).

- **Visual proof: Seek across chunks**: Operator plays session → drags seek slider to 4.0s (exact chunk 0/1 boundary) → audio jumps to 4.0s → hears tone B immediately (not tone A). Drags to 8.1s (chunk 1/2 boundary) → hears tone C immediately. Proves seek works transparently across chunk boundaries.

- **Visual proof: Control flow**: Play → Pause at 5.2s → time freezes → Resume → time continues → Stop → time resets to 0.0s. Event feed logs all events in correct order.

- **UI panels**: Top Chrome Panel (data mode chip), Playback Control Panel (target selector: Session/Chunk/Snip, target dropdown, Play/Pause/Resume/Stop buttons, seek slider, time display), Fixture Data Panel (session info, chunks table, snips table), Event Feed Panel (scrollable, color-coded logs).

- **Optional mode: Real Store (read-only)**: Operator toggles "Enable Real Store" ON → data mode chip: "REAL STORE (read-only)" (cyan). Target dropdown populates with real sessions from sandbox IndexedDB. Operator can play real sessions. Proves session-store integration works.

- **Performance expectations**: `playSession` < 500ms for < 30 chunks. `playChunk` < 100ms. `playSnip` < 300ms for < 10 chunks. `pause`, `resume`, `stop` < 50ms. `seek` < 50ms.

- **Error handling expectations**: Playback-engine MUST emit `playbackError` event (NOT throw exceptions). Error codes: `chunk_missing`, `audio_decode_failed`, `session_not_found`.

## Phase 05 Follow-Up

Phase 05 producer-response agent will write playback-engine's response in the same customer document, confirming how it will meet the Isolation Demo's request.
