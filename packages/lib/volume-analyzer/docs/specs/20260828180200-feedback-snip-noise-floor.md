Spec Status: resolved
Spec Type: feedback
Created: 2026-08-28T18:02:00Z
Resolved: 2026-08-28T18:00:00Z
Product: packages/lib/volume-analyzer

# Feedback: Snip segmentation aggressiveness / noise floor

## User Feedback (Dave)

Current snips are far too aggressive: about 4–5 words then a cut. Every mini-snip sent to Whisper becomes a mid-sentence fragment, so transcription inserts extra periods and is pretty terrible.

The original app was tuned around a **noise floor** and quiet-gap splits so snips end at natural pauses / end of words or sentences. 30s snips might be a bit long; 4–5 words is way too short.

Isolation demo should have **sliders** so aggressiveness can be tuned (noise floor, min/max snip length, quiet-gap). Do not invent a totally different algorithm if the original already has one — copy its parameters first.

## Source of truth

Original Web Whisper (`unlox775/web-whisper`, `src/modules/analysis/session-analysis.ts`, `DEFAULT_SESSION_ANALYSIS_CONFIG`):

| Original field | Value | Copied into volume-analyzer as |
|---|---|---|
| `frameDurationMs` | 50 | Documented. Stored volume windows stay 100ms for existing session-store profiles. |
| `minQuietDurationMs` | 600 | `minSilenceGapDuration` **0.6s** (was 1.0s) |
| `minSegmentMs` | 5000 | `minSnipDuration` **5s** |
| `targetSegmentMs` | 10000 | `targetSnipDuration` **10s** (new; this is the missing gate) |
| `maxSegmentMs` | 60000 | `maxSnipDuration` **60s** |
| `silencePaddingMs` | 200 | `hangoverMs` **200** (cut at quiet-region center, same as original) |
| `thresholdMultiplier` | 1.6 | `thresholdMultiplier` **1.6** |
| `quietPercentile` | 0.3 | `quietPercentile` **0.3** |
| `noisePercentile` | 0.12 | `noisePercentile` **0.12** |
| `initialIgnoreMs` | 120 | `initialIgnoreMs` **120** |

Original does **not** use a fixed −40 dB silence line. It estimates a noise floor from the 12th-percentile of normalized RMS frames:

```
noiseFloor = percentile(normalized, 0.12)
quietBand  = percentile(normalized, 0.3)
threshold  = min(max(noiseFloor * 1.6, (noiseFloor + quietBand) / 2), peak * 0.7)
```

Quiet regions are consecutive frames below that threshold lasting ≥ 600ms (after the first loud frame, ignoring the first 120ms).

Splits (`proposeSegments`) skip a quiet gap until the running snip is at least `minSegmentMs` (5s), then **only cut once the snip has reached `targetSegmentMs` (10s)** (or `maxSegmentMs`), at the **center** of the quiet region. Run-on speech stays in one snip until a real pause after ~10s. There is no hard split in the middle of continuous speech.

## Previous harness defaults (too aggressive)

- Fixed `quietThreshold` **−40 dB**
- Split on **every** silence gap ≥ 1.0s, then merge shorts
- Isolation demo inlined a fork that **commented out** min/max snip duration, so every breath-sized gap became its own snip (4–5 words)

## New package defaults

Exported as `DEFAULT_SNIP_OPTIONS` from `src/defaults.ts`:

- `quietThreshold`: **omitted** → adaptive noise floor (original). Callers may pass a dB override.
- `minSnipDuration`: **5s**
- `targetSnipDuration`: **10s**
- `maxSnipDuration`: **60s**
- `minSilenceGapDuration`: **0.6s**
- `hangoverMs`: **200**
- `thresholdMultiplier`: **1.6**
- `quietPercentile`: **0.3**
- `noisePercentile`: **0.12**
- `initialIgnoreMs`: **120**

Goal: snips typically several seconds to low tens of seconds on continuous speech; split on real quiet, not every breath.

## Isolation demo

- Four distinct sliders, live-recompute: **noise floor (dB)**, **min snip (s)**, **max snip (s)**, **quiet-gap (s)**
- Noise floor defaults to auto (percentile). Dragging the slider switches to a manual dB override.
- Waveform panel draws 100ms peak-dB samples with snip overlay (duration labels), not chunk-only bars.
- Isolated IndexedDB name: `web-whisper-volume-analyzer-demo-db` (never `web-whisper-db` / `web-whisper-sandbox-db`)
- Isolation demo imports the real package (`src/`), not a forked snip algorithm.

## PWA call sites

`proposeSnipsForSession(sessionId)` is called **without** options from `apps/web-whisper-pwa` (`orchestration.ts`, `context.tsx`). Those sites already use package defaults. Do not restyle PWA session-detail or recording overlay in this change.

## Out of scope

- PWA session-detail / recording overlay restyle
- Changing capture chunk duration
- Migrating already-persisted aggressive snips in session-store

## Resolution

**Resolved:** 2026-08-28T18:00:00Z

### What shipped

- Copied original `DEFAULT_SESSION_ANALYSIS_CONFIG` into `src/defaults.ts` / `DEFAULT_SNIP_OPTIONS`
- Replaced split-every-gap algorithm with original quiet-gap + 10s target gating and adaptive percentile noise floor
- Isolation demo: four live sliders, waveform+snip overlay, IndexedDB `web-whisper-volume-analyzer-demo-db`
- Unit tests in `src/snips.test.ts` (run-on speech stays multi-second; aggressive overrides still over-segment)
- QA shots (1170×2532):
  - `documentation/qa/shot-01-volume-analyzer-demo-sliders-long-snips.png` — breath-paused fixture, 2 snips avg 11.6s
  - `documentation/qa/shot-02-volume-analyzer-demo-slider-recompute.png` — quiet-gap slider to 1.9s merges to one 23.1s snip
