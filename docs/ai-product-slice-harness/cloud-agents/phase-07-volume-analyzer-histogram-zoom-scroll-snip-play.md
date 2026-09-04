# Phase 07: Isolation Demo — histogram zoom / scroll + snip play

**Package**: packages/lib/volume-analyzer  
**Spec**: packages/lib/volume-analyzer/docs/specs/20260904213000-feedback-isolation-demo-histogram-zoom-scroll-snip-play.md  
**Status**: resolved  
**Runner**: Cursor Cloud Agent (not Codex)

## Model / runner notes (read first)

- Implement this spec with a **Cursor Cloud Agent**. Do **not** call Codex (`codex exec` or any Codex CLI).
- This job is **volume-analyzer Isolation Demo only**. Do **not** change `proposeSnipsFromProfile` / `src/snips.ts` / defaults.
- Do **not** edit the PWA session-detail histogram.
- Do **not** edit session-store / playback-engine packages (prefer `HTMLAudioElement`; do not add playback-engine as a demo dependency).
- Run **`make build`** so `docs/isolation-demos/volume-analyzer/` publishes.
- Do **not** mark the spec resolved until zoom + scroll + live sliders + snip play/playhead work, then add a Resolution section.

## Task Summary

Dave cannot diagnose double-grabbed snips on a long archive: the histogram is too dense. Add zoom, pan, keep sliders live while scrolled, and play individual snips with a session-relative playhead. Diagnosis only — no algorithm fix.

## What to Change

### Isolation Demo (`isolation-demo/src/` — VolumeHistogram, SnipList, App, styles)

- **Window slider**: seconds visible across the histogram width. Default fit-all for short sessions; ~30s window for long ones.
- **Horizontal scrollbar / pan** when `window < duration`. Preserve `viewStart` across snip recomputes; clamp only when the window requires it.
- **Snip markers + noise floor** stay correct in the zoomed/scrolled viewport (session time = flattened 100ms samples from t=0, same domain as proposed snips).
- **Play** a snip from in-memory chunk blobs (archive / live / fixture). Assemble the snip’s time range; play via `HTMLAudioElement`.
- **Playhead** is session-relative: `snip.startTime + audio.currentTime`. Pause freezes; stop/ended clears.

## What NOT to Change

- Do NOT change snip / noise-floor algorithm (`src/snips.ts`, `proposeSnipsFromProfile`, defaults)
- Do NOT edit PWA session-detail histogram
- Do NOT edit session-store or playback-engine packages
- Do NOT commit `node_modules` or lockfile surprises

## Stop Conditions

Mark spec resolved when:

1. Zoom + pan work on a dense / long profile
2. Sliders recompute snips without resetting scroll
3. Snip play + session-relative playhead work; pause freezes; stop/ended clears
4. `make build` published Isolation Demo artifacts
5. Spec has a Resolution section (screenshot of zoomed+scrolled view with snip markers)

## Implementation Prompt

```
Implement volume-analyzer Isolation Demo histogram zoom/scroll + snip play per
packages/lib/volume-analyzer/docs/specs/20260904213000-feedback-isolation-demo-histogram-zoom-scroll-snip-play.md

Use a Cursor Cloud Agent. Do NOT call Codex.

Requirements:
1. Window slider: seconds visible across the histogram width.
2. Horizontal scrollbar / pan when zoomed in.
3. Snip markers and noise floor stay correct in the viewport.
4. Noise-floor / min / max / quiet-gap sliders still recompute while scrolled; preserve scroll offset.
5. Play a snip from in-memory chunk blobs; session-relative playhead.
6. Pause freezes the playhead; stop/ended clears it.
7. Do not change proposeSnipsFromProfile or core library snipping logic.
8. Run make build so docs/isolation-demos/volume-analyzer/ updates.
9. Update the spec with a Resolution section.

Do NOT:
- Edit PWA session-detail histogram
- Edit session-store or playback-engine packages
- Add playback-engine as a new demo dependency
- Commit node_modules or lockfiles

Stop when the spec is resolved with Resolution, the demo works, and Pages artifacts are included.
```
