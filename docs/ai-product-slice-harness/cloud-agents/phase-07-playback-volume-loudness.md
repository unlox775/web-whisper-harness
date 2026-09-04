# Phase 07: Playback volume actually changes loudness (iPhone)

**Package**: packages/lib/playback-engine  
**Spec**: packages/lib/playback-engine/docs/specs/20260904120003-feedback-playback-volume-loudness.md  
**Status**: unresolved  
**Runner**: Cursor Cloud Agent (not Codex)

## Model / runner notes (read first)

- Implement this spec with a **Cursor Cloud Agent**. Do **not** call Codex (`codex exec` or any Codex CLI).
- This job is **playback-engine only**. Do not restyle the PWA slider (it already calls `setVolume`).
- Not a PWA UI change. Isolation Demo must **audibly** change level. iPhone proof is preferred if you can play audio; otherwise document the iOS quirk and verify Chrome.
- Do **not** run `make build` unless PWA publish output actually changed (it should not).
- Do **not** mark the spec resolved until audible demo + docs/tests note the iOS quirk.

## Task Summary

`setVolume` currently assigns `HTMLAudioElement.volume`. iOS Safari ignores that property, so Dave’s slider does nothing. Route playback through a Web Audio `GainNode` (or proven equivalent) so `setVolume(0..1)` is actually loud/quiet on iPhone and Chrome.

## What to Change

### 1. PlaybackHandleImpl (`src/playback-handle.ts`)

- Build (once per element): MediaElementSource → GainNode → destination
- `setVolume` clamps to `[0, 1]` and sets `gain.value` (keep `element.volume` as fallback only)
- Resume `AudioContext` on play (iOS suspends contexts)
- Tear down graph on `stop()` / release
- Default volume 1.0 per handle; no persistence

### 2. Docs + tests

- README or Isolation Demo README: iOS Safari ignores `HTMLAudioElement.volume`
- `node:test` (or equivalent) that clamp + gain write behave

### 3. Isolation Demo

Existing Volume slider must audibly change level (play, drag toward 0, toward 1, pause/change/resume).

## What NOT to Change

- Do NOT change the `setVolume(level: number)` API shape
- Do NOT add mute or persistence
- Do NOT restyle PWA session-detail
- Do NOT modify capture-engine or session-store
- Do NOT commit `node_modules`, `dist`, or lockfile surprises

## Stop Conditions

Mark spec resolved when:

1. Audible loudness follows `setVolume` on iOS Safari and desktop Chrome
2. Isolation Demo slider is audibly effective
3. Tests/docs note the iOS quirk
4. Spec has a Resolution section

## Implementation Prompt

```
Implement playback-engine audible volume per
packages/lib/playback-engine/docs/specs/20260904120003-feedback-playback-volume-loudness.md

Use a Cursor Cloud Agent. Do NOT call Codex.

Requirements:
1. Keep PlaybackHandle.setVolume(level: number) (0..1, clamp, default 1).
2. Prefer Web Audio: MediaElementSource → GainNode → destination so iOS Safari hears the change (element.volume is ignored there).
3. Isolation Demo slider must audibly change level.
4. Tests/docs note the iOS HTMLAudioElement.volume quirk.
5. When complete, update the spec with a Resolution section.

Do NOT:
- Restyle the PWA
- Add mute or volume persistence
- Modify session-store or capture-engine
- Commit node_modules, dist, or lockfiles

Stop when the spec is resolved with Resolution and an audible Isolation Demo.
```
