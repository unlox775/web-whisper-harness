Spec Status: resolved
Spec Type: feedback
Created: 2026-09-07T22:24:00Z
Resolved: 2026-09-07T22:40:00Z
Product: apps/web-whisper-pwa
Superseded-in-part: 20260908144000-feedback-session-zip-developer-mode-only.md (Home LIBRARY import removed; import/export zip is developer-mode only)

# Feedback: PWA import session archive zip into session-store

## User Feedback

Export already ships (Session Detail Debug **Export Session**). Isolation Demos already parse the same zip via session-store `parseSessionArchive` / `importSessionArchive`. Dave still cannot load one of those archives into the **regular main PWA** as a normal session he can open, play, and inspect on iPhone.

Developer Console table JSON is not enough (blobs stripped). Isolation Demo import writes a sandbox DB, not `web-whisper-db`.

## Depends on

Phase 07-03 spec 1 — `packages/datastore/session-store/docs/specs/20260904180001-feedback-session-audio-archive-export-import.md`

Phase 07-05 debug include — `packages/datastore/session-store/docs/specs/20260906204601-feedback-session-archive-include-snips-transcript-debug.md`

`parseSessionArchive` / `importSessionArchive` already exist on **main**. Do **not** invent a second zip / manifest schema. Do **not** fork Isolation Demo parsers into the PWA.

## Requested Outcome

### 1. UI entry point

Clear **Import session zip** control on **Home and Settings** (iPhone-first, ~390px):

- File picker, `accept` `.zip` / `application/zip` / `application/x-zip-compressed`
- Not buried in Developer Console only
- Visible without recording first

### 2. Import into PWA session-store

On choose, call session-store `importSessionArchive(file)` against the PWA DB (`web-whisper-db` from `init()`). That writes:

| Archive contents | Restored |
| --- | --- |
| `manifest.json` session fields | Session metadata (`createdAt`, duration, status, …) |
| `chunks/NNN.<ext>` + manifest chunk meta | Chunk audio blobs + metas |
| `volume-profile.json` when present | Volume profile |
| `snips.json` when present | Snips |
| `transcripts.json` when present | Transcripts |

Then refresh the session list and **navigate to that session’s detail** so it behaves like a take recorded on this device (play, inspect chunks/snips/transcripts).

### 3. Slim vs debug completeness

Same zip format. Completeness is which optional files are **present**:

| Zip | Files | After import |
| --- | --- | --- |
| **Slim** (default export) | `manifest.json` + `chunks/` | Playable session. Snips / transcripts / volume profile **absent** until the user re-analyzes / transcribes on this device. |
| **Debug** (`includeDebugArtifacts`) | Slim + `snips.json` + `transcripts.json` + `volume-profile.json` | Restore those rows so a cross-browser recreate matches the exported live set. |
| Partial debug | Slim + a subset of the optional JSON files | Import what is present; do not fail. |

Show quiet helper copy on the import control, and a success toast that names slim vs debug (or which extras landed).

### 4. ID policy (no silent overwrite)

**Default: new IDs.** Use session-store’s existing default (`importSessionArchive` without `preserveIds`). Allocate a new session id and new chunk / snip ids; rewrite foreign keys. The original archive id is never written over an existing PWA session.

`preserveIds` / `overwrite` stay on the store API for Isolation Demo / tools. The PWA UI does **not** expose replace-in-place. If a future caller uses `preserveIds` and hits `id_collision`, surface the named error — do not overwrite.

### 5. Errors

Unreadable zip / unsupported format → clear user-visible message (toast + inline status). Reuse Isolation Demo wording where sensible:

| Store error | User-visible copy |
| --- | --- |
| `unsupported_format_version` | `Import failed: unsupported formatVersion (this app reads v1 only).` |
| `kind_mismatch`, `missing_manifest`, `not_a_zip` | `Import failed: {code}. Choose a web-whisper session zip.` |
| `corrupt_json`, `invalid_manifest` | same “choose a web-whisper session zip” form |
| `database_unavailable` | `Storage unavailable. Check browser storage permissions.` |
| other named errors | `Archive error: {code}` |

Do not crash. Reset the file input so the same file can be retried.

## Notes For Phase 07

- Keep product UI in `apps/web-whisper-pwa`. Consume `@web-whisper/session-store` `parseSessionArchive` / `importSessionArchive` only.
- Do **not** change snip algorithm / BLT hangover product fix.
- Do **not** change Isolation Demo layout.
- Offline only — no network required to import.
- Cursor Cloud Agent only — never Codex.
- iPhone DevTools screenshots before marking resolved: Import control visible; after importing a debug-style zip (or BLT fixture), session appears / opens with chunks (and snips if the zip had them).
- Run `make build` so `docs/` PWA artifacts refresh.

## Out of scope

- Changing snip cut math / `proposeSnipsFromProfile`
- Isolation Demo redesign / layout
- Requiring network
- Replacing Developer Console table JSON export
- Changing retention / purge policy
- A second zip schema

## Resolution Criteria

Mark this spec resolved when:

- [x] Home and Settings show **Import session zip**
- [x] Choosing a v1 web-whisper zip writes a new-id session into `web-whisper-db` (chunks; optionals when present)
- [x] App navigates to that session’s detail
- [x] Slim zip still imports and is playable; extras absent until re-analyzed
- [x] Debug zip restores snips + transcripts + profile when those files exist
- [x] Bad zip / wrong `kind` / unsupported `formatVersion` shows Isolation-Demo-style copy
- [x] Existing session ids are never overwritten silently
- [x] iPhone DevTools screenshots + `make build` + Resolution section

## Resolution

**Resolved:** 2026-09-07T22:40:00Z  
**Phase:** Phase 07 — PWA import session archive zip into session-store  
**Runner:** Cursor Cloud Agent (not Codex)

### What shipped

PWA consumes session-store `importSessionArchive` / `parseSessionArchive` only. No second zip schema.

- **Home** LIBRARY card + **Settings → App → Session archive**: **Import session zip** (hidden file input, `accept` `.zip` / zip MIME aliases).
- Import writes into the current PWA DB (`web-whisper-db`). **Always new IDs** (store default; PWA never passes `preserveIds` / `overwrite`). Existing sessions are never overwritten.
- After a successful import the list refreshes and Session Detail opens.
- **Slim zip:** chunks + manifest → playable session; snips / transcripts / volume profile absent until re-analyzed.
- **Debug zip:** restores snips + transcripts + volume profile when those JSON files are present.
- Errors reuse Isolation Demo wording (`Import failed: unsupported formatVersion (this app reads v1 only).` / `Import failed: {code}. Choose a web-whisper session zip.`). Inline status + toast.

### Proof (iPhone 12 Pro DevTools, 390×844)

- `documentation/qa/pwa-import-session-zip-home.png` — Home **Import session zip**
- `documentation/qa/pwa-import-session-zip-settings.png` — Settings import control
- `documentation/qa/pwa-import-session-zip-detail.png` — Session Detail after BLT debug zip (transcript)
- `documentation/qa/pwa-import-session-zip-chunks.png` — Debug **CHUNKS (3)**
- `documentation/qa/pwa-import-session-zip-snips.png` — Debug **SNIPS (2)** with BLT text
- `documentation/qa/pwa-import-session-zip-home-list.png` — session appears in the list
- `documentation/qa/pwa-import-session-zip-error.png` — `not_a_zip` Isolation Demo copy
- `documentation/qa/pwa-import-session-zip-slim-vs-debug.png` — slim (no extras) + debug (READY + transcript) as two new-id sessions

Fixtures: `documentation/qa/web-whisper-blt-debug-import.zip`, `documentation/qa/web-whisper-blt-slim-import.zip`.

### Automated proof

`npm test --prefix apps/web-whisper-pwa`
