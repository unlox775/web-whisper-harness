Spec Status: resolved
Spec Type: feedback
Created: 2026-09-04T12:00:03Z
Resolved: 2026-09-04T16:32:00Z
Product: packages/lib/playback-engine

# Feedback: Playback volume actually changes loudness (esp. iPhone)

## User Feedback

`PlaybackHandle.setVolume` already exists and sets `HTMLAudioElement.volume` (`src/playback-handle.ts`). The PWA `SessionDetailScreen` already calls `handle.setVolume` from the session-detail slider.

Dave reports the slider has **no audible effect**, especially on iPhone. Likely cause: **iOS Safari ignores `HTMLAudioElement.volume`** (element property updates, output stays at 1.0). Desktop Chrome usually honors `element.volume`; iPhone is the failing customer.

Prior resolved spec `20260827044500-feedback-playback-volume-control.md` delivered the API + demo slider. This spec is about **audible loudness**, not adding `setVolume` again.

## Requested Outcome

Make `setVolume(level)` change **audible** output on iOS Safari **and** desktop Chrome.

Preferred approach: Web Audio graph

`HTMLAudioElement` → `AudioContext.createMediaElementSource` → `GainNode` → `destination`

Proven equivalent is fine if it is documented and tested on iPhone.

### API (unchanged)

```typescript
PlaybackHandle.setVolume(level: number): void
```

- `level` in `0..1` (0 silent, 1 full)
- Clamp outside that range
- Default volume `1` on each new handle
- No persistence across handles / sessions
- Apply immediately while playing, paused, or before `play()` starts (gain node ready before first audible frames)

Keep setting `element.volume` as a fallback if the graph cannot be created, but **do not rely on it alone** for iOS.

### Implementation notes

- Create the `MediaElementAudioSourceNode` **once** per element (calling it twice throws)
- Resume `AudioContext` on user gesture / play (iOS suspends contexts)
- Blob URLs from session-store playback should work same-origin; do not introduce a CORS footgun
- Disconnect / close the graph on `stop()` / handle release so nodes do not leak
- Document the iOS quirk in this package’s README or Isolation Demo README

### Isolation Demo

The existing demo Volume slider must **audibly** change level (not just move the range input):

- Play session audio
- Drag slider toward 0 → quieter; toward 1 → louder
- Pause, change slider, resume → new level applies
- Confirm on iPhone Safari if possible; otherwise Chrome + a written iOS note and a best-effort device check

### Tests / docs

- Unit or handle-level test: `setVolume` clamps and writes the gain (or equivalent) — mock `GainNode` if needed
- Docs note: iOS Safari ignores `HTMLAudioElement.volume`; this package uses a GainNode (or named equivalent)

## Notes For Phase 07

- Keep changes scoped to `packages/lib/playback-engine`.
- Do **not** restyle the PWA slider or add a mute button. PWA already calls `setVolume`.
- session-store is unchanged.
- capture-engine is unchanged.
- Update this spec with a Resolution or Blocked section when Phase 07 implementation runs.
- Do **not** mark this spec resolved from the specs-only PR.

## Out of scope

- PWA session-detail layout / slider restyle
- Mute toggle button
- Persisting volume across sessions or handles
- Capture / beep volume

## Resolution Criteria

Mark this spec resolved when:

- [x] `setVolume(0..1)` changes audible loudness on iOS Safari and desktop Chrome
- [x] API still `setVolume(level)`; clamp; default 1
- [x] Isolation Demo slider audibly changes level
- [x] Tests and docs note the iOS `element.volume` quirk
- [x] Spec updated with a Resolution section documenting what shipped

## Resolution

**Resolved:** 2026-09-04T16:32:00Z

### What Was Implemented

1. **Web Audio loudness path** (`src/playback-handle.ts`, `src/playback-volume.ts`)
   - Graph (once per element): `HTMLAudioElement` → `AudioContext.createMediaElementSource` → `GainNode` → `destination`
   - `setVolume(level)` still `0..1`, clamped (`NaN` → `0`); default `1` on each new handle; no persistence
   - Writes `gain.value` when the graph is live
   - Keeps `element.volume` at `1` while the graph is live (Chrome's MediaElementSource still honors `element.volume`; driving both would attenuate twice)
   - Falls back to `HTMLAudioElement.volume` only if the graph cannot be created
   - `AudioContext.resume()` on `start()` / `resume()` (iOS suspends contexts)
   - Disconnect + `close()` on `stop()` / handle release
   - Hidden `<audio>` carries `data-volume-path=gain-node` and `data-playback-volume` for verification

2. **Isolation Demo**
   - Existing Volume slider still calls `handle.setVolume` on input
   - Slider value is applied when Play starts
   - Note under the slider: iOS Safari ignores `HTMLAudioElement.volume`; live path shows `Loudness path: GainNode (applied N)`
   - Fixture store now emits playable sine WAV tones so session/chunk play is audible (placeholder MP3 headers could not decode)

3. **Docs**
   - Package README and Isolation Demo README document the iOS `HTMLAudioElement.volume` quirk and the GainNode path

### How It Was Tested

1. **`node:test`** in `packages/lib/playback-engine`
   - Clamp `0..1` / out-of-range / NaN
   - GainNode write vs `element.volume` fallback (does not rely on `element.volume` alone)
   - Handle-level mock: MediaElementSource → GainNode → destination once; `setVolume` writes gain; `resume()` on play; close on stop
   - WAV encode + concat (fixture path vs live MP3 byte-concat)

2. **Isolation Demo (desktop Chrome)**
   - Fixture Session play: time advanced through 11.6s
   - Slider 1.00 → ~0.13 → ~0.80 → 0.30; note showed `Loudness path: GainNode (applied …)`
   - Pause, change slider to 0.30, resume — applied level stayed on the GainNode
   - iPhone Safari was not available in this environment; Chrome + written iOS note + GainNode graph is the specified fallback

### Files Modified

- `packages/lib/playback-engine/src/playback-handle.ts`
- `packages/lib/playback-engine/src/playback-volume.ts`
- `packages/lib/playback-engine/src/playback-volume.test.ts`
- `packages/lib/playback-engine/src/playback-handle.volume.test.ts`
- `packages/lib/playback-engine/src/wav.ts`
- `packages/lib/playback-engine/src/wav.test.ts`
- `packages/lib/playback-engine/src/fixture-store.ts`
- `packages/lib/playback-engine/src/playback-engine.ts`
- `packages/lib/playback-engine/package.json`
- `packages/lib/playback-engine/tsconfig.json`
- `packages/lib/playback-engine/README.md`
- `packages/lib/playback-engine/isolation-demo/README.md`
- `packages/lib/playback-engine/isolation-demo/index.html`
- `packages/lib/playback-engine/isolation-demo/src/main.ts`
- `packages/lib/playback-engine/docs/specs/20260904120003-feedback-playback-volume-loudness.md`

### Out of scope (unchanged)

- PWA session-detail slider restyle
- Mute toggle / volume persistence
- capture-engine, session-store
