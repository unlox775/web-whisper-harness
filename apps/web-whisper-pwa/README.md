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

Orchestration contracts:

- Advanced Settings: per-package log levels (`debug` / `info` / `warn` / `error` / `off`) and approximate log byte sizes; `configureLogger` + `activeSessionId` for the active take
- Debug **Export Session** (debug-include path): `exportSessionArchive` with `includeDebugArtifacts` (session-store also turns on `includeLogs` → `logs.json`) — do not invent a second zip
- Transcription coverage: last snip end vs session/recorder duration; **PART TX / `partial`** when uncovered audio remains (do not claim READY / “all snips transcribed”)
- Retention is **not** coordinated with live writers (session-store owns concurrency). The PWA does not call `enforceRetentionPolicy` during recording unless `usedBytes ≥ 90%` of the cap (at most once per 60 s). After Stop it `await`s capture-engine `flushPending()` → `{ savedCount, lostChunks }`, then retains. Boot / idle / Settings also retain.
- Stop UI: same-frame **Finishing recording…** / **Saving recording…** (disabled). Stay on the recording screen until final-chunk persist + last-snip transcription, or `STOP_FINISH_WAIT_MS` (5 s), then Home. The timeout does not cancel `flushPending` or transcription.
- Session detail calls `getChunkCoverage(sessionId)` and shows elapsed vs saved duration and gap time ranges. Missing seqs are never hidden behind READY.
- Persist UI: `store_write_failed` → logs only; `chunk_lost` → "Storage write failed"; `persist_backpressure` → "Saving is behind".
- **Screen stays awake while recording.** A PWA cannot capture in the background on iOS. The PWA acquires `navigator.wakeLock.request('screen')` from the Record tap and releases it on stop. On iOS Safari / standalone (API missing or auto-released when hidden) it also starts a muted, `playsinline`, looping video-only clip from that same gesture, and re-acquires on `visibilitychange` / `pageshow`. Wake-lock work never discards captured audio. Acquire / release / failure go to session-store `log('web-whisper-pwa', …)`.
