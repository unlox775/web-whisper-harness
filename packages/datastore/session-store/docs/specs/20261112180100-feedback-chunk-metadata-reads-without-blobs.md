Spec Status: resolved
Spec Type: feedback
Created: 2026-11-12T18:01:00Z
Resolved: 2026-11-12T18:30:00Z
Product: packages/datastore/session-store
Contract: docs/DURABILITY-CONTRACT.md
Harness: apps/web-whisper-pwa/tests/perf/README.md
Baseline: documentation/qa/perf-baseline-2026-11-12.md

# Feedback: Chunk metadata and coverage must not load audio blobs

## User Feedback

Opening a session and rendering the session list should be near-instant even with a hundred ~24-minute takes. Today both paths go through APIs that claim “metadata only” while IndexedDB still materializes blob-bearing chunk rows.

## Measured (2026-11-12 harness)

Unthrottled, one session of 357 chunks (independent of N, Chromium):

| API | median |
| --- | --- |
| `listSessions` (N=100) | 4 ms |
| `getSession` | ~1 ms |
| `getSnipsForSession` | 3–4 ms |
| `getTranscriptsForSession` | 2–3 ms |
| `getVolumeProfile` | 1 ms |
| `getChunksForSession` | **17–19 ms** |
| `getChunkCoverage` | **19–20 ms** |

N-wide fan-out (what Home tiles do: snips + transcripts + `getChunkCoverage` per session):

| N | parallel coverage | tile fan-out |
| --- | --- | --- |
| 10 | 172 ms | 310 ms |
| 20 | 408 ms | 397 ms |
| 50 | 903 ms | 996 ms |
| 100 | **1682 ms** | **2146 ms** |

`getChunksForSession` is documented as metadata only (`id, seq, startTime, endTime, duration, sizeBytes, audioPurgedAt`) and **omits `blob` from the returned object**, but it uses `index.openCursor` and reads `cursor.value` from the `chunks` store whose records **include the ~64 KB `blob`**. Chromium still pays per-row reconstruction; Safari/iPhone is expected to be worse. `getChunkCoverage` calls `getChunksForSession` then walks seqs.

Volume profiles (14,280 samples / session) are **not** the list bottleneck (1 ms).

## Root cause

`packages/datastore/session-store/src/chunks.js`:

- `getChunksForSession` — index cursor over blob-bearing records, then strips `blob` in JS
- `getChunkCoverage` — `getSession` + `getChunksForSession` (second metadata walk, still blobs)

Audio bytes live in the same object-store value as seq/times. There is no metadata-only index or sibling store.

## Requested Outcome

1. **`getChunksForSession(sessionId)` returns metadata without deserializing audio bytes.** Implementation is this package’s: split blob store, metadata-only index, or key cursor + thin records. The public shape stays the same (`id, seq, startTime, endTime, duration, sizeBytes, audioPurgedAt`). `getChunk(chunkId)` still returns the blob for playback / ingest.
2. **`getChunkCoverage(sessionId)` does not walk blob records.** Maintain coverage on the session row (or a thin index) on `writeChunk` / `recordChunkLost` / purge: `lastSeq`, `savedCount`, `missingSeqs` (or enough to compute them), `savedDurationMs`, `lostChunks`. Coverage reads are a session get, not a 357-row blob cursor.
3. **List consumers can render gap/duration honesty without N blob scans.** Session list rows already carry `duration`, `chunkCount`, `sizeBytes`. Add whatever coverage summary the PWA tile needs so it does not call `getChunkCoverage` per card (PWA spec). Keep `getChunkCoverage` correct for session detail.
4. **`writeChunk` stays owner-serialized, idempotent by `(sessionId, seq)`, and never drops encoded audio** to make metadata cheap.

## Package boundaries

session-store only. Playback, volume-analyzer, and PWA keep calling `getChunksForSession` / `getChunk` / `getChunkCoverage`. After this lands those calls stop dragging blobs when they only need seqs.

## Customer contracts (implementing PR)

- `README.md`: `getChunksForSession` is metadata-only **in storage**, not just in the returned DTO; `getChunkCoverage` is O(1) in chunk count
- `customers/web-whisper-pwa.md`, `customers/playback-engine.md`, `customers/volume-analyzer.md`: metadata reads do not load audio; `getChunk` is the blob API

## Tests (must pass)

- Unit: write 357 chunks with 64 KB blobs; `getChunksForSession` returns 357 metas with no `blob`; a blob-store spy / byte counter does not account ~357×64 KB on that call; `getChunk(id).blob.size` still 64 KB.
- Unit: write seqs 0..9 except 4 and 7 → `getChunkCoverage` `missingSeqs = [4,7]` without listing blobs; after `writeChunk` seq 4, coverage updates.
- Harness N=100:
  - `getChunksForSession` / `getChunkCoverage` median stay in the same 10–30 ms band **or better**
  - `listLikeTileFanoutMs` **< 200 ms** once the PWA stops N-way coverage (this spec makes each remaining coverage call blob-free and preferably O(1))
  - Opening one session detail does not pull ~22 MB of audio solely to compute coverage

## Out of scope

PWA Home `SessionCard` query shape (separate spec). `getStorageStats` full-store scan (separate spec). Playback of a session (blobs are required there, via `getChunk` / engine).

## Durability

Splitting metadata from blobs must not lose chunks, break idempotent `(sessionId, seq)`, or skip `blob` on `getChunk`. Coverage stored on the session row must not hide gaps (`DURABILITY-CONTRACT` §7–8).

## Resolution

Implemented in `packages/datastore/session-store` only. IndexedDB v4 splits audio into `chunk-blobs` (keyed by chunk id). `chunks` holds metadata. `getChunksForSession` reads only `chunks`. `getChunk` joins metadata + blob (legacy `chunks.blob` still served during migration). `getChunkCoverage` / `listSessions` rows use persisted `lastSeq`, `savedCount`, `missingSeqs`, `savedDurationMs`, `lostChunks` on the session (O(1) in chunk count). v3 → v4 copy-then-strip migration is batched, resumable, idempotent, and never deletes audio.

- [x] `getChunksForSession` metadata-only in storage
- [x] `getChunkCoverage` is a session-row read; coverage updated on `writeChunk` / import / finalize / `recordChunkLost`
- [x] `listSessions` / `getSession` carry coverage summary for PWA tiles
- [x] `getChunk` still returns the blob
- [x] `writeChunk` remains owner-serialized and idempotent by `(sessionId, seq)`
- [x] Resumable v4 migration; unit proof that 357×64 KB listing does not touch `chunk-blobs`
- [x] Customer contracts + README match the shipped API
- [x] Package tests + archive import/export green
- [x] Harness N=10/50/100: `getChunkCoverage` 19 ms → 0.1–0.4 ms; `getChunksForSession` 18 ms → ~9 ms; open-detail heading 76 ms at N=100; detail IDB does not read `chunk-blobs`
