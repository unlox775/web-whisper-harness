Spec Status: unresolved
Spec Type: feedback
Created: 2026-09-07T22:24:00Z
Product: apps/web-whisper-pwa

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

- [ ] Home and Settings show **Import session zip**
- [ ] Choosing a v1 web-whisper zip writes a new-id session into `web-whisper-db` (chunks; optionals when present)
- [ ] App navigates to that session’s detail
- [ ] Slim zip still imports and is playable; extras absent until re-analyzed
- [ ] Debug zip restores snips + transcripts + profile when those files exist
- [ ] Bad zip / wrong `kind` / unsupported `formatVersion` shows Isolation-Demo-style copy
- [ ] Existing session ids are never overwritten silently
- [ ] iPhone DevTools screenshots + `make build` + Resolution section
