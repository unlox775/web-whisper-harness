Spec Status: resolved
Spec Type: feedback
Created: 2026-09-04T18:00:03Z
Product: packages/lib/playback-engine

# Feedback: Isolation Demo — upload session archive as play source

## User Feedback

Dave will export a failed PWA recording as a session archive (spec `20260904180001`) and wants to **play that zip** in the playback-engine Isolation Demo — same factory floor as fixture / live capture — so he can hear the take without the PWA DB.

Today the demo (`isolation-demo/src/main.ts`, `isolation-demo/index.html`) has two sources:

- **Live from capture** (in-memory `liveChunks`, `playBlobs`)
- **Fixture** (`fixtureStore` session / chunk / snip)

There is no file upload for a portable session archive.

## Depends on

Phase 07-03 spec 1 — `parseSessionArchive` on `@web-whisper/session-store` (`packages/datastore/session-store`).

Implement spec 1 first (or confirm `parseSessionArchive` exists on the branch you implement against). **Consume the helper. Do not reimplement zip / `manifest.json` / `chunks/`.**

## Requested Outcome

Add **Upload session archive** (file input, `accept` zip) **alongside** fixture and live modes.

### Behavior

1. User picks a `.zip` from spec 1 (`web-whisper-session-<id>-<timestamp>.zip` or any zip that parses).
2. Call `parseSessionArchive(file)` (session-store public API). Isolation Demo may import session-store for this helper only; do not open `web-whisper-db`.
3. Keep parsed chunks in RAM (same idea as `liveChunks`).
4. Playable source = non-null chunk blobs, in `seq` / `startTime` order.
   - Session play: concatenate / `playBlobs` (already used for live).
   - Optional: per-chunk play if the existing target radios still make sense; otherwise session-concat is enough — document the choice.
5. Data-mode chip should make the source unmistakable (e.g. `ARCHIVE UPLOAD` vs fixture / live).

### Errors (clear, in the existing event feed or a status line)

| Problem | User-visible |
| --- | --- |
| Not a zip / cannot unzip | Bad zip / cannot read archive |
| Missing manifest / wrong `kind` | Not a Web Whisper session archive |
| Unsupported `formatVersion` | Unsupported archive version |
| Parse succeeds but **no audio** (all `blob: null`, or empty chunks) | No playable audio in archive (purged or metadata-only) |
| Session-store helper missing | Fail clearly if spec 1 is not on the branch — do not invent a parser |

Do not write the archive into PWA IndexedDB. Do not change `PlaybackHandle` / GainNode loudness unless a tiny glue bug blocks `playBlobs`.

### Isolation Demo only

`packages/lib/playback-engine/isolation-demo/**` (+ a demo README note). Core library tests only if you extract a tiny mapper; prefer keeping logic in the demo.

## Notes For Phase 07

- Keep changes scoped to `packages/lib/playback-engine` (Isolation Demo). Importing `parseSessionArchive` from session-store is allowed; editing session-store is not.
- Do **not** change the PWA.
- Do **not** change volume-analyzer or transcription-client demos.
- Cursor Cloud Agent only — never Codex.
- Do **not** run `make build` unless PWA publish output actually changed (it should not).
- Update this spec with a Resolution or Blocked section when Phase 07 implementation runs.
- Do **not** mark this spec resolved from the specs-only PR.

## Out of scope

- PWA Export Session UI
- volume-analyzer / transcription-client
- Reimplementing the archive format
- Changing retention

## Resolution Criteria

Mark this spec resolved when:

- [x] Isolation Demo can upload a spec-1 zip and play non-purged chunks
- [x] Fixture and live modes still work
- [x] Bad zip / wrong `formatVersion` / no audio show clear errors
- [x] `parseSessionArchive` is the only parser
- [x] Spec updated with a Resolution section documenting what shipped

## Resolution

**Resolved:** 2026-09-04T20:40:00Z

### What Was Implemented

Isolation Demo third source: **Upload session archive**.

1. **File input** (`accept=".zip,application/zip,application/x-zip-compressed"`) alongside Live microphone and Fixture.
2. **`parseSessionArchive` only** — dynamic import of `@web-whisper/session-store`. No zip / `manifest.json` / `chunks/` parser in this package. Does not call `init()` and does not open `web-whisper-db`.
3. **RAM play path** — parsed `{ meta, blob | null }` kept in memory (same idea as `liveChunks`). Playable source = non-null blobs with `size > 0`, sorted by `seq` then `startTime`. Session play uses existing `playBlobs` concat. **Choice:** archive mode is session-concat only; fixture Session / Chunk / Snip radios stay fixture-only.
4. **Chip:** `ARCHIVE UPLOAD` (purple) vs `LIVE FROM CAPTURE (in-memory)` vs `FIXTURE MODE (mock audio)`. Left panel swaps to uploaded session metadata + chunk table (audio / purged).
5. **Errors** (status line + event feed):
   - `not_a_zip` → Bad zip / cannot read archive
   - `missing_manifest` / `kind_mismatch` / `invalid_manifest` / `corrupt_json` → Not a Web Whisper session archive
   - `unsupported_format_version` → Unsupported archive version
   - Parse OK but no non-null blobs → No playable audio in archive (purged or metadata-only)
   - Missing helper → `parseSessionArchive is not available. Session-store spec 1 must be on this branch.`

### How It Was Tested

- Isolation Demo: upload a v1 zip with audio → chip `ARCHIVE UPLOAD`, Play starts via `playBlobs`
- Fixture Session / live source radios still switch and keep their existing play paths
- Bad zip, `formatVersion: 99`, and metadata-only (all `blob: null`) show the mapped error strings
- No IndexedDB `web-whisper-db` open on the archive path

### Files Modified

- `packages/lib/playback-engine/isolation-demo/index.html`
- `packages/lib/playback-engine/isolation-demo/src/main.ts`
- `packages/lib/playback-engine/isolation-demo/src/modules.d.ts`
- `packages/lib/playback-engine/isolation-demo/README.md`
- `packages/lib/playback-engine/README.md`
- `packages/lib/playback-engine/docs/specs/20260904180003-feedback-isolation-demo-upload-session-archive-as-play-source.md`

### Out of scope (unchanged)

- session-store / `parseSessionArchive` implementation
- PWA Export Session UI
- volume-analyzer / transcription-client Isolation Demos
- `PlaybackHandle` / GainNode loudness
- Retention / purge policy
