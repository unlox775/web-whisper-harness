# Web Whisper PWA

User-facing Progressive Web App for iPhone. Owns navigation, UI screens (home, session list, session detail, settings, developer mode), platform permissions (microphone), settings persistence, and orchestration of the lib packages and session-store.

## Boundary

The PWA does NOT implement capture, volume analysis, transcription, or playback logic. It calls the lib packages for those jobs:

- `packages/lib/capture-engine` for recording (microphone → PCM → encode MP3 chunks → write to session-store)
- `packages/lib/volume-analyzer` for volume profiles and snip proposal
- `packages/lib/transcription-client` for Groq Whisper API key validation and transcription
- `packages/lib/playback-engine` for audio playback (sessions, chunks, snips)
- `packages/datastore/session-store` for all durable data (sessions, chunks, volume profiles, snips, transcripts)

## Target Device

iPhone, used as a Progressive Web App (Add to Home Screen). Desktop/web can work later; it is backlog, not the default.

## Visual Design

Preserve the theme, visual identity, and overall look from the live PWA at https://unlox775.github.io/web-whisper/. See `docs/VISUAL-BASELINE.md` for exact colors, layout, and interaction patterns. This is an architecture replacement, not a redesign.

## Product Specs

See `docs/specs/` for detailed implementation specs and work orders.

## Customers

The PWA has one primary customer: **the end user** (iPhone user who needs to record, play back, and transcribe audio).

The PWA is a **customer** of all lib packages and the session-store. See each package's `customers/web-whisper-pwa.md` for the PWA's requests from that package.
