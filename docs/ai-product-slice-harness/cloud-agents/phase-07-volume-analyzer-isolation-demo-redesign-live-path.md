# Phase 07: Isolation Demo redesign — live package path

**Package**: packages/lib/volume-analyzer  
**Spec**: packages/lib/volume-analyzer/docs/specs/20260907163000-feedback-isolation-demo-redesign-live-path.md  
**Visual contract**: packages/lib/volume-analyzer/isolation-demo/README.md  
**Status**: unresolved  
**Roster**: docs/PHASE-07-06.md  
**Runner**: Cursor Cloud Agent (not Codex)

## Model / runner notes (read first)

- Implement this spec with a **Cursor Cloud Agent**. Do **not** call Codex (`codex exec` or any Codex CLI).
- This job is **volume-analyzer Isolation Demo** (plus a narrow helper / optional `session.ts` store injection if needed to call real exports). Do **not** change `proposeSnipsFromProfile` cut math / `src/snips.ts` algorithm / `DEFAULT_SNIP_OPTIONS` values.
- Do **not** fix BLT hangover or ASR in product.
- Do **not** edit PWA recording UX except if you must read it. Do not change production ingest behavior.
- Run **`make build`** so `docs/isolation-demos/volume-analyzer/` publishes.
- Do **not** mark the spec resolved until the live path is the default factory floor (F1 / F2 / F3 screenshots), then add a Resolution section.

## Task Summary

The current Isolation Demo batch-runs `proposeSnipsFromProfile` over the whole session (one global floor + sliders). Production uses `analyzeVolumeForSession` + `proposeSnipsForSession` incrementally (freeze saved snips; `windowStartTime = lastEnd`; adaptive floor on that window; `includeTrailing: false` while recording, `true` on Stop). Redesign the demo so it operates the package the way the PWA records. Cover the real public surfaces. Keep overlay, doctor, zoom/pan, snip play. Move sliders into a labeled Offline batch disclosure.

## What to Change

### Isolation Demo UI (`isolation-demo/` — App, panels, README if labels shift)

Implement the visual contract in `isolation-demo/README.md` and the Phase-1 panels in the spec:

- **Default = live path.** Inputs left / profile+reason center / outputs right.
- Live mic **or** step/replay fixture/archive chunks as `chunkEncoded` (~4s).
- Each tick: volume update then incremental propose (`includeTrailing: false` while growing, `true` on Stop / last archive chunk).
- Show current-window adaptive floor, floor history, frozen vs trailing.
- No leading global noise-floor slider on the live path. Read-only `DEFAULT_SNIP_OPTIONS`.
- Archive: prefer `volume-profile.json` samples; label decode fallback.
- Keep Live (archived) overlay + `scanSnipBoundaries` doctor; default compare = incremental frozen.
- Keep zoom/pan + snip play/playhead.
- **Offline batch** collapsed: `proposeSnipsFromProfile` + sliders + Reset to app defaults. Banner: **not how the PWA records.**

### Package glue (prefer real exports)

Either:

1. Call `analyzeVolumeForSession` / `proposeSnipsForSession` against an in-demo sandbox / memory adapter (not `web-whisper-db`), or
2. Extract a pure incremental helper that those session functions also call (`windowStart` + freeze + trailing). Production still uses the session APIs.

Do **not** reimplement freeze + `windowStartTime` only inside `App.tsx`. Re-export what the demo calls from `isolation-demo/src/volumeAnalyzer.ts`.

### Checklist (must exercise or name)

`analyzeChunksVolume`, `analyzeVolume`, `analyzeVolumeForSession`, `proposeSnipsFromProfile`, `proposeSnips`, `proposeSnipsForSession`, `computeAdaptiveQuietThresholdDb`, `detectSilenceGaps`, `DEFAULT_SNIP_OPTIONS`, `scanSnipBoundaries`, zoom/pan + play, Reset to app defaults (batch).

## What NOT to Change

- Do NOT change snip / noise-floor algorithm (`src/snips.ts`, `proposeSnipsFromProfile`, default constants)
- Do NOT fix BLT hangover / ASR / product transcription
- Do NOT open `web-whisper-db` or add Groq to the demo
- Do NOT make Offline batch the default
- Do NOT drop doctor, live overlay, zoom/pan, or snip play
- Do NOT commit `node_modules`, `dist`, or lockfile surprises

## Stop Conditions

Mark spec resolved when:

1. Default UI is the live path (F1 three-chunk walkthrough)
2. Archive replay prefers stored samples and aims at live archived count/ranges (F2 / F3; document epsilon)
3. Offline batch is labeled NOT live path
4. Surface checklist is covered
5. `make build` published Isolation Demo artifacts
6. Spec has a Resolution section with F1 / F2 / F3 screenshots
7. `isolation-demo/README.md` still matches what shipped

## Implementation Prompt

```
Implement the volume-analyzer Isolation Demo live-path redesign per
packages/lib/volume-analyzer/docs/specs/20260907163000-feedback-isolation-demo-redesign-live-path.md
and packages/lib/volume-analyzer/isolation-demo/README.md

Use a Cursor Cloud Agent. Do NOT call Codex.

Requirements:
1. Default factory floor is the live package path (not full-session batch).
2. Live mic and fixture/archive step: each ~4s chunk runs volume update then
   incremental propose (includeTrailing false while growing, true on Stop/end).
3. Prefer calling analyzeVolumeForSession + proposeSnipsForSession (sandbox)
   or a shared incremental helper those functions use. Do not one-off freeze
   logic only in App.tsx.
4. Show per-window adaptive floor, floor history, frozen vs trailing.
5. Archive replay prefers volume-profile.json samples; label decode fallback.
6. Keep live archived overlay, boundary doctor, zoom/pan, snip play.
7. Offline batch is a collapsed disclosure with a NOT-live-path banner and
   the old sliders / Reset to app defaults / proposeSnipsFromProfile.
8. Do not change proposeSnipsFromProfile or DEFAULT_SNIP_OPTIONS values.
9. Dave’s BLT debug zip + archived profile + production defaults should match
   live snip count/ranges (document epsilon). Do not “fix” a mismatch by
   changing the kernel.
10. Run make build. Update the spec with a Resolution section and screenshots.

Do NOT:
- Edit PWA ingest / snip algorithm / hangover / ASR
- Open web-whisper-db or add Groq
- Make batch sliders the default live path
- Commit node_modules, dist, or lockfiles

Stop when the spec is resolved with Resolution, the README still matches the
UI, and Pages Isolation Demo artifacts are published.
```
