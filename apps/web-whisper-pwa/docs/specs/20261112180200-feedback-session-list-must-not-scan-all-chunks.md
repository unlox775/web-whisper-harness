Spec Status: resolved
Spec Type: feedback
Created: 2026-11-12T18:02:00Z
Product: apps/web-whisper-pwa
Contract: docs/DURABILITY-CONTRACT.md
Harness: apps/web-whisper-pwa/tests/perf/README.md
Baseline: documentation/qa/perf-baseline-2026-11-12.md

# Feedback: Session list navigation must not scan every chunk

## User Feedback

On iPhone, tapping a session, going **back** to the list, and cold-starting the PWA get slower as the library grows. Those surfaces should stay near-instant (~100–200 ms) at ~100 sessions.

## Measured (2026-11-12 harness)

CPU 4×, iPhone 13 emulation, 357×4 s sessions imported through `importSessionArchive`:

| N | cold → interactive list | cold → IDB idle | open detail | back → list |
| --- | --- | --- | --- | --- |
| 0 | 117 ms | 532 ms | — | — |
| 10 | 986 ms | 1427 ms | 556 ms | 1132 ms |
| 20 | 1464 ms | 1994 ms | 579 ms | 1895 ms |
| 50 | 3529 ms | 4081 ms | 780 ms | 4551 ms |
| 100 | **6541 ms** | **7554 ms** | **1115 ms** | **8244 ms** |

`goHome` always `refresh()` → `listSessions` + `getStorageStats`. `listSessions` is 4 ms at N=100; `getStorageStats` is 2044 ms unthrottled (store spec). After the list paints, each `SessionCard` `useEffect` calls:

- `getSnipsForSession`
- `getTranscriptsForSession`
- `getChunkCoverage` (full chunk metadata walk)

Unthrottled tile fan-out at N=100: **2146 ms**. Open-detail heading appears in 314 ms at N=100 but idle is 1115 ms while sibling tile/stats work still owns IndexedDB.

Target: **< 100–200 ms** for list and detail navigation at N=100.

## Root cause

`apps/web-whisper-pwa/src/screens/HomeScreen.tsx` `SessionCard` loads snips, transcripts, and `getChunkCoverage` per row. `apps/web-whisper-pwa/src/context.tsx` `refresh` / `goHome` await `getStorageStats` before the list feels settled. Session rows already have `duration`, `chunkCount`, `sizeBytes`, `hasTranscript` for the tile chrome; snippet + gap line currently re-query the whole session.

## Depends on

- `packages/datastore/session-store/docs/specs/20261112180000-feedback-storage-stats-must-not-scan-blob-store.md` (`getStorageStats` O(1) so `refresh` is cheap)
- `packages/datastore/session-store/docs/specs/20261112180100-feedback-chunk-metadata-reads-without-blobs.md` (coverage/snippet without blob cursors)

Producer work should land first. This spec is the PWA consumer: **stop doing N extra chunk scans on the list.**

## Requested Outcome

1. **Home list is interactive in < 200 ms at N=100** (harness, CPU 4×): `Start recording` visible, N cards, first tap handled. Do not wait on per-tile `getChunkCoverage` or per-tile snip/transcript tables to paint the card chrome (timestamp, duration, size, READY/PART TX from session row flags).
2. **Do not call `getChunkCoverage` once per visible session on every list mount.** Gap honesty stays required (`20261103175002`): put a coverage summary on the session row (store spec) or fetch it in **one** list query, not N cursors. A session with missing seqs still must not look like READY-without-gap.
3. **Snippet text** may be denormalized on the session (first ~100 chars on transcript write) or loaded from transcripts **without** walking chunks. No `getChunksForSession` on the list.
4. **`goHome` / `refresh` must not block navigation on whole-DB work.** `listSessions` is enough to render; storage chip can update from O(1) stats when that spec lands.
5. **Open session detail < 200 ms** to the transcript card at N=100. Do not let leftover list fan-out own IndexedDB. Detail may load chunks/coverage for **that session only**.
6. **Do not discard audio, skip list rows, or cap the library** to make the list fast.

## Package boundaries

PWA only for query/orchestration/UI. Do not reimplement IndexedDB in the app. If the list needs a `previewText` / coverage summary field, add it on the session-store contract in the producer spec and consume it here.

## Customer contracts (implementing PR)

- `apps/web-whisper-pwa/README.md` orchestration: list uses session rows (+ cheap tile DTO); not per-card `getChunkCoverage`
- `packages/datastore/session-store/customers/web-whisper-pwa.md`: document the tile fields the PWA relies on

## Tests (must pass)

Harness `apps/web-whisper-pwa/tests/perf` at N=100, CPU 4×, full-size 357×4 s sessions:

- `coldLoadToInteractiveList.wallMs` **< 200**
- `backToList.wallMs` **< 200**
- `openSessionDetail.wallMs` **< 200** (or `extra.headingMs` < 200 and idle < 400)
- `storeMicrobench.listLikeTileFanoutMs` is unused by Home, or Home no longer issues N `getChunkCoverage` calls (trace / IDB: no N session-index chunk cursors on list mount)

Keep existing unit tests for tile badge / gap copy using fixtures (`sessionTile.ts`).

## Out of scope

Making `getStorageStats` O(1) (store). Live recording `chunkEncoded` stats (separate PWA spec). Histogram canvas.

## Durability

List speed must not come from dropping sessions, hiding gaps, or purging audio. Captured chunks stay in session-store until a real retention decision under cap.

## Resolution

**Resolved:** 2026-11-12T18:45:00Z on branch `cursor/pwa-session-list-no-chunk-scan-1bfa`.

### What shipped

1. Home `SessionCard` paints chrome from the `listSessions` row (`sessionTilePreviewFromRow`). Gap honesty uses persisted coverage on that row (`lastSeq`, `savedCount`, `missingSeqs`, `savedDurationMs`, `lostChunks`) — the same O(1) `getChunkCoverage` shape shipped in #72. Visible cards lazy-load snips + transcripts for READY / PART TX / snippet. `hasTranscript` / `status: ready` never paint READY by themselves. Fallback: `getChunkCoverage` if a row lacks persisted fields. No `getChunksForSession` on the list.
2. `refresh` / boot: `listSessions` then setReady; `getStorageStats` is background. `goHome` refreshes session rows only.
3. Session detail heading and gap line paint from the list row; `getChunkCoverage` / `getChunksForSession` load for **that session only**.

### Tests

- `npm test` in `apps/web-whisper-pwa`: 149 pass (existing tile badge / gap fixtures plus from-row coverage cases).
- Re-measured on `main` after #72 (`getChunkCoverage` O(1), `getChunksForSession` metadata-only). Harness N=10/50/100, CPU 4×, full-size 357×4 s sessions. N=100: `getChunkCoverage` median **0.1 ms**; back-to-list **no `chunks` cursors**; heading **69 ms**; cards-visible **203 ms** (wall 793 ms includes ~400 ms idle window). Cold list **2590 ms** still dominated by store `init()` blob-stats walk (out of scope).

### Proof

- `documentation/qa/perf-session-list-2026-11-12.md`
- `documentation/qa/perf-session-list-n100-before.png`
- `documentation/qa/perf-session-list-n100-after.png`

