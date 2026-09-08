Spec Status: resolved
Spec Type: feedback
Created: 2026-09-08T14:39:00Z
Resolved: 2026-09-08T15:35:00Z
Product: packages/lib/transcription-client

# Feedback: Isolation Demo — paste API key, persist, archive mock, step-through

## User Feedback

Dave used the transcription-client Isolation Demo on iPhone (Pages at `isolation-demos/transcription-client/`). Screenshot showed **SESSION ARCHIVE** mock mode. Problems:

1. **Cannot paste** into the Groq API key field. Must support clipboard paste on mobile and desktop.
2. Pasted/typed key must **persist in localStorage** (demo namespace is fine) and restore on load. Optional: also try a key the main PWA already stored. Do not break if that key is missing.
3. **Upload session archive + Transcribe** in mock/fixture mode currently returns fixture text (`This is a test transcription from fixture audio`). That looked like a real archive transcript and confused him.
4. Transcription is **one shot / one flutter of requests**. He wants **step-through** like the volume-analyzer Isolation Demo: Next / step controls to transcribe **one snip (or one segment) at a time**.

## Current behavior

`isolation-demo/demo.js` + `index.html`:

- Groq API key `<input>` is `disabled` whenever Live Groq is off (`currentMode !== 'live'`). Disabled fields reject focus and clipboard paste on iOS Safari (and desktop). Dave’s screenshot was mock / SESSION ARCHIVE, so the field was disabled.
- Comment in `demo.js` says the key is **not** written to storage. Reserved unused prefix: `ww-iso-transcription-client:`. Reload loses the key.
- Archive upload (`archiveSource.js`) concatenates chunk blobs and calls `transcribeAudio(blob, { mode })`. In fixture mode that always returns the hardcoded fixture sentence — unlabeled, looks real.
- One **Transcribe Audio** button sends the whole concatenated blob (or one fixture/live blob). No Next / step.

PWA stores its key at `localStorage['groq_api_key']` (`apps/web-whisper-pwa/src/settings.ts`). Isolation Demo must not write that key.

## Requested Outcome

Isolation Demo only (`packages/lib/transcription-client/isolation-demo/**` + this spec + isolation-demo README). Do not change the Groq client, PWA snip-vs-chunk behavior, volume-analyzer zoom, or the developer-mode import gate.

### 1. Paste

The Groq API key field must accept clipboard paste (long-press / Cmd-V / Ctrl-V) in **both** mock and live.

- Do **not** `disabled` or `readonly` the key field. Fixture mode may still hide Validate / skip live HTTP until Live Groq is on.
- Do not `preventDefault` on `paste` unless inserting the clipboard text yourself.
- Keep `-webkit-user-select: text` on the field.
- A **Paste** button that uses `navigator.clipboard.readText()` is allowed as a fallback. If the Clipboard API is blocked (common on iOS), fall back to focusing the field and telling the operator to long-press → Paste. Do not fail the page.

### 2. Persist / restore

| Priority | localStorage key | When |
| --- | --- | --- |
| 1 | `ww-iso-transcription-client:groqApiKey` | Demo namespace. Write on type/paste. Restore first on load. |
| 2 | `groq_api_key` | PWA settings key. **Read only** if the demo key is missing. Do not write. Missing is fine. |

Document these keys in the isolation-demo README. Reset must **not** wipe the persisted demo key (reload convenience is the point). Never write into `web-whisper-db` or PWA settings.

### 3. Archive + mock must not look real

When a session archive is the audio source:

- **Fixture / mock mode:** do **not** call `transcribeAudio` with the archive blob. Refuse with clear copy: `Switch to Live Groq API to transcribe this archive`. Show it as an error / warning — never the fixture sentence.
- **Live Groq mode:** send archive-derived audio on the existing live path (`transcribeAudio(blob, { mode: 'live', apiKey })`).

Fixture blob and live-mic mock remain allowed (those are not archive transcripts). Optional MOCK label on fixture-blob output is fine; it is required that archive+mock never looks like a real transcript.

### 4. Step-through transcription (archive)

Mirror volume-analyzer’s **Step next** idea, for transcription units:

- Prefer **snips** when `parseSessionArchive` returns `snips` / `snipsWithTranscripts` with assemble-able audio.
- Slim zip (chunks only, or `hasSnips: true` flag without `snips.json`): step through **chunks** (one playable chunk per Next). Document this choice.
- Assemble a snip the same way the PWA live path does: concatenate that snip’s `chunkIds` blobs (`audio/mpeg`). If `chunkIds` is empty, overlap chunks by `startTime` / `endTime`.
- **Next**: transcribe **one** unit, then stop.
- **Transcribe remaining** (or Transcribe Audio on archive): sequential remaining units, visible per-unit output — not one unlabeled concatenated fixture string.
- Live Groq only for archive units (see §3). Output stays in the demo transcript panel (no session-store / IndexedDB writes).

## Isolation Demo only

`packages/lib/transcription-client/isolation-demo/**`, this spec, isolation-demo README. Importing `parseSessionArchive` remains allowed. Do not edit session-store, the Groq client, or other packages’ demos.

## Out of scope

- Main PWA snip-vs-chunk bug
- Volume-analyzer histogram zoom
- Developer-mode import gate
- Changing Groq retry / model / endpoint
- Persisting transcripts

## Resolution Criteria

Mark this spec resolved when:

- [x] API key field accepts paste (field never disabled; Paste fallback documented)
- [x] Key persists under `ww-iso-transcription-client:groqApiKey` and restores on load; optional read of `groq_api_key` does not break if missing
- [x] Archive + mock refuses with `Switch to Live Groq API to transcribe this archive` (no fixture sentence)
- [x] Live Groq sends archive-derived unit audio on the existing live path
- [x] Next / step transcribes one snip when snips exist, else one chunk; README documents the choice
- [x] Spec updated with a Resolution section documenting what shipped

## Resolution

**Resolved:** 2026-09-08T15:35:00Z  
**Phase:** Phase 07 — Isolation Demo paste, persist, archive mock, step-through  
**Runner:** Cursor Cloud Agent (grok-4.6, not Codex)

### What shipped

Isolation Demo only (`isolation-demo/`). Groq client and PWA unchanged.

**Paste.** `#apiKeyInput` is never `disabled` / `readonly` (that was blocking iOS/desktop clipboard). Native `paste` inserts clipboard text and persists. **Paste** button uses `navigator.clipboard.readText()`; if the Clipboard API is blocked, the field is focused and the operator is told to long-press → Paste.

**Persist.** Type/paste writes `localStorage['ww-iso-transcription-client:groqApiKey']`. On load, restore that key first; if missing, **read** PWA `groq_api_key`. Missing is fine. Never writes `groq_api_key`. Reset does not wipe the demo key.

**Archive + mock.** `ARCHIVE_MOCK_REFUSE` = `Switch to Live Groq API to transcribe this archive`. Transcribe remaining / Next in fixture mode do not call `transcribeAudio` on archive units. Chip: `SESSION ARCHIVE (mock — will not transcribe zip)`. Yellow warning after a zip is loaded.

**Archive + live Groq.** Each unit is `transcribeAudio(unit.blob, { mode: 'live', apiKey })` — existing live path.

**Step units.** Prefer snips when `snips.json` / `snipsWithTranscripts` has assemble-able audio (concat `chunkIds`, same as PWA; empty `chunkIds` → time overlap). Slim zip (no snips.json, or `hasSnips` flag only) steps **chunks**. Next = one unit; Transcribe remaining = sequential leftover units.

### Automated proof

`node --test` in `isolation-demo/` (`archiveSource.test.js`, `apiKeyStore.test.js`).

### Manual proof

iPhone DevTools 390×844: key field enabled + paste/Paste, key restored after reload, archive+mock refuse copy, Next snip / Next chunk visible. Native iOS long-press Paste cannot be automated in this VM; field is enabled and the paste handler is wired.
