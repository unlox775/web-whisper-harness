Spec Status: unresolved
Spec Type: feedback
Created: 2026-09-04T18:00:01Z
Product: packages/datastore/session-store

# Feedback: Session audio archive export/import

## User Feedback

Dave needs to export a bad or failed recording as a **downloadable archive** (metadata + audio chunks), then upload that archive into Isolation Demos that take audio input so he can re-iterate offline and share the take with agents.

Existing today: DeveloperConsole `dumpStore` / **Export Table as JSON** (`apps/web-whisper-pwa/src/screens/DeveloperConsole.tsx`). That dumps **tables only**. `jsonReplacer` turns `Blob` into `{ __blob, size, type }` — **no audio bytes**. Not enough for a failed take.

`getChunksForSession` already returns metadata (id/seq/times/duration/sizeBytes/`audioPurgedAt`) and `getChunk` still has the blob when it has not been purged (`isChunkAudioPurged`). Retention may have replaced audio with an empty blob and set `audioPurgedAt` (`src/retention.js`).

## Requested Outcome

Define a **versioned portable archive** and session-store APIs to export, parse, and import it. Isolation demos in **this package** get Export / Import. Other packages’ demos and the PWA UI are out of scope (they consume these APIs in later specs).

### Archive format

Prefer **zip** built in the browser (and in `node:test`). Document:

| Field | Value |
| --- | --- |
| Container | ZIP |
| MIME | `application/zip` (also accept `application/x-zip-compressed` on import) |
| Filename | `web-whisper-session-<id>-<timestamp>.zip` (`<timestamp>` = ISO-ish or epoch ms; document the exact pattern) |
| `formatVersion` | integer, start at **`1`** |

Do **not** invent a second custom container (tar, folder-of-files download) unless zip is impossible in the test environment — then document why and still emit a single `Blob`.

### Zip contents (minimum)

```
manifest.json
chunks/NNN.<ext>     # only for chunks that still have audio
```

**`manifest.json`** (required):

- `formatVersion` (number, `1`)
- `exportedAt` (ISO-8601 string)
- `kind`: `"web-whisper-session-archive"` (stable discriminator so demos can reject random zips)
- Session **row fields** as stored today: at least `id`, `createdAt`, `updatedAt`, `duration`, `chunkCount`, `sizeBytes`, `hasVolumeProfile`, `hasSnips`, `hasTranscript`, `status`
- `chunks`: list of chunk metadata, **including purged rows**:
  - `id`, `seq`, `startTime`, `endTime`, `duration`, `mime`, `sizeBytes`
  - `audioPurgedAt` if set
  - `file`: relative path `chunks/NNN.<ext>` when audio is present, or `null` when purged / empty
- Optional `notes` (string)

`NNN` is the chunk `seq` zero-padded (e.g. `000`, `001`). `<ext>` comes from MIME (`audio/mpeg` → `mp3`, `audio/webm` → `webm`, else a documented fallback such as `bin`).

**Purged / empty blobs:** skip writing bytes. Still list the chunk in `manifest.json` with `audioPurgedAt` (or equivalent) and `file: null`. A metadata-only zip (all chunks purged, or a session with zero chunks) is a valid archive.

### Optional include (default OFF)

Dave said these are **not required**. Document as export flags, all default **`false`**:

- `includeSnips` → `snips.json`
- `includeTranscripts` → `transcripts.json`
- `includeVolumeProfile` → `volume-profile.json`

Import/parse may ignore missing optional files. Do not fail a v1 archive that only has `manifest.json` + `chunks/`.

### Public APIs

Export from `src/index.js` (names may vary slightly; keep them documented and tested):

```javascript
exportSessionArchive(sessionId, options?) => Promise<Blob>
parseSessionArchive(blob) => Promise<{
  formatVersion: number,
  exportedAt: string,
  session: object,          // session row fields from manifest
  notes?: string,
  chunks: Array<{ meta: object, blob: Blob | null }>,
  snips?: Array<object>,
  transcripts?: Array<object>,
  volumeProfile?: object
}>
importSessionArchive(blob, options?) => Promise<{ sessionId: string, chunkIds: string[] } | { error: string }>
```

**`exportSessionArchive`**

- Reads the current DB (`getSession`, `getChunksForSession`, `getChunk`).
- Builds the zip `Blob` (`type: 'application/zip'`).
- Options: `{ includeSnips?, includeTranscripts?, includeVolumeProfile?, notes? }` — all optional includes default `false`.
- Errors: `session_not_found`, `database_unavailable` (same style as existing store errors). Returning `{ error }` vs throw: pick one, match this package, document it.

**`parseSessionArchive` (parse-only — required)**

Isolation demos in other packages must use this helper and **must not** reimplement the zip/manifest format.

- Does **not** write IndexedDB.
- Returns session fields + chunks as `{ meta, blob | null }` (purged → `blob: null`).
- Rejects clearly: not a zip, missing `manifest.json`, `kind` mismatch, unsupported `formatVersion`, corrupt JSON.
- Unknown future `formatVersion`: fail with a named error (e.g. `unsupported_format_version`), do not silently guess.

**`importSessionArchive`**

Recreates session + chunks in the **current** DB (PWA `web-whisper-db` or the Isolation Demo sandbox, whichever `init()` opened).

**ID policy (pick and document — this spec picks):**

- **Default: new IDs.** Allocate a new session id (`generateId('ses')`) and new chunk ids. Rewrite `sessionId` on imported chunks. Safer when the original session still exists.
- Optional `options.preserveIds === true`: keep archive ids if they do not collide; if they collide, return a named error (do not silently overwrite) unless you also document an explicit `overwrite` flag (default off).

Optional JSON files: import only if they were exported and the corresponding option is on (or “import whatever is in the zip” — pick one and document). Default recommendation: import optionals when present; they are not required for a valid round-trip of session+chunks.

### Isolation Demo (this package only)

`packages/datastore/session-store/isolation-demo` — sandbox DB `web-whisper-isolation-demo-session-store` only. Never open `web-whisper-db`.

Add:

- **Export selected session** — downloads `web-whisper-session-<id>-<timestamp>.zip` via `exportSessionArchive`. Needs a selected / details session (use the existing Details row or a session-id field).
- **Import archive** — file input; `importSessionArchive` into the sandbox DB; session list refreshes.

Show a clear error for a bad zip / wrong `formatVersion`. Optional-include checkboxes may stay hidden (defaults off) unless they are cheap to add.

### Tests

`node:test` in this package (follow `src/storage.retention.test.js` + `fake-indexeddb`):

- Export → `parseSessionArchive` round-trip: session fields, chunk meta, blob bytes for non-purged chunks.
- Purged chunk: listed in manifest, `blob: null`, no zip entry (or empty skipped).
- Metadata-only session (no chunks, or all purged) still parses.
- Bad zip / missing manifest / wrong `formatVersion` → named error.
- If `importSessionArchive` ships: import creates a playable session (new ids by default); original session still present when importing into a DB that already has it.

### Docs

Package README (and Isolation Demo README if needed): format, MIME, filename, `formatVersion`, ID policy, optional flags default off, parse-only vs import.

## Notes For Phase 07

- Keep changes scoped to `packages/datastore/session-store`.
- Do **not** add PWA Export Session UI (spec `20260904180002`).
- Do **not** change playback-engine / volume-analyzer / transcription-client Isolation Demos (specs `20260904180003`–`005`).
- Do **not** change retention / purge policy.
- Cursor Cloud Agent only — never Codex.
- Update this spec with a Resolution or Blocked section when Phase 07 implementation runs.
- Do **not** mark this spec resolved from the specs-only PR.

## Out of scope

- PWA Session Detail / Developer Console UI
- Other packages’ Isolation Demos
- Changing `enforceRetentionPolicy` or storage cap behavior
- Requiring snips / transcripts / volume-profile in every archive

## Resolution Criteria

Mark this spec resolved when:

- [ ] Versioned zip format documented (MIME, filename, `formatVersion`, manifest + `chunks/`)
- [ ] `exportSessionArchive` and `parseSessionArchive` exported and tested
- [ ] `importSessionArchive` implemented **or** explicitly deferred in Resolution with parse-only sufficient for demos — prefer implementing import for this package’s Isolation Demo
- [ ] Purged chunks listed, bytes skipped
- [ ] Optional includes documented, default off
- [ ] Isolation Demo: Export selected session + Import archive
- [ ] Spec updated with a Resolution section documenting what shipped
