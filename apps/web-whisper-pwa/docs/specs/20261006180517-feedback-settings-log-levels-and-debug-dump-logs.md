Spec Status: unresolved
Spec Type: feedback
Created: 2026-10-06T18:05:17Z
Product: apps/web-whisper-pwa

# Feedback: Settings log levels and debug dump logs

## User Feedback

Dave needs Advanced Settings control over **per-package** log levels, a way to see **approximate log byte sizes**, and logs **inside the existing Debug dump / session export** so a bad take is a single zip he can hand to agents.

Logging is durable in session-store (not a new package). This spec is PWA orchestration + Settings + export UI only.

## Depends on

- Session-store durable logs + archive `includeLogs` — `packages/datastore/session-store/docs/specs/20261006180517-feedback-durable-per-package-logging.md`
- Prior Debug export (resolved) — `20260904180002-feedback-debug-export-session-download.md`
- Debug include snips/transcripts (resolved) — session-store `20260906204601-feedback-session-archive-include-snips-transcript-debug.md`
- Developer-mode-only zip (resolved) — `20260908144000-feedback-session-zip-developer-mode-only.md`

Does **not** wait on transcription-coverage or flush-before-retention specs (separate PWA agents).

## Requested Outcome

### 1. Advanced Settings — per-package levels

In Settings, **Advanced** (developer / advanced disclosure is fine; do not clutter the default Groq-key surface):

For each package id:

- `session-store`
- `capture-engine`
- `volume-analyzer`
- `transcription-client`
- `playback-engine`
- `web-whisper-pwa`

A control: `debug` / `info` / `warn` / `error` / `off`.

Persist in localStorage (same family as storage cap / developer mode). On boot and on change, call:

```javascript
sessionStore.configureLogger({
  levels: { /* packageId → level */ },
  activeSessionId: currentActiveTakeId ?? null
})
```

Default level per package: **`info`** (debug gated unless Dave turns it on).

### 2. Approximate log byte sizes

Settings (Advanced, near the level controls or Storage chip) shows approximate sizes from session-store:

- Total log bytes (format like other storage: “1.2 MB logs”)
- Optional per-package breakdown from `getLogByteSizes().byPackage`

This is **approximate**. Do not live-poll every second; refresh on Settings open and after retention / export.

### 3. Wire the recording / session id into the logger

When the user starts a take (`createSession` → `startCapture`):

- `configureLogger({ activeSessionId: session.id })` (or merge with current levels)

Keep that id set through **live ingest** and **post-stop** ingest / leftover transcription for that session so volume-analyzer and transcription-client logs still persist after Stop.

Clear `activeSessionId` when the PWA is idle (no capture, no in-flight ingest/tx for that id). Opening an old session for playback does **not** have to set it unless Debug logging for that session is explicitly desired; playback-engine may pass `{ sessionId }` on `log()`.

Lib packages emit via `sessionStore.log(packageId, level, () => payload)`. The PWA does not reimplement the gates.

### 4. Debug dump / Export Session includes logs

Do **not** reinvent zip. Extend the existing Session Detail Debug **Export Session** path:

- Slim export (debug-include unchecked): still `exportSessionArchive(sessionId)` defaults — **no** logs.
- Debug include checked (`includeDebugArtifacts: true` or the existing “Include snips + transcripts (debug)” control): also send `includeLogs: true` (or rely on `includeDebugArtifacts` turning logs on in session-store).
- Optional extra checkbox **Include logs** if that is clearer than folding into the existing debug include — default **off** for slim; **on** when the debug-include bundle is on. Document the choice.

Filename / object-URL / revoke pattern unchanged (`web-whisper-session-<id>-<timestamp>.zip`).

Empty / purged sessions: still exportable; logs may be the only useful payload.

Developer Console table JSON dump is **not** a substitute. Debug tab remains the product path.

If a separate “Debug dump” already exists besides Export Session, include logs there too (same store query / same archive flag). Do not invent a second zip format.

### 5. Isolation Demos

Out of scope for this PWA spec. Session-store Isolation Demo (other spec) is where a log dump control lands.

## Notes For Phase 07

- Keep changes scoped to `apps/web-whisper-pwa` (Settings, logger wiring, Debug export flags).
- Consume session-store APIs only; do not copy zip writers or a log object store into the PWA.
- Do not implement capture `flushPending` or transcript coverage in this PR.
- Cursor Cloud Agent only — never Codex.
- iPhone-first Settings + Debug tab proof shots in `documentation/qa/` before marking resolved.
- Run **`make build`** from the repo root in the implementation PR (refresh `docs/` PWA artifacts only).
- Update this spec with a Resolution or Blocked section when Phase 07 implementation runs.
- Do **not** mark this spec resolved from the specs-only PR.

## Out of scope

- session-store schema / `log()` implementation
- capture-engine persist queue
- Awaiting flush before retention
- Transcription coverage / `partial` copy
- Changing slim-export default to include logs
- Bumping archive `formatVersion`

## Resolution Criteria

Mark this spec resolved when:

- [ ] Advanced Settings has per-package `debug`/`info`/`warn`/`error`/`off` and persists them
- [ ] Settings shows approximate log byte sizes from session-store
- [ ] Active recording / ingest session id is configured on the logger; idle clears it
- [ ] Debug **Export Session** (debug-include path) includes `logs.json` via session-store flags; slim export does not
- [ ] iPhone DevTools screenshot of Settings levels + sizes, and Debug export helper
- [ ] `make build` published `docs/` PWA artifacts
- [ ] Spec updated with a Resolution section documenting what shipped
