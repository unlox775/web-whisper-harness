# PWA scale perf harness

Repeatable measurement of Web Whisper PWA navigation and recording as session count grows. **This does not implement fixes.** It seeds a fresh origin through `importSessionArchive` (the same path Settings uses) and times the flows that feel slow on iPhone Safari PWAs.

## What it approximates

Playwright **Chromium** with:

- `iPhone 13` device metrics (390×844, touch, mobile UA)
- `Emulation.setCPUThrottlingRate` **4** (override with `PERF_CPU_THROTTLE`)

This is not WebKit. Treat numbers as a ranking tool and a regression gate, not as Safari wall-clock.

## Fixture shape

`generate-synthetic-archive.mjs` builds a formatVersion 1 `web-whisper-session-archive` zip:

| Field | Value |
| --- | --- |
| chunks | 357 × 4 s `audio/mpeg` (override `PERF_CHUNK_COUNT`) |
| audio | ffmpeg sine+pink-noise MP3 at 128 kbps (~64 KB/chunk) |
| duration | 1428 s (357×4; owner export was 1424 s / 357 chunks) |
| volume profile | per-chunk `peakDb` / `avgDb` / `samples` (100 ms windows) |
| snips + transcripts | realistic spoken length, `hasSnips` / `hasTranscript` true |
| status | `ready` |

Real dictation is private and is **never** committed. Zips live in `tests/perf/.cache/` (gitignored).

At 100 full-size sessions expect ~2.3 GB of chunk audio. The harness raises the in-app cap to 16384 MB so retention does not purge transcribed audio during the run, and calls CDP `Storage.overrideQuotaForOrigin` (~32 GB). Without that override this Chromium hit `quota_exceeded` at ~37 sessions / ~900 MB. If quota still fails, the raw JSON records the error and the harness measures the N it actually stored.

## Run

From `apps/web-whisper-pwa`:

```bash
npm run test:perf
```

That generates the zip, `vite build`s, installs Playwright Chromium, starts `vite preview`, and runs `scale.spec.ts`.

Faster inner loop (reuse dist + zip):

```bash
PERF_SKIP_BUILD=1 npm run test:perf
```

Smaller sessions if you only need the list-walk shape:

```bash
PERF_CHUNK_COUNT=45 PERF_RECORD_SECONDS=12 npm run test:perf
```

## Measures (each N)

1. Unthrottled store microbench (`getStorageStats`, `listSessions`, `getChunkCoverage`, tile fan-out)
2. Cold load → interactive session list (`Start recording` visible, N cards, IndexedDB idle)
3. Open first session detail → back to list
4. Tap Record → recording-active
5. Record ~60 s (long tasks, chunk `put` latency, `persist_backpressure`, coverage-scan cursors)
6. Stop → finished (home interactive)

IndexedDB reads/writes/bytes are counted by wrapping `IDBObjectStore` before `session-store` init (`?perfHarness=1`).

## Output

- `tests/perf/.cache/perf-baseline-raw.json`
- `documentation/qa/perf-baseline-raw.json`
- `documentation/qa/perf-baseline-list-n*.png`
- `documentation/qa/perf-baseline-YYYY-MM-DD.md` (human table + ranked bottlenecks; written with the investigation)

Acceptance for later fix specs: re-run this harness at N=100 and compare the table.
