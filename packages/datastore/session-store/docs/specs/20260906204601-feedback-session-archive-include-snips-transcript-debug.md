Spec Status: resolved
Spec Type: feedback
Created: 2026-09-06T20:46:01Z
Product: packages/datastore/session-store

# Feedback: Session archive — optional include snips + transcript for debug

## User Feedback

Dave exported `ses_1788550979475_nxkjk4yv` (~3m27s) from the PWA. The zip is **only** `manifest.json` + `chunks/*.mp3`. Manifest flags `hasSnips` / `hasTranscript` / `hasVolumeProfile` are **true**, but snip ranges, transcript text, and the volume profile are **not** in the archive — by design of Phase 07-03 (`exportSessionArchive` optional includes default **off**; PWA Debug **Export Session** never turns them on; session-store Isolation Demo checkboxes stay hidden).

He cannot compare **live** cuts (Debug UI: snip #9 `1:55→2:11` ends “BLT's.”; #10 `2:11→2:30` starts “BLT is cheese quesadilla”; timestamps abut) to Isolation Demo recomputes. Isolation Demo upload (`parseSessionArchive`) already returns `snips?` / `transcripts?` / `volumeProfile?` when those files exist — it just never gets them.

Need an **explicit debug option** to include live snips + per-snip transcript text (and volume profile if cheap) without changing the default slim export.

## Depends on

Phase 07-03 spec 1 (resolved) — `exportSessionArchive` / `parseSessionArchive` already support:

| Flag (default `false`) | Zip file |
| --- | --- |
| `includeSnips` | `snips.json` |
| `includeTranscripts` | `transcripts.json` |
| `includeVolumeProfile` | `volume-profile.json` |

`parseSessionArchive` already attaches those arrays/objects when present. **Do not reimplement zip/manifest.** This spec turns the existing optional path into a usable debug export and teaches Isolation Demos to **show the archived live snips**.

## Requested Outcome

### 1. Default export stays slim (v1)

Keep today’s default: `manifest.json` + `chunks/` only. Optional JSON **off**. Size-sensitive sharing (Dave’s 3m27s take) must not suddenly include profiles/transcripts unless he opts in.

PWA **Export Session** without the new debug option must still call `exportSessionArchive(sessionId)` with defaults off.

### 2. Explicit debug include (API + UI)

**API** — already exists. Keep `exportSessionArchive(sessionId, options?)` with `{ includeSnips?, includeTranscripts?, includeVolumeProfile?, notes? }` defaulting false.

Add a convenience if it reduces UI bugs (optional, document it):

```javascript
exportSessionArchive(sessionId, { includeDebugArtifacts: true })
// equivalent to includeSnips + includeTranscripts + includeVolumeProfile
```

When debug artifacts are included, each snip in `snips.json` (or a documented join of `snips.json` + `transcripts.json`) must be enough for diagnosis:

| Field | Required |
| --- | --- |
| `id` (snip id) | yes |
| `startTime` / `endTime` / `duration` (seconds) | yes |
| `chunkIds` (and/or start/end chunk index) | yes |
| transcript **text** for that snip | yes when a transcript row exists |
| `confidence` | keep if already stored |

Prefer joining transcript text onto the parsed snip list (new `parse` field such as `snipsWithTranscripts`, or document that consumers join `transcripts[].text` on `snipId`). Do not drop the separate files.

`includeVolumeProfile` should stay available; it is cheap relative to MP3 chunks. Default still off unless the debug option turns it on.

**PWA Debug Export UI** (`apps/web-whisper-pwa` — Session Detail Debug tab, next to **Export Session**):

- Add an explicit control, e.g. checkbox **Include snips + transcripts (debug)** (volume profile may share the same checkbox or a second one).
- Unchecked = today’s slim zip.
- Checked → `exportSessionArchive(sessionId, { includeSnips: true, includeTranscripts: true, includeVolumeProfile: true })` (or `includeDebugArtifacts: true`).
- Helper text: default export is audio + manifest only; debug include adds live snip ranges and transcript text for Isolation Demo comparison.
- Empty / all-purged sessions: still exportable; debug include may be a metadata-only zip **plus** snips/transcripts if those rows exist.

Do not hide this only in Developer Console. Debug tab is the product path (same as spec `20260904180002`).

**session-store Isolation Demo** — unhide optional-include checkboxes on Export (they were intentionally hidden in Phase 07-03). Sandbox DB only.

### 3. Isolation Demos: load and overlay archived live snips

Demos that already call `parseSessionArchive` must **use** optional payload when present.

**Required: volume-analyzer Isolation Demo** (`packages/lib/volume-analyzer/isolation-demo`):

- After upload, if `parsed.snips` is present (non-empty), keep those as **Live (archived)** snips: list + histogram overlay (distinct style from recomputed markers).
- Show per-snip transcript text when `parsed.transcripts` (or joined text) exists.
- If `parsed.volumeProfile` is present and cheap to draw, may overlay / skip a full re-analyze; do **not** block Compute Volume.
- User can still **Compute Volume** / move sliders and recompute via the existing `analyzeChunksVolume` → `proposeSnipsFromProfile` path (Spec A defaults). Recompute must **not** destroy the archived live set — keep both in memory for comparison (Spec C draws the diff).
- If the zip has no optional files (Dave’s current export), behave as today: chunks only; chip/status may note `hasSnips` on the manifest is a flag only — live ranges were not exported.

Playback-engine / transcription-client demos: optional. If cheap, show a one-line “archive includes N snips” and do not reimplement overlay. Do **not** make those packages block this spec.

### 4. formatVersion

**Recommendation: stay at `formatVersion` 1.** Optional `snips.json` / `transcripts.json` / `volume-profile.json` are already valid v1. A slim zip must keep parsing.

Bump to **2** only if you add a **required** new file or change required manifest fields. If you bump:

- Document `SESSION_ARCHIVE_FORMAT_VERSION`
- `parseSessionArchive` must still accept v1 slim zips
- Unknown versions still fail `unsupported_format_version`

Additive optional files or an optional `includes: { snips, transcripts, volumeProfile }` object on the manifest do **not** require a bump. Document the decision in README + this spec’s Resolution.

v1 archives without optional files remain valid forever.

## Tests

session-store `src/archive.test.js` (extend, do not replace):

- Default export still has no `snips.json` / `transcripts.json` / `volume-profile.json`
- Debug include writes those files; parse returns snips with `startTime` / `endTime` / `duration` / ids and transcript text (joined or via `transcripts[]`)
- Slim v1 zip still parses when optional files are absent
- If formatVersion stays 1: assert constant is still `1`. If bumped: v1 slim + v2 debug both parse

PWA: checkbox off → no include flags (unit test around the export helper if you extract one).

volume-analyzer Isolation Demo: mapper/test that archived snips are retained when `parseSessionArchive` returns them.

## Docs

Update `packages/datastore/session-store/README.md` archive section: debug option, default still off, formatVersion decision, field list for diagnosis.

## Notes For Phase 07

- Primary product: `packages/datastore/session-store`. Allowed consumers: PWA Debug Export + volume-analyzer Isolation Demo overlay (import `parseSessionArchive` only).
- Cursor Cloud Agent only — never Codex.
- PWA UI: iPhone DevTools screenshot of the debug-include control; `make build` for `docs/` PWA + Isolation Demo artifacts.
- Do **not** change the snip algorithm.
- Update this spec with a Resolution section when implementation ships.
- Do **not** mark this spec resolved from a specs-only commit.

## Out of scope

- Changing default export to always include snips (size)
- `proposeSnipsFromProfile` / snip-algorithm “fix”
- Spec A slider reset (may already be on the branch; do not redo it)
- Spec C overlap / n-gram doctor UI (needs this payload; implement after)
- Reimplementing zip/manifest in the PWA
- Retention / purge policy

## Resolution Criteria

Mark this spec resolved when:

- [x] Default export remains slim (chunks + manifest flags only)
- [x] PWA Debug Export and/or session-store Isolation Demo can opt in to snips + transcript text (+ volume profile)
- [x] `parseSessionArchive` exposes live snip ranges and per-snip text when included
- [x] volume-analyzer Isolation Demo overlays archived live snips when present and still allows recompute
- [x] formatVersion decision documented (stay on 1 unless a required-field bump is justified)
- [x] Slim v1 zips still parse
- [x] Spec updated with a Resolution section documenting what shipped

## Resolution

**Resolved:** 2026-09-06  
**Phase:** Phase 07-05 Spec B — session archive debug include  
**Runner:** Cursor Cloud Agent (not Codex)  
**formatVersion:** stayed at **1**. Optional `snips.json` / `transcripts.json` / `volume-profile.json` were already valid v1. Slim v1 zips (no optionals) still parse. A bump to 2 would only be justified by a required new file or required manifest field.

### What shipped

**session-store** (`src/archive.js`) — optional includes still default **false**. New convenience `includeDebugArtifacts: true` is equivalent to `includeSnips` + `includeTranscripts` + `includeVolumeProfile` (individual flags still OR on). `parseSessionArchive` still returns separate `snips` / `transcripts` / `volumeProfile` when those files exist, and now also attaches `snipsWithTranscripts` (join on `snipId`) with `id`, `startTime`, `endTime`, `duration`, `chunkIds`, chunk indexes, `confidence`, and `text` when a transcript row exists. Helpers: `resolveArchiveIncludeFlags`, `joinSnipsWithTranscripts`.

**session-store Isolation Demo** — Export checkboxes unhidden: **Include snips + transcripts (debug)** plus the three individual optional files. Sandbox DB only. Default remains slim.

**PWA Debug Export** (`SessionDetailScreen` / `exportSession.ts`) — checkbox **Include snips + transcripts (debug)** next to Export Session. Off → `exportSessionArchive(sessionId)` (no include flags). On → `{ includeDebugArtifacts: true }`. Helper text documents slim vs debug.

**volume-analyzer Isolation Demo** — after `parseSessionArchive`, non-empty snips become **Live (archived)** (list + amber dashed histogram overlay + transcript text). Compute Volume / sliders still recompute via `proposeSnipsFromProfile` and do **not** drop the archived live set. Slim zips stay chunks-only; status notes when `hasSnips` is a flag only.

### How to repro

1. PWA Session Detail → Debug: Export Session with the debug checkbox **off** → zip is `manifest.json` + `chunks/` only (`hasSnips` may still be true).
2. Check **Include snips + transcripts (debug)** → zip also has `snips.json`, `transcripts.json`, `volume-profile.json`.
3. Upload that debug zip in volume-analyzer Isolation Demo → **Live (archived)** list + overlay; Compute Volume still proposes a second set.
4. Upload a slim zip → chunks only; chip may say `hasSnips` is a flag only.

### Tests / publish

- `packages/datastore/session-store/src/archive.test.js` — default slim; `includeDebugArtifacts` round-trip + joined text; formatVersion still `1`; slim v1 without optionals still parses.
- `apps/web-whisper-pwa/src/exportSession.test.ts` — checkbox off omits include flags.
- `packages/lib/volume-analyzer/isolation-demo/src/archiveSource.test.ts` — mapper retains archived snips/text from parse.
- `make build` publishes PWA `docs/` + Isolation Demo artifacts.
