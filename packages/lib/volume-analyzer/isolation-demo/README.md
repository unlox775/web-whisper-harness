# Volume Analyzer Isolation Demo

Package-local factory floor for operating volume-analyzer **the same way the production PWA records**.

Visual contract for Phase 07 live-path redesign (`docs/specs/20260907163000-feedback-isolation-demo-redesign-live-path.md`). Implement against this README + that spec.

## Purpose

Proves that volume-analyzer:

- Updates volume incrementally as ~4s chunks arrive (`analyzeVolumeForSession` / `analyzeChunksVolume` / `analyzeVolume`)
- Proposes snips incrementally (`proposeSnipsForSession` / freeze + `windowStartTime = lastEnd`)
- Uses **per-window** adaptive floor (`computeAdaptiveQuietThresholdDb` on the current window, `DEFAULT_SNIP_OPTIONS`)
- Holds the in-progress tail while recording (`includeTrailing: false`) and commits it on Stop (`includeTrailing: true`)
- Exposes hidden decisions: window start, floor history, frozen snips vs trailing
- Can replay a debug session archive chunk-by-chunk so incremental frozen snips aim at **live archived** cuts
- Still offers **Offline batch** (`proposeSnipsFromProfile` over the whole session + sliders) — labeled **NOT the live path**

This demo is **not** a one-shot “Compute Volume on the whole take.” That is how the previous Isolation Demo worked, and it cannot replay live cuts (Dave’s BLT case: live 13 vs batch 11).

## Runtime

- **Platform**: Web app (local dev server, factory floor)
- **Viewport**: Desktop browser, wide split (not phone-shaped)
- **Layout**: Inputs left / volume profile + reason center / outputs right
- **Launch**: `cd packages/lib/volume-analyzer/isolation-demo && npm start`

## Data Mode

**Operating mode (default): Live package path** — the same logical path as PWA `ingestGrowingSession`:

1. Volume update for new chunks only
2. Incremental propose with frozen snips + `windowStartTime = lastEnd`
3. `includeTrailing: false` while chunks are still arriving; `true` on Stop / replay end

**Data source** (labeled switch; does not change the operating mode):

| Source | When to use |
| --- | --- |
| **Fixture step** (safe default) | No mic. Click `Step next chunk` as if `chunkEncoded` fired. Default pattern: Breath-paused speech (run-on). |
| **Live microphone** | capture-engine in RAM. Each `chunkEncoded` is one live tick. |
| **Session archive replay** | Upload a spec-1 zip. Prefer `volume-profile.json` samples; else decode. Step or replay the queue. |

**Safe default**: Fixture step on the **live path** (no mic permission). Archive replay is for a real failed take. Offline batch is advanced, collapsed, and must not be the first thing a founder sees.

The demo does **not** open `web-whisper-db`. Chunks / profiles / frozen snips live in RAM or a demo sandbox. Tuner IndexedDB `web-whisper-volume-analyzer-demo-db` is only for Offline batch sliders.

## Panel-Based Layout

**Chrome + 3 columns + one collapsed advanced disclosure.**

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Volume Analyzer Isolation Demo     [LIVE PATH]      Idle                 │
│ Same path as PWA ingestGrowingSession: analyze → incremental propose     │
└──────────────────────────────────────────────────────────────────────────┘
┌─────────────────┬──────────────────────────────┬─────────────────────────┐
│ INPUTS          │ VOLUME PROFILE / REASON      │ OUTPUTS                 │
│ Source radios   │ Histogram                    │ Frozen snips            │
│ Step / Start    │ Frozen vs trailing           │ Trailing (held)         │
│ Current window  │ Per-window floor line        │ Live (archived)         │
│ Archive upload  │ Live overlay + playhead      │ Doctor / boundary       │
│ ▸ Offline batch │ Zoom / pan                   │ Floor history           │
│                 │ Reason strip                 │ Events / telemetry      │
└─────────────────┴──────────────────────────────┴─────────────────────────┘
```

### 1. Top Chrome Panel (fixed header, full width)

- **Left**: `Volume Analyzer Isolation Demo` (bold)
- **Center**: path chip — exactly one of:
  - `LIVE PATH` (cyan) — fixture step or idle
  - `LIVE PATH · MIC` (cyan) — microphone source
  - `LIVE PATH · ARCHIVE REPLAY` (amber) — zip loaded
  - `OFFLINE BATCH — NOT LIVE PATH` (rose) — only after a batch propose, never on load
- **Right**: `Idle` / `Recording (includeTrailing: false)` / `Stopped (trailing committed)` / `Replay paused at chunk N of M`
- **Subline**: `Same path as PWA ingestGrowingSession: analyze volume → incremental propose. Frozen snips stay frozen. Adaptive floor is per window.`

No noise-floor slider in the chrome.

### 2. Control Panel — Inputs (left quarter)

**Heading:** `Inputs`

**Source radios:** `Fixture step` (default) · `Live microphone` · `Session archive replay`

**Fixture step**

- Pattern dropdown (existing patterns; default Breath-paused speech). Changing pattern resets the in-memory session.
- `Step next chunk` (primary) — append the next ~4s chunk and run **one live tick**.
- `Replay remaining` — instant remaining ticks.
- `Replay remaining (4s clock)` — optional wall-clock growth.
- `Reset session` — clear chunks, profile, frozen snips, trailing, floor history, playhead.

**Live microphone**

- `Start capture` / `Stop capture`
- Each `chunkEncoded` → live tick (`includeTrailing: false`)
- Stop → final tick (`includeTrailing: true`)
- There is **no** `Compute Volume` button on this panel.

**Session archive replay**

- `Upload session archive` (zip). `parseSessionArchive` only.
- Chunks become a **queue**. Status must say whether `volume-profile.json` samples were used or decode fallback ran.
- Same Step / Replay remaining controls, `seq` order.
- After the last chunk: auto tick with `includeTrailing: true`.
- `Stop replay early` commits trailing on audio ingested so far.
- When optional `snips.json` exists: Live (archived) fills immediately. Slim zip: `hasSnips is a flag only — live ranges were not exported`.

**Current window card** (hidden decisions — always visible on the live path)

| Label | Meaning |
| --- | --- |
| `chunk seq` | Last ingested seq |
| `session t` | `0 → last chunk end` |
| `windowStartTime` | last frozen snip end, or `0` |
| `includeTrailing` | `false` while growing; `true` on Stop / replay end |
| `adaptive floor` | dB **for this window only** — `Per-window floor — not a global slider.` |
| `frozen` | committed snip count |
| `trailing` | held range, or `none` |

**Read-only defaults line:** `min 5s · target 10s · max 60s · gap 0.6s · adaptive floor` (`DEFAULT_SNIP_OPTIONS`).

**Do not** put a global noise-floor slider here. Sliders live only under Offline batch.

**Disclosure (collapsed):** `Offline batch (not the live path)` — see below.

### 3. Volume Histogram Panel (center half)

**Heading:** `Volume profile (100ms peak dB) · reason`

**Empty:** `Step a chunk, start capture, or upload an archive to replay the live path.`

**After ticks:**

- Growing 100ms peak-dB histogram
- **Frozen snips** — solid cyan bands
- **Trailing (not committed)** — hatched / dim band while `includeTrailing: false`
- **Current-window floor** — dashed line **only** across `windowStartTime → now`, labeled with dB
- Optional faint historical floor ticks on closed snips
- **Live (archived)** overlay when present — amber dashed (keep legend)
- Doctor ticks — rose contiguous-repeat, purple overlap
- **Window slider + Fit all + horizontal pan** (viewport; not the snip algorithm)
- **Playhead** — session-relative; pause freezes; stop/ended clears

**Reason strip** (changes every tick), e.g.:

- `Tick seq 0: windowStart 0.0s, floor −51.0 dB, no quiet-gap cut yet — trailing 0.0–4.0s held.`
- `Tick seq 2: closed snip #0 0.0–11.2s. New windowStart 11.2s.`
- `Stop: includeTrailing true — committed trailing as snip #1.`

### 4. Output Panel (right quarter, scrollable)

**Frozen snips**

- Columns: id, chunks, start→end, duration, **floor at close**
- Play / Pause / Stop (assemble from in-memory blobs; keep)
- Empty: `No frozen snips yet — live path holds the trailing region until a quiet-gap cut or Stop.`

**Trailing (held)**

- One callout with range + `includeTrailing: false`
- After Stop: `No trailing region (committed on Stop).`

**Live (archived)** (keep when zip/fixture has live ranges)

- Existing list + transcript text when present
- `N live cuts from the zip — compare to Frozen snips after incremental replay.`

**Doctor / boundary** (keep)

- Overlap / n-gram / contiguous-repeat headline
- Default compare: Live (archived) vs **incremental frozen** (not offline batch)
- Optional toggle after a batch run: `Compare against: Incremental live path | Offline batch`

**Floor history**

- `snip # | closed at t | windowStart | window samples | floor dB | includeTrailing`

**Events / telemetry** (disclosure OK)

- Events: `chunkEncoded`, `volumeUpdated`, `snipsProposed`, `snipFrozen`, `trailingCommitted`, `replayComplete`
- Telemetry: analyze/propose ms, floor dB, `windowStartTime`, window sample count, `profileReused` vs decode, named errors

### 5. Offline batch disclosure (NOT live path)

Collapsed on the left. Banner **required** when open:

> **Not the live path.** The PWA does **not** record this way. This panel batch-runs `proposeSnipsFromProfile` over the **entire** volume profile with one global adaptive floor (and optional aggressiveness sliders). Live path is how production records.

Contains today’s tuner:

- Noise floor (auto / manual), min snip, max snip, quiet-gap
- `Reset to app defaults` (persist in demo tuner DB; do not wipe archive/chunks)
- `Compute Volume` / `Batch propose` / live slider recompute — **full session only**
- Results headed `Offline batch snips` — must not silently replace Frozen snips
- Path chip flips to `OFFLINE BATCH — NOT LIVE PATH` only after a batch propose
- If batch count ≠ incremental count, show both (e.g. live path 13 vs batch 11) and keep the banner

## Before / After States

### Page load (fixture step, live path)

- Chip `LIVE PATH`, source Fixture step, Offline batch collapsed
- No floor slider visible
- Histogram placeholder about stepping a chunk (not “Click Compute Volume”)
- Frozen empty; trailing none; window card zeros / `—`

### After 3 fixture/live chunks (~12s), still recording / mid-replay

- Chip `LIVE PATH` (or `LIVE PATH · MIC`)
- `includeTrailing: false`
- Histogram shows trailing hatch; maybe first frozen snip if a cut closed
- Current-window floor line on the **open** window only
- Floor history has a row only for closed snips

### After Stop / replay complete

- `includeTrailing: true`; trailing committed or gone
- Frozen list is the live-path result
- State `Stopped (trailing committed)` or `Replay complete — trailing committed.`

### After debug-zip upload, before Step

- Chip `LIVE PATH · ARCHIVE REPLAY`
- Status names `volume-profile.json used` or `decode fallback`
- Live (archived) list visible; incremental frozen still empty
- Queue `0 of M`

### After Replay remaining on that zip

- Incremental frozen filled; doctor compares to Live (archived)
- Telemetry says profile reused vs decoded

### After Offline batch propose (same profile)

- Rose chip + banner
- Two counts visible if they differ
- Incremental frozen **still listed**

## Package surfaces this demo must cover

| Export | Where you see it |
| --- | --- |
| `analyzeChunksVolume` / `analyzeVolume` | Decode fallback; Offline batch Compute Volume |
| `analyzeVolumeForSession` | Live tick volume (or the shared incremental helper it uses) |
| `proposeSnipsFromProfile` / `proposeSnips` | Offline batch kernel; named in telemetry |
| `proposeSnipsForSession` | Live tick propose (or shared incremental helper) |
| `computeAdaptiveQuietThresholdDb` | Current-window floor + history + dashed line |
| `detectSilenceGaps` | Gap overlay / telemetry |
| `DEFAULT_SNIP_OPTIONS` | Read-only live defaults; Reset to app defaults in batch |
| `scanSnipBoundaries` | Doctor panel |
| Zoom/pan + snip play/playhead | Center / frozen list |
| Reset to app defaults | Offline batch only |

Prefer calling real package exports (session APIs against a sandbox, or a shared incremental helper that production also uses). Do not reimplement freeze + `windowStartTime` only inside `App.tsx`.

## What This Demo Does NOT Do

- Does not transcribe (no Groq). Archived transcript text is doctor-only.
- Does not open `web-whisper-db` or write production sessions.
- Does not use playback-engine (demo-local `HTMLAudioElement` + WAV assemble).
- Does not change `proposeSnipsFromProfile` / hangover / ASR.
- Does not pretend Offline batch sliders are how the PWA records.
- Does not implement PWA chrome, session list, or Debug Export.

## Acceptance (implementer)

Dave’s BLT debug zip incremental replay should match **live snip count and ranges** when the zip has `volume-profile.json` **samples** and the live path uses production defaults. Count must match exactly; range epsilon ≤ 100ms (or 50ms `SNIP_START_EPSILON` — document which). Decode fallback cannot claim identity. Offline batch is allowed to differ (13 vs 11) if labeled.

## Implementation Notes

See the feedback spec. Summary:

- Live tick = volume incremental + propose incremental (`includeTrailing` as above).
- Archive: prefer stored samples; else decode.
- Extract a sandbox adapter or a pure helper shared with `src/session.ts` if the demo cannot import session-store writes.
- Keep doctor, live overlay, zoom/pan, snip play, Reset to app defaults (batch).
- Old batch-first “Compute Volume then sliders” must not remain the headline.
