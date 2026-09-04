Spec Status: unresolved
Spec Type: feedback
Created: 2026-09-04T18:00:02Z
Product: apps/web-whisper-pwa

# Feedback: Debug Export Session download

## User Feedback

Dave needs to download a bad/failed recording as a **session archive** (metadata + audio chunks) from the PWA — not only table JSON from Developer Console.

Today:

- DeveloperConsole **Export Table as JSON** (`src/screens/DeveloperConsole.tsx`) calls `dumpStore` and stringifies rows. Blobs become `{ __blob, size, type }` via `jsonReplacer` (`src/format.ts`). No audio.
- Session Detail Debug tab (`src/screens/SessionDetailScreen.tsx`) can download **one** chunk (`downloadChunk` → `chunk-<id>.mp3`) or one snip (`downloadSnip` → concatenated mp3). There is no whole-session archive.

That is not a portable failed-take package he can hand to Isolation Demos or agents.

## Depends on

Phase 07-03 spec 1 — `packages/datastore/session-store/docs/specs/20260904180001-feedback-session-audio-archive-export-import.md`

`exportSessionArchive(sessionId, options?)` must exist on **main** (or on the branch this PWA spec implements against after spec 1 merges). Do **not** reimplement zip/manifest in the PWA.

## Requested Outcome

On **Session Detail**, add **Export Session** that downloads the archive from session-store.

### Placement

- **Required:** Debug tab (`detailTab === 'debug'`, `src/screens/SessionDetailScreen.tsx`). A full-width or clearly labeled button such as **Export Session** near the Debug kicker / Chunks·Snips pills — not buried in Developer Console.
- Developer mode is fine as an *additional* surface; it is **not** sufficient by itself. Debug tab is the product path.
- Do not hide the control behind a long-press, secret URL, or console-only dump.

### Behavior

1. Call `sessionStore.exportSessionArchive(sessionId)` (optional includes stay default **off** unless you add an advanced disclosure; Dave does not require snips/transcripts/volume-profile).
2. Trigger a browser download:
   - Filename: `web-whisper-session-<id>-<timestamp>.zip` (match session-store docs)
   - Object URL + `<a download>` (same pattern as `downloadChunk` / DeveloperConsole `exportJson`)
3. Revoke the object URL after click.

### Empty / purged states

Document and implement:

| State | Control | Notes |
| --- | --- | --- |
| Session has playable chunk audio | Enabled **Export Session** | Full archive (manifest + `chunks/` bytes) |
| Session has chunks but **all** purged (`audioPurgedAt` / empty blobs) | **Still enabled** (metadata-only) | Helper text: archive has metadata, no audio bytes. Useful for sharing what was recorded / purged. |
| Session has **no chunks** | **Still enabled** (metadata-only) **or** disabled with copy — pick one and document. Prefer **allow** metadata-only so a failed empty take is still exportable. | Quiet helper: “No audio chunks — export is metadata only.” |
| Export API error | Toast the store error; do not crash | Same toast style as other session-detail failures |

Do **not** pretend a metadata-only zip contains playable audio.

### iPhone-first proof

Screenshot the Session Detail **Debug** tab showing the **Export Session** control (iPhone DevTools ~390px or device). Required before marking resolved. Check in under `documentation/qa/` (or link in Resolution).

### Publish

Run **`make build`** from the repo root before push. Refresh `docs/` PWA artifacts only; leave harness/docs files in `docs/` in place.

## Notes For Phase 07

- Keep changes scoped to `apps/web-whisper-pwa`.
- Consume session-store APIs only; do not copy zip writers into the PWA.
- Do not change Isolation Demos (other specs).
- Do not change retention / purge policy.
- Cursor Cloud Agent only — never Codex.
- Update this spec with a Resolution or Blocked section when Phase 07 implementation runs.
- Do **not** mark this spec resolved from the specs-only PR.

## Out of scope

- Isolation Demo work (session-store, playback-engine, volume-analyzer, transcription-client)
- Changing retention / `enforceCap`
- Replacing Developer Console table JSON export (leave it; this is a different artifact)
- Requiring optional snips/transcripts/volume-profile in the downloaded zip

## Resolution Criteria

Mark this spec resolved when:

- [ ] Debug tab has a visible **Export Session** control that downloads the session-store archive
- [ ] Empty / all-purged behavior is documented and matches the table above
- [ ] Control is not console-only
- [ ] iPhone DevTools screenshot of the control
- [ ] `make build` published `docs/` PWA artifacts
- [ ] Spec updated with a Resolution section documenting what shipped
