Spec Status: resolved
Spec Type: feedback
Created: 2026-09-04T18:00:05Z
Product: packages/lib/transcription-client

# Feedback: Isolation Demo — upload session archive as transcribe source

## User Feedback

Dave will export a failed PWA recording as a session archive (spec `20260904180001`) and wants to **transcribe that zip** in the transcription-client Isolation Demo — fixture mock or live Groq — without copying blobs out of IndexedDB by hand.

Today the demo (`isolation-demo/demo.js`, `isolation-demo/index.html`) picks audio via:

- **Live microphone** → `liveBlobs`, then `new Blob(liveBlobs, { type: 'audio/mpeg' })` in `audioBlobForTranscribe()`
- **Fixture blob** (`createFixtureAudioBlob`)

There is no session-archive upload.

## Depends on

Phase 07-03 spec 1 — `parseSessionArchive` on `@web-whisper/session-store`.

Implement spec 1 first (or confirm the helper exists on your branch). **Consume it. Do not reimplement the archive format.**

## Requested Outcome

Add **Upload session archive** (file input, zip) as an audio source **alongside** live / fixture.

### Behavior (match the demo’s existing model)

The demo today transcribes **one** blob per click (`transcribeAudio(blob, options)`), not a snip list. **Match that:**

1. Parse the zip with `parseSessionArchive`.
2. Collect non-null chunk blobs in seq order.
3. Build **one** input blob the same way live does: concatenate (`new Blob(blobs, { type: mime })`, typically `audio/mpeg`).
4. **Transcribe Audio** uses that blob in fixture or live Groq mode (existing `currentMode` / API key path).

If you also offer **per-chunk** transcribe (a dropdown of chunks), that is extra — not required. If you add it, still keep concatenated “whole session” as the default so the existing one-shot button still makes sense.

Do **not** write transcripts into session-store or `web-whisper-db`. Output stays in the demo transcript panel.

Chip / status should show archive source (e.g. `SESSION ARCHIVE`) in addition to fixture vs live Groq.

### Errors

| Problem | User-visible |
| --- | --- |
| Bad zip | Cannot read archive |
| Wrong `formatVersion` / not a session archive | Unsupported or invalid archive |
| No audio blobs (purged / metadata-only) | No audio in archive to transcribe |
| Groq / fixture errors | Existing transcript-panel error path |

Import session-store for `parseSessionArchive` only. Do not change the Groq client (`src/transcribeAudio.js`) except a trivial export if the demo needs a shared type — prefer demo-only glue.

### Isolation Demo only

`packages/lib/transcription-client/isolation-demo/**` (+ README note).

## Notes For Phase 07

- Keep changes scoped to `packages/lib/transcription-client` (Isolation Demo). Importing `parseSessionArchive` is allowed; editing session-store is not.
- Do **not** change the PWA or other packages’ demos.
- Do **not** change Groq retry / model / endpoint behavior.
- Cursor Cloud Agent only — never Codex.
- Do **not** run `make build` unless PWA publish output actually changed (it should not).
- Update this spec with a Resolution or Blocked section when Phase 07 implementation runs.
- Do **not** mark this spec resolved from the specs-only PR.

## Out of scope

- PWA
- Changing the Groq client
- playback-engine / volume-analyzer
- Reimplementing zip/manifest
- Persisting transcripts to IndexedDB

## Resolution Criteria

Mark this spec resolved when:

- [x] Isolation Demo can upload a spec-1 zip and use chunk audio as transcribe input (concatenated, matching today’s model)
- [x] Live mic and fixture blob sources still work
- [x] Bad archive / no audio show clear errors
- [x] `parseSessionArchive` is the only parser
- [x] Spec updated with a Resolution section documenting what shipped

## Resolution

**Resolved:** 2026-09-04T20:40:00Z  
**Phase:** Phase 07 — Isolation Demo upload session archive as transcribe source  
**Runner:** Cursor Cloud Agent (not Codex)

### What shipped

Isolation Demo (`isolation-demo/`) adds **Upload session archive** next to live microphone and fixture blob.

- File input accepts a session-store zip. Demo glue (`archiveSource.js`) calls session-store `parseSessionArchive` only — no zip/manifest reimplementation, no `web-whisper-db` / IndexedDB writes.
- Non-null chunk blobs are collected in `seq` order and concatenated with `new Blob(blobs, { type: mime })` (`audio/mpeg` typical), matching live `audioBlobForTranscribe()`.
- **Transcribe Audio** uses that blob in fixture mock or live Groq (`currentMode` / API key path unchanged). Output stays in the transcript panel.
- Mode chip shows `SESSION ARCHIVE` (fixture: `SESSION ARCHIVE (mock transcript)`; live Groq: `LIVE GROQ + SESSION ARCHIVE`).
- Errors: bad zip / unreadable → **Cannot read archive**; wrong `formatVersion` / kind / missing or invalid manifest → **Unsupported or invalid archive**; purged / metadata-only → **No audio in archive to transcribe**. Groq / fixture errors still use the transcript-panel path.
- Per-chunk dropdown was not added; concatenated whole-session remains the only transcribe input.

**Not changed:** Groq client (`src/transcribeAudio.js`), session-store, PWA, playback-engine, volume-analyzer.

### Automated proof

`node --test packages/lib/transcription-client/isolation-demo/archiveSource.test.js`
