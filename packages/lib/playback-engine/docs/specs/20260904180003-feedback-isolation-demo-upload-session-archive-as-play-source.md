Spec Status: unresolved
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

- [ ] Isolation Demo can upload a spec-1 zip and play non-purged chunks
- [ ] Fixture and live modes still work
- [ ] Bad zip / wrong `formatVersion` / no audio show clear errors
- [ ] `parseSessionArchive` is the only parser
- [ ] Spec updated with a Resolution section documenting what shipped
