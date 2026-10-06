# Web Whisper PWA

User-facing Progressive Web App for iPhone. Owns navigation, UI screens, microphone permission, settings, and orchestration of the lib packages and session-store.

## Run locally

From the repository root:

```bash
make start
```

That installs dependencies if needed and starts Vite at http://localhost:5173 (LAN-reachable for an iPhone on the same network).

## Publish to GitHub Pages

GitHub Pages is served from `docs/` at the repository root. After any app change:

```bash
make build
```

This builds the PWA and copies `index.html`, `pwa-assets/`, icons, and the manifest into `docs/` without deleting the existing harness markdown in that folder.

## Boundary

The PWA does not implement capture, volume analysis, transcription, or playback logic. It calls:

- `packages/lib/capture-engine` for recording
- `packages/lib/volume-analyzer` for volume profiles and snips
- `packages/lib/transcription-client` for Groq Whisper
- `packages/lib/playback-engine` for playback
- `packages/datastore/session-store` for durable data (including session archive zip export / import, **per-package logs**, and storage stats that include log bytes)

Orchestration contracts (planning names; see Phase 07 feedback specs):

- Advanced Settings: per-package log levels (`debug` / `info` / `warn` / `error` / `off`) and approximate log byte sizes; `configureLogger` + `activeSessionId` for the active take
- Debug **Export Session** (debug-include path): `exportSessionArchive` with `includeLogs` / `includeDebugArtifacts` — do not invent a second zip
- Transcription coverage: last snip end vs session/recorder duration; **PART TX / `partial`** when uncovered audio remains (do not claim READY / “all snips transcribed”)
- Before `enforceRetentionPolicy` during or after recording: `await` capture-engine `flushPending()` / `whenPersistIdle()`
