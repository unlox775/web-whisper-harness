# Sub-Agent Plan

This file is the project phase plan for the AI Product Slice Harness.

**Current phase**: Phase 02 complete — scaffolded Alternative A. Ready for Phase 03 (product specs).

**Selected slice-up**: Alternative A — Pipeline-Stage Slicing (6 packages, chosen by Dave 2026-08-26).

## Selected Products

Six products for Phase 03–06 (one Cursor Cloud Agent per product):

1. `apps/web-whisper-pwa` — User-facing iPhone PWA (orchestration, UI, settings)
2. `packages/lib/capture-engine` — Microphone-to-durable-chunk pipeline
3. `packages/lib/volume-analyzer` — Volume profile computation and snip proposal
4. `packages/lib/transcription-client` — Groq Whisper API client
5. `packages/lib/playback-engine` — Audio playback for sessions/chunks/snips
6. `packages/datastore/session-store` — IndexedDB schema and storage authority

Zero UI packages (UI stays in PWA).

## Customer Relationships

**Phase 04** will generate customer-request agents for known relationships:

### Consumer → Producer relationships (PWA depends on all packages):
- `web-whisper-pwa` → `capture-engine`
- `web-whisper-pwa` → `volume-analyzer`
- `web-whisper-pwa` → `transcription-client`
- `web-whisper-pwa` → `playback-engine`
- `web-whisper-pwa` → `session-store`

### Producer → Datastore relationships (all lib packages read/write session-store):
- `capture-engine` → `session-store` (writes chunks)
- `volume-analyzer` → `session-store` (reads chunks, writes volume profiles + snips)
- `playback-engine` → `session-store` (reads sessions, chunks, snips)

### Isolation Demo → Producer relationships (every package has standing isolation-demo customer):
- `isolation-demo` → `capture-engine`
- `isolation-demo` → `volume-analyzer`
- `isolation-demo` → `transcription-client`
- `isolation-demo` → `playback-engine`
- `isolation-demo` → `session-store`

## Commands

After Phase 02 generates phase scripts:

```sh
make watch
HARNESS_COMMIT_DIRTY=1 make phase-2-5
PHASE_CONFIRMED=1 make phase-6
make phase-7-dry-run
make phase-7
```

See `docs/AI-PRODUCT-SLICE-HARNESS.md` for the full process.
