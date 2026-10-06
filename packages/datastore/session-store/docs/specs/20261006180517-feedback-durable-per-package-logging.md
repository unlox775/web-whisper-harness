Spec Status: unresolved
Spec Type: feedback
Created: 2026-10-06T18:05:17Z
Product: packages/datastore/session-store

# Feedback: Durable per-package logging

## User Feedback

Dave needs **durable** per-package logs he can export with a failed take — not `console.log` and not memory-only browser-session logs.

Today a long recording that stalls or mis-reports transcription leaves him without a portable log trail. Settings also cannot show how many bytes logs occupy under the existing storage-cap story.

Code Monkey locked the slice: **session-store owns durable log entries in IndexedDB**. Do **not** invent a `package-logger` product. Logging is durable data; this package already owns sessions, chunks, snips, transcripts, and retention.

## Depends on

None (producer of the log store). Consumers:

- PWA settings + debug dump — `apps/web-whisper-pwa/docs/specs/20261006180517-feedback-settings-log-levels-and-debug-dump-logs.md`
- Capture persist / retention serialization — `packages/lib/capture-engine/docs/specs/20261006180517-feedback-resilient-persist-queue-and-flushpending.md` and `apps/web-whisper-pwa/docs/specs/20261006180517-feedback-await-flushpending-before-retention.md` (those specs consume `writeChunk` / `enforceRetentionPolicy` rules below; they do not block this store API)

Extends (do not reinvent zip):

- `20260904180001-feedback-session-audio-archive-export-import.md` (resolved)
- `20260906204601-feedback-session-archive-include-snips-transcript-debug.md` (resolved)
- PWA Debug **Export Session** — `apps/web-whisper-pwa/docs/specs/20260904180002-feedback-debug-export-session-download.md` (resolved)

## Requested Outcome

### 1. Own logs in this package (no new product)

Add an IndexedDB object store (suggested name `logs` or `package-logs`) alongside the existing five stores.

Suggested record:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Store-generated, unique |
| `sessionId` | string | Active take / explicit override (required on every persisted row) |
| `packageId` | string | Stable id from the list below |
| `level` | `'debug' \| 'info' \| 'warn' \| 'error'` | Never persist `off` |
| `message` | string | Short line |
| `details` | unknown (optional) | JSON-serializable only; drop or stringify non-JSON |
| `createdAt` | ISO-8601 string | Persist time |
| `sizeBytes` | number | Approximate serialized size for byte accounting |

Indexes (minimum): `by-sessionId`, `by-packageId`, `by-createdAt`. A compound `by-sessionId-createdAt` is preferred if it keeps range queries cheap.

`deleteSession(sessionId)` **must cascade-delete** that session’s log rows (after transcripts / snips / volume / chunks, or in the same transaction). No orphan logs.

### 2. Package ids (frozen list)

Call sites and Settings use these strings only:

- `session-store`
- `capture-engine`
- `volume-analyzer`
- `transcription-client`
- `playback-engine`
- `web-whisper-pwa`

Do not invent a seventh product id in this spec. Unknown ids: persist is allowed (forward-compatible) but Settings only shows the list above.

### 3. Logger API — lazy payloads, two gates

Export from this package (names may vary slightly; keep them documented and tested):

```javascript
configureLogger(options: {
  levels?: { [packageId: string]: 'debug' | 'info' | 'warn' | 'error' | 'off' },
  activeSessionId?: string | null
}) => void | { error }

getLoggerConfig() => {
  levels: { [packageId: string]: LogLevel },
  activeSessionId: string | null
}

log(
  packageId: string,
  level: 'debug' | 'info' | 'warn' | 'error',
  payload: string | (() => string | { message: string, details?: unknown }),
  options?: { sessionId?: string }
) => { written: true } | { skipped: true, reason: 'gated_level' | 'no_active_session' } | { error }
```

**Lazy contract (load-bearing):**

1. Resolve the session id: `options.sessionId ?? config.activeSessionId`.
2. If that session id is missing / empty → **do not invoke** a function payload. Return `{ skipped: true, reason: 'no_active_session' }`. Zero work building the message.
3. Resolve the package level (default **`info`** if unset). Rank: `debug < info < warn < error`. `off` gates everything.
4. If `level` is below the configured package level, or the package is `off` → **do not invoke** a function payload. Return `{ skipped: true, reason: 'gated_level' }`.
5. Only then invoke `payload` if it is a function (or use the string as `message`). Persist the row with the resolved `sessionId`.

Call sites pass `() => ({ message, details })` or `() => '…'` or a plain string. The expensive `details` object must not be built when gated.

Levels live in PWA Settings (localStorage, same pattern as the storage cap). This package holds the **in-memory** config via `configureLogger`. It does not need its own Settings UI. On PWA boot / Settings change, the PWA calls `configureLogger`.

`activeSessionId`: PWA sets it for the take being recorded or ingested. Lib packages may pass `{ sessionId }` on `log()` so post-stop analyze / transcribe still writes after the global active id is cleared.

Errors: structured `{ error }` objects, never thrown. `database_unavailable` / `quota_exceeded` on persist failure. A failed `log()` must not throw into capture / analyze / transcribe.

### 4. Query + byte accounting

```javascript
queryLogs(options?: {
  sessionId?: string,
  packageId?: string,
  from?: string,          // ISO-8601 inclusive
  to?: string,            // ISO-8601 exclusive
  minLevel?: LogLevel,    // default: debug (return all persisted)
  limit?: number,         // default 500
  offset?: number
}) => { logs: LogRow[], total: number } | { error }

getLogByteSizes() => {
  logBytes: number,
  logEntryCount: number,
  byPackage: { [packageId: string]: { bytes: number, count: number } }
} | { error }
```

Also extend existing `getStorageStats()`:

- `logBytes` (number) — included in / reported beside `usedBytes`
- `logEntryCount` (number)
- `logBytesByPackage` (optional map; Settings may call `getLogByteSizes()` instead)

`usedBytes` **must include log bytes** so the storage-cap story stays honest. Document whether the existing 1.1 IndexedDB overhead factor applies to logs the same way as chunks.

### 5. Age-based retention (under the existing cap story)

Logs are not memory-only. They age out.

Extend `enforceRetentionPolicy(capBytes)` (preferred) and/or add an internal `pruneLogs` that it calls:

1. Delete log rows with `createdAt` older than **`maxLogAgeMs`** (default **14 days**). Document the constant.
2. If `usedBytes` is still over `capBytes` after existing audio/session retention, delete **oldest logs first** (by `createdAt` ASC) before deleting more session audio than today’s policy already does — logs are cheaper than playable audio.
3. Recompute `logBytes` / session `usedBytes`.

Do **not** require a massive store rewrite. Prefer: short transactions, indexed `by-createdAt` cursor, delete in batches if a single readwrite would be huge.

**Serialization with writers (customer expectation, load-bearing):**

`enforceRetentionPolicy` opens a long IndexedDB `readwrite` on chunks/sessions. Producers (`writeChunk` / `appendChunk`) must **not** overlap that transaction.

This spec does **not** invent an internal global lock spanning packages. Document:

- Callers (PWA) **must** `await` capture-engine `flushPending()` / `whenPersistIdle()` **before** `enforceRetentionPolicy` during or after recording. See the PWA flush spec.
- `writeChunk` stays a short transaction (chunk + session metadata only). It does **not** call retention.
- If a write is aborted because another long `readwrite` is in flight, `writeChunk` returns `{ error: 'transaction_conflict' }` (not a thrown exception) so capture-engine can retry once. Do not silently hang.

Prefer documenting **caller-serialized flush** over rewriting the store to multiplex writers.

### 6. Session archive — optional `logs.json` (v1 stays slim)

Do **not** reinvent zip / manifest. Extend `exportSessionArchive(sessionId, options?)`:

| Flag | Default | Zip file |
| --- | --- | --- |
| `includeLogs` | `false` | `logs.json` — array of log rows for that `sessionId` (no blobs) |

`includeDebugArtifacts: true` turns on the existing three optional files **and** `includeLogs`. Slim default export stays `manifest.json` + `chunks/` only.

`formatVersion` stays **1**. `logs.json` is optional, same rule as `snips.json`.

`parseSessionArchive` / `importSessionArchive`:

- Attach `logs?` when the file is present.
- Import writes log rows into the **current** DB, remapping `sessionId` the same way chunks are remapped (new ids by default).
- Missing `logs.json` is not an error.

### 7. Isolation Demo (this package only)

This planning PR does not change demo code. The Phase 07 **implementer** for this spec should add a small factory-floor control on the session-store Isolation Demo (sandbox DB only):

- Append a fixture log / query logs for the selected session
- Show approximate log bytes
- Optional Export checkbox **Include logs** (hidden or off by default, same pattern as debug includes)

One sentence in `customers/00-isolation-demo.md` is enough for this roster; the implementer updates the demo.

## Notes For Phase 07

- Keep changes scoped to `packages/datastore/session-store` (schema, APIs, this package’s Isolation Demo, README / customer contracts).
- Do **not** invent `packages/lib/package-logger` (or similar). If a hard boundary conflict appears, stop and document it in the spec — default is extend this store.
- Do not change PWA Settings UI, capture persist queue, or zip UI in this product’s implementation PR — those are other specs.
- Consume / extend existing archive helpers; do not copy a second zip writer.
- Cursor Cloud Agent only — never Codex.
- Update this spec with a Resolution or Blocked section when Phase 07 implementation runs.
- Do **not** mark this spec resolved from the specs-only PR.

## Out of scope

- PWA Advanced Settings UI (PWA spec)
- Capture persist-queue resilience / `flushPending` implementation (capture-engine spec)
- PWA calling `flushPending` before retention (PWA orchestration spec)
- Transcription coverage / `partial` badge (PWA spec)
- Replacing Developer Console table JSON export
- Bumping archive `formatVersion` to 2

## Resolution Criteria

Mark this spec resolved when:

- [ ] `logs` (or equivalent) object store persists rows; `log()` honors both gates and does not invoke a gated lazy payload
- [ ] `queryLogs` + `getLogByteSizes` / extended `getStorageStats` work; Settings can read approximate sizes
- [ ] Age-based prune runs under `enforceRetentionPolicy`; `deleteSession` cascades logs
- [ ] `writeChunk` documents / returns `transaction_conflict` rather than overlapping a long retention transaction as an unhandled throw
- [ ] `exportSessionArchive({ includeLogs: true })` adds optional `logs.json`; default export stays slim; `formatVersion` remains 1
- [ ] Isolation Demo has a minimal log append/query (or dump) control
- [ ] Customer docs + package README list the new APIs
- [ ] Spec updated with a Resolution section documenting what shipped
