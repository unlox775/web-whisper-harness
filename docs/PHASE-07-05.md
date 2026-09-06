# Phase 07 Iteration 05: snip diagnosis (reset defaults, export snips, boundary doctor)

**Date**: 2026-09-06  
**Scope**: Unresolved feedback specs only (no product implementation in this roster PR)

## Overview

Phase 07-05 writes three feedback specs so Code Monkey can launch **one Cursor Cloud Agent per spec**. Do not use Codex.

Theme: Dave exported `ses_1788550979475_nxkjk4yv` (~3m27s). The zip is slim (`manifest.json` + `chunks/*.mp3`); `hasSnips` / `hasTranscript` / `hasVolumeProfile` are true but the payload is absent (Phase 07-03 default). Isolation Demo re-proposes snips with **remembered tuner sliders** that diverge from PWA / `DEFAULT_SNIP_OPTIONS`, so he cannot reproduce live BLT boundary repeats (`#9 1:55→2:11` ends “BLT's.”; `#10 2:11→2:30` starts “BLT is cheese quesadilla”; times abut, words repeat).

Need diagnosis tooling **before** any algorithm fix. Do **not** change `proposeSnipsFromProfile`.

## Spec Roster

1. **A — Isolation Demo: Reset to app defaults** — `packages/lib/volume-analyzer`  
   - Path: `packages/lib/volume-analyzer/docs/specs/20260906204600-feedback-isolation-demo-reset-snip-params-to-app-defaults.md`  
   - Prompt: `docs/ai-product-slice-harness/cloud-agents/phase-07-volume-analyzer-reset-snip-params-to-app-defaults.md`  
   - Status: unresolved  
   - Product ownership: volume-analyzer Isolation Demo only  
   - Scope: **Reset to app defaults** → `DEFAULT_SNIP_OPTIONS` + adaptive noise floor; persist; banner/offer on archive upload when saved params ≠ defaults.  
   - Out of scope: snip algorithm; session-store format; doctor UI.

2. **B — Session archive: optional include snips + transcript for debug** — `packages/datastore/session-store`  
   - Path: `packages/datastore/session-store/docs/specs/20260906204601-feedback-session-archive-include-snips-transcript-debug.md`  
   - Prompt: `docs/ai-product-slice-harness/cloud-agents/phase-07-session-archive-include-snips-transcript-debug.md`  
   - Status: resolved (debug include opt-in; Isolation Demo live overlay)  
   - Product ownership: session-store (primary). Allowed consumers: PWA Debug Export UI; volume-analyzer Isolation Demo overlay.  
   - Scope: default export stays slim; explicit debug option includes snip ranges + per-snip transcript text (+ volume profile if cheap); Isolation Demo loads/overlays archived live snips and still recomputes; document formatVersion (stay on 1 unless a required-field bump is justified).  
   - Out of scope: turning includes on by default; snip algorithm; doctor/diff panel (Spec C).

3. **C — Isolation Demo: overlap + boundary-repeat detection** — `packages/lib/volume-analyzer`  
   - Path: `packages/lib/volume-analyzer/docs/specs/20260906204602-feedback-isolation-demo-snip-overlap-boundary-doctor.md`  
   - Prompt: `docs/ai-product-slice-harness/cloud-agents/phase-07-volume-analyzer-snip-overlap-boundary-doctor.md`  
   - Status: unresolved  
   - Product ownership: volume-analyzer Isolation Demo + small shared helper. No doctor package exists; PWA `apps/web-whisper-pwa/src/doctor.ts` may reuse the helper (optional).  
   - Scope: time overlaps; adjacent 1–3 token transcript repeats; contiguous+repeat is a finding when overlap is zero; live vs recomputed side-by-side/overlay when both exist.  
   - Out of scope: snip-algorithm fix; new doctor package.

## Dependency order

```
(A) Reset Isolation Demo sliders to app defaults     — FIRST (independent)
        ↓
(B) Debug-include snips + transcripts in the archive — SECOND
        ↓
(C) Overlap + n-gram doctor + live-vs-recompute diff — LAST
```

- **A** does not need archived snips. Ship it first so recomputes can match the PWA.
- **B** before **C**: C’s comparison panel needs archived live snips + transcript text. C can still detect overlaps on recomputed-only lists if B is late, but Dave’s BLT case needs B.
- Do **not** start C until A (and preferably B) are on the branch C implements against.

## Recommended implement order

1. Spec A (reset defaults)  
2. Spec B (export/overlay live snips)  
3. Spec C (boundary doctor)

A → B → C. Implement B before C if C needs archived snips (it does for the live-vs-recompute diff).

## How to launch

One Cursor Cloud Agent per spec. Paste the matching `docs/ai-product-slice-harness/cloud-agents/phase-07-*.md` file as the initial prompt.

`make phase-7` prints Phase 07 prompt paths and refuses Codex.

## Implementer rules (all three)

- Cursor Cloud Agents only — never Codex
- Do **not** change `proposeSnipsFromProfile` / `src/snips.ts` / default constants
- Isolation Demo / PWA UI: screenshot proof before marking resolved
- `make build` before push when Isolation Demo or PWA publish output changed
- Do not mark a spec resolved until that spec’s implementation PR ships a Resolution section

## Out of scope for this roster PR

- Product behavior code
- Marking any of the three specs resolved
- Calling Codex
- Any snip-algorithm change

## Prior rosters

- `docs/PHASE-07-03.md` — session archive export/import (slim default)
- `docs/PHASE-07-04.md` — Isolation Demo histogram zoom / scroll / snip play
