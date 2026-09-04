Spec Status: unresolved
Spec Type: feedback
Created: 2026-09-04T18:00:04Z
Product: packages/lib/volume-analyzer

# Feedback: Isolation Demo — upload session archive as analyze source

## User Feedback

Dave will export a failed PWA recording as a session archive (spec `20260904180001`) and wants to **analyze that zip** in the volume-analyzer Isolation Demo — same snip / histogram pipeline as fixture and live — so he can tune the noise floor on a real bad take without the PWA.

Today the demo (`isolation-demo/src/App.tsx`) has:

- **Live microphone** (`startCapture` in-memory → `ChunkWithBlob[]`)
- **Fixture patterns** (`generateFixturePattern`)

There is no archive file input.

## Depends on

Phase 07-03 spec 1 — `parseSessionArchive` on `@web-whisper/session-store`.

Implement spec 1 first (or confirm the helper exists on your branch). **Consume it. Do not reimplement the archive format.**

## Requested Outcome

Add **Upload session archive** (file input, zip) as a third source next to live / fixture.

### Behavior

1. User picks a spec-1 zip.
2. `parseSessionArchive(file)` — import session-store for this helper only. Do **not** open `web-whisper-db`. Tuner settings may stay in `web-whisper-volume-analyzer-demo-db` (`demoStore.ts`).
3. Map parsed chunks with non-null `blob` into existing `ChunkWithBlob` (`id`, `seq`, `startTime`, `endTime`, `duration`, `blob`) in seq order.
4. Set that list as `chunks` (same state live/fixture already use).
5. **Compute Volume** / slider recompute must run the **existing** path: `analyzeChunksVolume` → `proposeSnipsFromProfile` (do not change the snip algorithm).
6. Chip / status should show archive mode (e.g. `SESSION ARCHIVE`) vs `LIVE FROM CAPTURE` / `FIXTURE AUDIO`.

Purged rows (`blob: null`) are skipped for analysis; if **no** playable blobs remain, show a clear empty/error and do not call analyze on an empty list (or show the existing `no_chunks` style message).

### Errors

| Problem | User-visible |
| --- | --- |
| Bad zip / unzip fail | Cannot read archive |
| Wrong / missing `formatVersion` or `kind` | Not a supported session archive |
| No audio blobs | No audio in archive to analyze |
| Decode failure on a chunk | Use the existing compute-volume error path; do not crash the page |

### Isolation Demo only

`packages/lib/volume-analyzer/isolation-demo/**`. Do not change `src/snips.ts` / defaults unless a type mapper is required (prefer mapping in the demo).

## Notes For Phase 07

- Keep changes scoped to `packages/lib/volume-analyzer` (Isolation Demo). Importing `parseSessionArchive` is allowed; editing session-store is not.
- Do **not** change the PWA or other packages’ demos.
- Do **not** change the snip algorithm.
- Cursor Cloud Agent only — never Codex.
- Do **not** run `make build` unless PWA publish output actually changed (it should not).
- Update this spec with a Resolution or Blocked section when Phase 07 implementation runs.
- Do **not** mark this spec resolved from the specs-only PR.

## Out of scope

- PWA
- Changing snip / noise-floor algorithm
- playback-engine or transcription-client
- Reimplementing zip/manifest
- Writing archive rows into the PWA DB

## Resolution Criteria

Mark this spec resolved when:

- [ ] Isolation Demo can upload a spec-1 zip and feed chunks into the existing analyze/snip pipeline
- [ ] Live and fixture modes still work
- [ ] Bad archive / no audio show clear errors
- [ ] `parseSessionArchive` is the only parser
- [ ] Spec updated with a Resolution section documenting what shipped
