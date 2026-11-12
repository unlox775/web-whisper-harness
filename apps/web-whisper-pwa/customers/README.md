# Web Whisper PWA Customers

The PWA is the top-level user-facing application. It has one primary customer:

## End User (Human Customer)

The end user (iPhone user who needs to record, play back, and transcribe audio) is the PWA's customer. The PWA delivers value directly to the user via UI screens and interactions.

## Package Relationships

The PWA is NOT a producer for other packages. Instead, the PWA is a **customer** of the lib packages and session-store. See each package's `customers/web-whisper-pwa.md` for details on how the PWA depends on that package:

- `packages/lib/capture-engine/customers/web-whisper-pwa.md`
- `packages/lib/volume-analyzer/customers/web-whisper-pwa.md`
- `packages/lib/transcription-client/customers/web-whisper-pwa.md`
- `packages/lib/playback-engine/customers/web-whisper-pwa.md`
- `packages/datastore/session-store/customers/web-whisper-pwa.md`

Since no other packages depend on the PWA (dependency flow is PWA → lib packages → session-store), this customers/ folder has no package-to-package customer docs.

## Durability (2026-11-03)

The PWA does **not** coordinate chunk writers with retention. session-store owns its concurrency; capture-engine never drops encoded chunks. Binding rules: `docs/DURABILITY-CONTRACT.md`.

Shipped PWA behavior (`docs/specs/20261103175002-feedback-no-retention-while-recording-and-gap-display.md`):

- **Stop UI (2026-11-09):** On Stop tap the recording screen switches **same frame** to **Finishing recording…** / **Saving recording…** (button disabled). It stays there until the final chunk is persisted (`flushPending`) and that last snip’s transcription finishes, or `STOP_FINISH_WAIT_MS` (5 s), then Home. Timeout still leaves persist + transcription running — the wait is UI only. Partial / coverage status on the list is the fallback.
- **Retention:** not during recording unless last-known `usedBytes ≥ 90%` of the cap, and then at most once per 60 s. Recording-path usedBytes is O(1) (last refresh plus incremental encoded sizes) — live `chunkEncoded` does not call `getStorageStats` or scan the library. If usedBytes is unknown, skip retention and keep recording. Otherwise after Stop (`await flushPending()` → `{ savedCount, lostChunks }`, then `enforceRetentionPolicy`), on app start/idle, or from Settings.
- **Coverage:** `getChunkCoverage` is an O(1) session-row read. Session **detail** calls it and shows `MM:SS elapsed · MM:SS saved · N gaps` plus each gap's time range. Home tiles read the same fields from `listSessions` rows (no chunk cursor). Visible tiles may lazy-load snips + transcripts for READY / PART TX. A session with missing seqs is never shown as READY/done without that gap indicator. `hasTranscript` is not READY.
- **Banners:** `store_write_failed` is logs only. `chunk_lost` shows "Storage write failed. Recording may be incomplete." `persist_backpressure` shows "Saving is behind".
- **Screen awake while recording:** the PWA holds a screen wake lock for the whole take (Screen Wake Lock API + muted looping `playsinline` video fallback on iOS Safari / standalone). It re-acquires after iOS auto-releases on hide (`visibilitychange` / `pageshow`). This is PWA-owned; capture-engine is not asked to keep the screen on, and wake-lock work must never drop captured audio.
