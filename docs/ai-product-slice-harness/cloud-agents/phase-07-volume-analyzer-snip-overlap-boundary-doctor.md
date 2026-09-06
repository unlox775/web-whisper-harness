# Phase 07: Isolation Demo — snip overlap + boundary-repeat detection

**Package**: packages/lib/volume-analyzer  
**Spec**: packages/lib/volume-analyzer/docs/specs/20260906204602-feedback-isolation-demo-snip-overlap-boundary-doctor.md  
**Status**: unresolved  
**Roster**: docs/PHASE-07-05.md (Spec C — implement last)  
**Depends on**: Spec A (defaults) on the branch; Spec B (archived live snips) before the live-vs-recompute panel  
**Runner**: Cursor Cloud Agent (not Codex)

## Model / runner notes (read first)

- Implement this spec with a **Cursor Cloud Agent**. Do **not** call Codex (`codex exec` or any Codex CLI).
- Isolation Demo + a small shared helper. There is **no** doctor package. PWA `apps/web-whisper-pwa/src/doctor.ts` may reuse the helper; Isolation Demo is enough.
- Do **not** change `proposeSnipsFromProfile` / `src/snips.ts` / defaults.
- Run **`make build`** so `docs/isolation-demos/volume-analyzer/` publishes (and PWA `docs/` if you touch doctor.ts).
- Do **not** mark the spec resolved until overlap + n-gram + contiguous-repeat copy work, then add a Resolution section.

## Task Summary

Dave’s live snips abut in time (`1:55→2:11` / `2:11→2:30`) and repeat “BLT” / “cheese quesadilla(s)” at the cut. Overlap is zero; that is still a finding. Detect time overlaps and adjacent 1–3 token repeats. When archived live snips and recomputed snips both exist, show a side-by-side / overlay diff. Diagnosis only — no algorithm fix.

## What to Change

### Helper (volume-analyzer `src/` or Isolation Demo `src/`)

- Time overlap: intersection > ε; abutting is **not** overlap
- Adjacent n-gram: last 1–3 tokens of N ≈ first 1–3 of N+1 (normalize case / punctuation / `'s`)
- Flag `contiguousBoundaryRepeat` when abutting (or zero overlap) **and** n-gram hits
- Unit tests: overlap, abut, BLT-style “BLT's.” / “BLT is…”, missing transcripts

### Isolation Demo UI

- Doctor / boundary panel: counts + flagged pairs (times + repeated tokens)
- Copy: contiguous times with repeated words is a finding even when overlap is 0
- If live (archived) + recomputed both exist: side-by-side / overlay (count, ranges, boundary flags)
- No transcripts → skip n-gram with an explicit “n-gram skipped” note

### Optional

- PWA `runDoctor` `snipScan` uses the same helper

## What NOT to Change

- Do NOT change snip / noise-floor algorithm
- Do NOT create a new doctor package
- Do NOT redo Spec A reset or Spec B export format
- Do NOT require Groq in the Isolation Demo
- Do NOT commit `node_modules`, `dist`, or lockfile surprises

## Stop Conditions

Mark spec resolved when:

1. Overlaps are detected and listed
2. Adjacent 1–3 token repeats are detected when text exists
3. Contiguous + repeat is called out even when overlap is zero
4. Live vs recomputed diff shows when both sets exist
5. Helper tests pass
6. `make build` published artifacts
7. Spec has a Resolution section (screenshot of the doctor panel)

## Implementation Prompt

```
Implement Isolation Demo snip overlap + boundary-repeat detection per
packages/lib/volume-analyzer/docs/specs/20260906204602-feedback-isolation-demo-snip-overlap-boundary-doctor.md

Use a Cursor Cloud Agent. Do NOT call Codex.

Prerequisites:
- Spec A (reset to app defaults) should be available so recomputes can match the PWA.
- Spec B (archive include snips + transcripts) should be available for the live-vs-recompute panel.

Requirements:
1. Detect time overlaps between snip start/end ranges (abutting is not an overlap).
2. Detect adjacent transcript n-gram repeats (last 1–3 tokens of N ≈ first 1–3 of N+1) when text exists.
3. Contiguous times + repeated words is a first-class finding even when time-overlap is zero.
4. When archived live snips and recomputed snips both exist, show side-by-side / overlay (count, ranges, boundary flags).
5. Unit-test the helper (overlap, abut, BLT-style n-gram).
6. Do not change proposeSnipsFromProfile.
7. Run make build. Update the spec with a Resolution section.

Do NOT:
- Change the snip algorithm or defaults
- Create a new doctor package
- Require live Groq transcription
- Commit node_modules, dist, or lockfiles

Stop when the spec is resolved with Resolution, helper tests, and a visible doctor panel.
```
