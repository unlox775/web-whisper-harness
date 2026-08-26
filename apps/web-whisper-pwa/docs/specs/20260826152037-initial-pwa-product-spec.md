Spec Status: unresolved
Spec Type: initial-product-spec
Created: 2026-08-26T15:20:37Z
Product: apps/web-whisper-pwa

# Web Whisper PWA — Initial Product Spec

## Product Goal

Deliver the user-facing iPhone Progressive Web App that orchestrates recording, playback, transcription, and session management using the lib packages and session-store. The PWA is the integration point and primary customer of all packages.

## Boundary

- **Owns**: Navigation, UI screens (home, session list, session detail, settings, developer mode), microphone permission requests, settings persistence (Groq API key, storage cap, developer mode toggle), orchestration of lib packages
- **Does NOT own**: Capture logic (capture-engine), volume analysis (volume-analyzer), transcription logic (transcription-client), playback logic (playback-engine), durable data authority (session-store)

## Main Screens

(See founder vision and visual baseline for detailed layouts)

1. **Home / Session List**: Session cards, "Start Recording" button (inline in CAPTURE card), Settings button
2. **Recording (active)**: Duration counter, Stop button, chunk count (if developer mode)
3. **Session Detail**: Session metadata, Play button, playback controls, Transcribe button, transcript text (if transcribed), Copy button
4. **Settings**: Groq API key input + validation, transcription status, storage cap, developer mode toggle
5. **Developer Mode Panels** (conditional): Chunk list, Snip list, Volume histogram, Doctor panel, Console

## Package Dependencies

- `capture-engine`: Call `startCapture(sessionId)` → `stopCapture(handle)` for recording
- `volume-analyzer`: Call `proposeSnips(sessionId)` after recording to generate snips
- `transcription-client`: Call `validateKey(apiKey)` in Settings, `transcribeAudio(audioBlob, apiKey)` for each snip
- `playback-engine`: Call `playSession(sessionId)`, `playChunk(chunkId)`, `playSnip(snipId)` for playback
- `session-store`: Call all interfaces (createSession, writeChunk, getSession, listSessions, getChunksForSession, writeVolumeProfile, writeSnip, writeTranscript, enforceRetentionPolicy)

## Isolation Demo

N/A. The PWA is an app, not a package. Apps are already directly runnable and do not automatically need a separate Isolation Demo. The app itself is the product surface the founder walks.

## Phase 03 Product Spec Tasks

This stub spec will be expanded by the Phase 03 product-spec agent for `apps/web-whisper-pwa` to include:

- Detailed screen-by-screen UI spec (components, layout, interactions)
- Orchestration flows (recording flow, transcription flow, playback flow)
- Settings persistence strategy (localStorage vs IndexedDB settings table)
- Developer mode gating and panel rendering
- Error handling and user feedback (mic permission denied, transcription failed, playback error)
- Visual design implementation notes (referencing visual baseline)
- Validation plan (manual walkthrough checklist)

## Customer Relationships

The PWA is a customer of:
- `packages/lib/capture-engine` (see capture-engine/customers/web-whisper-pwa.md)
- `packages/lib/volume-analyzer` (see volume-analyzer/customers/web-whisper-pwa.md)
- `packages/lib/transcription-client` (see transcription-client/customers/web-whisper-pwa.md)
- `packages/lib/playback-engine` (see playback-engine/customers/web-whisper-pwa.md)
- `packages/datastore/session-store` (see session-store/customers/web-whisper-pwa.md)

Customer request sections will be filled by Phase 04 customer-request agents.
