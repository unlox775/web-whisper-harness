# Phase 07: Session audio archive export/import

**Package**: packages/datastore/session-store  
**Spec**: packages/datastore/session-store/docs/specs/20260904180001-feedback-session-audio-archive-export-import.md  
**Status**: unresolved  
**Runner**: Cursor Cloud Agent (not Codex)

## Model / runner notes (read first)

- Implement this spec with a **Cursor Cloud Agent**. Do **not** call Codex (`codex exec` or any Codex CLI).
- This job is **session-store only** (library + this package’s Isolation Demo + tests). Do not edit the PWA or other packages’ demos.
- Not a PWA UI change. Isolation Demo Export/Import is enough; iPhone DevTools screenshots are not required here.
- Do **not** run `make build` unless PWA publish output actually changed (it should not).
- Do **not** mark the spec resolved until format + APIs + tests + Isolation Demo buttons exist, then add a Resolution section.

## Task Summary

Dave cannot share a failed take: `dumpStore` / Export Table as JSON drops audio blobs. Ship a versioned **zip** archive (manifest + chunk bytes) with `exportSessionArchive`, parse-only `parseSessionArchive` (other demos will consume this), and `importSessionArchive` into the current DB.

## What to Change

### 1. Archive format (`src/` — new module is fine)

- Zip in the browser / `node:test`; MIME `application/zip`; filename `web-whisper-session-<id>-<timestamp>.zip`
- `manifest.json`: `formatVersion` (start at `1`), `exportedAt`, `kind: "web-whisper-session-archive"`, session row fields, chunk meta list (`id`/`seq`/`startTime`/`endTime`/`duration`/`mime`/`sizeBytes`/`audioPurgedAt`/`file`), optional `notes`
- `chunks/NNN.<ext>` only when audio is still present; purged/empty listed in manifest with `file: null`
- Optional `snips.json` / `transcripts.json` / `volume-profile.json` behind flags, **default OFF**

### 2. Public APIs (`src/index.js`)

- `exportSessionArchive(sessionId, options?) => Promise<Blob>`
- `parseSessionArchive(blob)` — **no IndexedDB writes**; `{ session, chunks: [{ meta, blob|null }] }`
- `importSessionArchive(blob, options?)` — recreate session+chunks in the **current** DB; **new IDs by default** (document; optional `preserveIds`)

### 3. Isolation Demo (this package)

Export selected session + Import archive file input. Sandbox DB only (`web-whisper-isolation-demo-session-store`). Never open `web-whisper-db`.

### 4. Tests

`node:test` + `fake-indexeddb`: export/parse round-trip, purged skip bytes, metadata-only, bad zip / wrong `formatVersion`, import new-ids if import ships.

## What NOT to Change

- Do NOT add PWA Export Session UI (spec `20260904180002`)
- Do NOT edit playback-engine / volume-analyzer / transcription-client Isolation Demos
- Do NOT change retention / purge policy
- Do NOT commit `node_modules`, `dist`, or lockfile surprises

## Stop Conditions

Mark spec resolved when:

1. Zip format + APIs documented and exported
2. `parseSessionArchive` works without writing the DB
3. Isolation Demo can export and import
4. Tests cover round-trip and bad archives
5. Spec has a Resolution section

## Implementation Prompt

```
Implement session-store session audio archive export/import per
packages/datastore/session-store/docs/specs/20260904180001-feedback-session-audio-archive-export-import.md

Use a Cursor Cloud Agent. Do NOT call Codex.

Requirements:
1. Versioned zip: application/zip, filename web-whisper-session-<id>-<timestamp>.zip, formatVersion 1.
2. manifest.json + chunks/NNN.<ext>; purged chunks listed, bytes skipped.
3. exportSessionArchive, parseSessionArchive (no DB write), importSessionArchive (new ids by default).
4. Optional snips/transcripts/volume-profile flags default OFF.
5. Isolation Demo: Export selected session + Import archive. Sandbox DB only.
6. node:test round-trip export/parse (and import if implemented).
7. When complete, update the spec with a Resolution section.

Do NOT:
- Add PWA UI
- Edit other packages’ Isolation Demos
- Change retention
- Commit node_modules, dist, or lockfiles

Stop when the spec is resolved with Resolution, APIs, tests, and Isolation Demo buttons.
```
