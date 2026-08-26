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
