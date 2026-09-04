# Phase 07: Histogram playhead follows main session playback

**Package**: apps/web-whisper-pwa  
**Spec**: apps/web-whisper-pwa/docs/specs/20260904120005-feedback-histogram-playhead.md  
**Status**: unresolved  
**Runner**: Cursor Cloud Agent (not Codex)

## Model / runner notes (read first)

- Implement this spec with a **Cursor Cloud Agent**. Do **not** call Codex (`codex exec` or any Codex CLI).
- This job is **PWA only** (`VolumeHistogram` + session-detail playback state).
- **PWA UI change:** iPhone DevTools screenshot of histogram + playhead is **optional but preferred** before marking resolved.
- Run **`make build`** from the repo root before push so `docs/` GitHub Pages PWA artifacts refresh.
- Do **not** mark the spec resolved until the playhead tracks `timeupdate` and a Resolution section exists (`make build` required because this is PWA UI).

## Task Summary

Pass main-session playback `currentTime` (and duration if needed) into `VolumeHistogram` and draw a moving playhead while the histogram is visible.

## What to Change

### 1. VolumeHistogram (`src/components/VolumeHistogram.tsx`)

- Accept `currentTime?: number` and `duration?: number` (or equivalent)
- Draw a clear playhead (solid, distinct from amber dashed snip markers)
- Prefer playback/session duration for the x-scale so playhead and snip starts share one time domain (today the canvas uses `samples.length * 0.1` — fix alignment if needed, do not change snip detection)

### 2. SessionDetailScreen

- Pass existing `currentTime` / `duration` from the main `PlaybackHandle` `timeupdate` path
- Only show the playhead when histogram is visible and there is a position (playing or paused)
- Hide when idle (no handle / never started)

## What NOT to Change

- Do NOT change snip detection or volume-analyzer
- Do NOT implement wake lock, durability beeps, snips text, or playback-engine volume
- Do NOT modify session-store
- Do NOT expand Isolation Demos unless a trivial comment
- Do NOT commit `node_modules`, `dist`, or lockfile surprises

## Stop Conditions

Mark spec resolved when:

1. Playhead updates on `timeupdate` while histogram is visible
2. Playing and paused-with-position work; idle hides the playhead
3. Snip markers stay aligned with the same x-scale
4. `make build` completed
5. Spec has a Resolution section (iPhone shot preferred)

## Implementation Prompt

```
Implement histogram playhead per
apps/web-whisper-pwa/docs/specs/20260904120005-feedback-histogram-playhead.md

Use a Cursor Cloud Agent. Do NOT call Codex.

Requirements:
1. Pass session-detail playback currentTime (and duration if needed) into VolumeHistogram.
2. Draw a clear playhead that updates on timeupdate while the histogram is visible.
3. Show when playing or paused with a position; hide when idle.
4. Keep snip boundary lines on the same time scale. Do not change snip detection.
5. iPhone DevTools screenshot optional but preferred.
6. Run make build from repo root before push.
7. Update the spec with a Resolution section.

Do NOT:
- Change volume-analyzer / snip detection
- Touch wake lock, snips text, or setVolume
- Modify session-store
- Commit node_modules, dist, or lockfiles

Stop when the spec is resolved with Resolution and make build.
```
