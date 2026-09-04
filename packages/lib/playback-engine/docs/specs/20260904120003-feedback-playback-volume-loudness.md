Spec Status: unresolved
Spec Type: feedback
Created: 2026-09-04T12:00:03Z
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

- [ ] `setVolume(0..1)` changes audible loudness on iOS Safari and desktop Chrome
- [ ] API still `setVolume(level)`; clamp; default 1
- [ ] Isolation Demo slider audibly changes level
- [ ] Tests and docs note the iOS `element.volume` quirk
- [ ] Spec updated with a Resolution section documenting what shipped
