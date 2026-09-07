# Phase 07 Iteration 06: Isolation Demo redesign (live package path)

**Date**: 2026-09-07  
**Scope**: Unresolved feedback spec + Isolation Demo visual contract only (no demo UI implementation in this roster PR)

## Overview

Phase 07-06 writes **one** feedback spec so Code Monkey can launch **one Cursor Cloud Agent**. Do not use Codex.

Theme: Dave confirmed the volume-analyzer Isolation Demo is misleading. It batch-runs `proposeSnipsFromProfile` over the whole session (one global adaptive floor + tuner sliders). Production PWA uses `analyzeVolumeForSession` + `proposeSnipsForSession` incrementally (freeze saved snips; `windowStartTime = lastEnd`; adaptive floor on that window as ~4s `chunkEncoded` ticks arrive; `includeTrailing: false` while recording, `true` on Stop). Archive upload of real 4s chunks therefore cannot replay live cuts (13 vs 11).

Need a **significant Isolation Demo redesign** documented at Phase-1 detail (panels, chrome, before/after) **before** any demo UI work. Do **not** change `proposeSnipsFromProfile`. Do **not** implement the new UI in this roster PR.

## Spec Roster

1. **Isolation Demo redesign — live package path** — `packages/lib/volume-analyzer`  
   - Path: `packages/lib/volume-analyzer/docs/specs/20260907163000-feedback-isolation-demo-redesign-live-path.md`  
   - Visual contract: `packages/lib/volume-analyzer/isolation-demo/README.md`  
   - Prompt: `docs/ai-product-slice-harness/cloud-agents/phase-07-volume-analyzer-isolation-demo-redesign-live-path.md`  
   - Status: **resolved** in the Isolation Demo live-path implementation PR (shared incremental helpers + factory-floor redesign)  
   - Product ownership: volume-analyzer Isolation Demo (+ optional narrow session helper / sandbox adapter).  
   - Scope: Live path default (mic or step-through of fixture/archive chunks); same logical path as PWA `ingestGrowingSession`; per-window floor + frozen vs trailing; archive prefers `volume-profile.json` samples; keep overlay / doctor / zoom / play; Offline batch disclosure labeled NOT live path; package surface checklist.  
   - Out of scope for the implementer: snip-algorithm change; BLT hangover/ASR product fix; PWA recording UX; opening `web-whisper-db`.  
   - Out of scope for **this** roster PR: implementing the new demo UI/code.

## Dependency order

```
PHASE-07-05 A/B/C (reset defaults, debug archive include, boundary doctor) — already on main
        ↓
PHASE-07-06 spec + README contract (this roster) — MERGE FIRST
        ↓
PHASE-07-06 implementer (one Cursor Cloud Agent) — after specs merge
```

The redesign **consumes** doctor, live overlay, Reset to app defaults, and archive parse. It does not redo those specs. Implement only after this unresolved spec is on `main` (or the implementer’s base includes this branch).

## How to launch

One Cursor Cloud Agent. Paste `docs/ai-product-slice-harness/cloud-agents/phase-07-volume-analyzer-isolation-demo-redesign-live-path.md` as the initial prompt.

`make phase-7` prints Phase 07 prompt paths and refuses Codex.

## Implementer rules

- Cursor Cloud Agents only — never Codex
- Do **not** change `proposeSnipsFromProfile` / `src/snips.ts` cut math / default constants
- Isolation Demo screenshots (F1 three chunks, F2 zip replay, F3 live vs incremental) before marking resolved
- `make build` before push when Isolation Demo publish output changed
- Do not mark the spec resolved until the implementation PR ships a Resolution section

## Out of scope for this roster PR

- Isolation Demo UI/code implementation
- Marking the spec resolved
- Calling Codex
- Any snip-algorithm change
- PWA / BLT hangover / ASR fixes

## Prior rosters

- `docs/PHASE-07-03.md` — session archive export/import (slim default)
- `docs/PHASE-07-04.md` — Isolation Demo histogram zoom / scroll / snip play
- `docs/PHASE-07-05.md` — reset defaults, debug-include snips/transcripts, boundary doctor
