# Phase 07: Isolation Demo — Reset snip params to app defaults

**Package**: packages/lib/volume-analyzer  
**Spec**: packages/lib/volume-analyzer/docs/specs/20260906204600-feedback-isolation-demo-reset-snip-params-to-app-defaults.md  
**Status**: unresolved  
**Roster**: docs/PHASE-07-05.md (Spec A — implement first)  
**Runner**: Cursor Cloud Agent (not Codex)

## Model / runner notes (read first)

- Implement this spec with a **Cursor Cloud Agent**. Do **not** call Codex (`codex exec` or any Codex CLI).
- This job is **volume-analyzer Isolation Demo only**. Do **not** change `proposeSnipsFromProfile` / `src/snips.ts` / `DEFAULT_SNIP_OPTIONS` values.
- Do **not** edit session-store, PWA, playback-engine, or transcription-client.
- Run **`make build`** so `docs/isolation-demos/volume-analyzer/` publishes.
- Do **not** mark the spec resolved until the control + persist + archive banner work, then add a Resolution section.

## Task Summary

Dave cannot reproduce live PWA snips in the Isolation Demo because remembered tuner sliders (IndexedDB `web-whisper-volume-analyzer-demo-db`) diverge from `DEFAULT_SNIP_OPTIONS` / adaptive noise floor. Add **Reset to app defaults** that sets and **persists** those defaults, and warn on archive upload when saved params ≠ app defaults.

## What to Change

### Isolation Demo (`isolation-demo/src/` — App, demoStore, styles, helpers)

- Visible **Reset to app defaults**: `autoNoiseFloor = true`; min/max/gap = `DEFAULT_SNIP_OPTIONS`; persist via `saveTunerSettings`.
- If a profile is already computed, recompute snips on the existing path. Do **not** wipe uploaded archive chunks just to reset sliders.
- Distinguish from the existing full **Reset** (clears analysis / live chunks).
- After a successful session-archive upload (and/or first Compute Volume in archive mode): banner/offer if tuner ≠ app defaults. Banner runs the same reset + persist. Do **not** silently overwrite saved sliders.
- Helper + test for `tunerMatchesAppDefaults` (auto on + min/max/gap match defaults; ignore stored dB when auto).

## What NOT to Change

- Do NOT change snip / noise-floor algorithm (`src/snips.ts`, `proposeSnipsFromProfile`, default constants)
- Do NOT edit PWA, session-store, or other packages’ demos
- Do NOT implement Spec B (archive snips/transcripts) or Spec C (overlap / n-gram doctor)
- Do NOT commit `node_modules`, `dist`, or lockfile surprises

## Stop Conditions

Mark spec resolved when:

1. **Reset to app defaults** applies and persists PWA / `DEFAULT_SNIP_OPTIONS` + adaptive floor
2. Archive/chunks are not discarded by that control
3. Archive upload (or first compute) banners when saved params ≠ defaults
4. `make build` published Isolation Demo artifacts
5. Spec has a Resolution section

## Implementation Prompt

```
Implement volume-analyzer Isolation Demo “Reset to app defaults” per
packages/lib/volume-analyzer/docs/specs/20260906204600-feedback-isolation-demo-reset-snip-params-to-app-defaults.md

Use a Cursor Cloud Agent. Do NOT call Codex.

Requirements:
1. Visible control: Reset to app defaults.
2. Set auto noise floor + min/max/quiet-gap to DEFAULT_SNIP_OPTIONS (same as PWA/original).
3. Persist that reset in the existing demo tuner store so reload stays on defaults.
4. Do not wipe an uploaded archive just to reset sliders; recompute snips if a profile exists.
5. On session-archive upload (or first compute after upload), show a banner/offer if saved params ≠ app defaults. Do not silently overwrite.
6. Do not change proposeSnipsFromProfile or default constants.
7. Run make build so docs/isolation-demos/volume-analyzer/ updates.
8. Update the spec with a Resolution section.

Do NOT:
- Edit session-store, PWA, or other Isolation Demos
- Implement archive snips overlay or boundary doctor (later specs)
- Commit node_modules, dist, or lockfiles

Stop when the spec is resolved with Resolution and the Isolation Demo reset + banner work.
```
