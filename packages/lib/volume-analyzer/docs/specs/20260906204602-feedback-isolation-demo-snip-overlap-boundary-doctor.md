Spec Status: unresolved
Spec Type: feedback
Created: 2026-09-06T20:46:02Z
Product: packages/lib/volume-analyzer

# Feedback: Isolation Demo — snip overlap + boundary-repeat detection

## User Feedback

Dave’s live Debug UI on `ses_1788550979475_nxkjk4yv` (~3m27s) shows **contiguous** snip times with **repeated boundary words**:

| Snip | Range | Transcript (boundary) |
| --- | --- | --- |
| #9 | 1:55→2:11 | ends “BLT's.” |
| #10 | 2:11→2:30 | starts “BLT is cheese quesadilla” |
| #11 | continues | “cheese quesadillas” |

Timestamps **abut** (`end(N) === start(N+1)`). Time-overlap is **zero**. Words still repeat. Possible causes (do not “fix” yet): edge hangover audio in both clips, ASR bleed, or live incremental proposal ≠ full-session recompute.

He needs **diagnosis tooling** that flags:

1. Actual **time overlaps** between snip ranges
2. **Adjacent transcript n-gram repeats** at boundaries
3. A **live (archived) vs recomputed** comparison when both sets exist

There is **no** `packages/*/doctor` package. PWA Session Detail Debug has `apps/web-whisper-pwa/src/doctor.ts` (`runDoctor`): coverage gaps, missing blobs, decode failures, and a `snipScan` that only checks out-of-range / `end <= start`. It does **not** detect overlaps or transcript repeats.

Keep the new checks in the **volume-analyzer Isolation Demo** (plus a small shared helper). Optionally feed the same helper into PWA `snipScan` — Isolation Demo is sufficient to resolve this spec.

## Depends on

- Spec A (`20260906204600`) — recomputes should be runnable at app defaults so the comparison is meaningful.
- Spec B (`20260906204601`) — archived live snips + transcripts in the zip. If B is not on the branch, still detect overlaps / n-grams on **recomputed** snips and on any demo-local transcript text; skip the live-vs-recompute panel until archived snips exist.

Implement **B before C** if C’s comparison panel needs archived snips.

## Requested Outcome

Diagnosis surface only. Do **not** change `proposeSnipsFromProfile` / `src/snips.ts` / defaults.

### 1. Shared helper (preferred: volume-analyzer)

Add a small, tested helper (library `src/` **or** Isolation Demo `src/` if you want zero PWA coupling). If PWA doctor will call it, put it in `packages/lib/volume-analyzer/src/` and export it. Do **not** create a new package.

Inputs: a list of snips `{ startTime, endTime, id? }` plus optional transcript strings aligned in the same order (or `{ snipId, text }`).

**Time overlap**

- Two snips overlap when `startA < endB && startB < endA` and the intersection length is **> ε** (e.g. 1 ms).
- **Abutting** ranges (`endA === startB` or `|endA − startB| ≤ ε`) are **not** overlaps.
- Report each overlapping pair: indices/ids, both ranges, overlap `[from, to]`, duration.

**Adjacent transcript n-gram repeats** (when text exists)

- Consider consecutive snips only (sorted by `startTime`).
- Tokenize simply: lowercase, strip wrapping punctuation. Treat `BLT's` / `blt` as a match if you normalize possessives / trailing `'` / `'s` (document the rule).
- Flag when the last **k** tokens of snip N ≈ the first **k** tokens of snip N+1 for any **k ∈ {1, 2, 3}**.
- Dave’s case: last token of #9 (`blt's` → `blt`) equals first token of #10 (`blt`). That is a **k=1** hit. “cheese quesadilla(s)” between #10/#11 is a **k=2** (or fuzzy suffix) hit — document whether you stem a trailing `s`.
- If a snip has no text, skip the n-gram check for that boundary; still run time-overlap.

**Contiguous + repeat is a finding**

Call this out in the UI and in helper metadata, e.g. `contiguousBoundaryRepeat`:

- `overlapDuration === 0` (or abutting)
- **and** an n-gram repeat

Copy must not say “no issues” just because overlap count is 0. Headline something like: **Contiguous times with repeated words — not a time overlap.**

### 2. Isolation Demo UI

On the volume-analyzer Isolation Demo, after snips exist:

- A **Doctor / boundary** panel (sidebar or under Proposed Snips). Not a hidden console dump.
- Counts: snip N, overlap pairs, n-gram boundary hits, contiguous-repeat hits.
- List flagged pairs with times + the repeated tokens.
- When **both** live (archived) snips and recomputed snips exist (Spec B):
  - Side-by-side and/or histogram overlay: live vs recomputed (count, ranges, which boundaries are flagged on each set).
  - Distinct marker styles (already required to keep live vs recomputed distinguishable).
- When only recomputed snips exist: still run overlap + n-gram on that set (n-gram only if the demo has text — archived transcripts or a later demo transcription; if no text, say **n-gram skipped — no transcripts**).

Do not require Groq / transcription-client to resolve this spec. Archived transcripts from Spec B are enough for Dave’s BLT session.

### 3. Optional PWA doctor

If cheap: extend `apps/web-whisper-pwa/src/doctor.ts` `snipScan` with overlap + n-gram (join `getTranscriptsForSession`). Same helper. Isolation Demo alone is enough to mark this spec resolved.

## Tests

Pure helper tests (no browser required):

- Overlap pair (`[0, 10]` vs `[8, 15]`)
- Abutting pair (`[115, 131]` vs `[131, 150]`) → **no** overlap, **yes** contiguous
- Invalid / empty lists
- N-gram: “BLT's.” / “BLT is cheese quesadilla” → k=1 hit
- N-gram: “…cheese quesadilla” / “cheese quesadillas…” → document expected k
- Missing transcripts → n-gram skipped, overlaps still reported
- Contiguous + n-gram → `contiguousBoundaryRepeat` (or equivalent) true

## Notes For Phase 07

- Cursor Cloud Agent only — never Codex.
- Isolation Demo + helper; PWA doctor optional.
- Do **not** change the snip algorithm.
- `make build` so `docs/isolation-demos/volume-analyzer/` publishes. If PWA doctor changes, refresh `docs/` PWA artifacts too.
- Screenshot: doctor panel showing a contiguous boundary-repeat (BLT fixture or a unit-constructed list).
- Update this spec with a Resolution section when implementation ships.
- Do **not** mark this spec resolved from a specs-only commit.

## Out of scope

- Changing hangover / `proposeSnipsFromProfile` / incremental vs full-session proposal
- Spec A slider reset and Spec B export format (consume them; do not redo)
- A new doctor package
- Requiring live Groq transcription in the Isolation Demo

## Resolution Criteria

Mark this spec resolved when:

- [ ] Time overlaps between snip `start`/`end` ranges are detected and listed
- [ ] Adjacent 1–3 token transcript repeats are detected when text exists
- [ ] Contiguous times + repeated words is a first-class finding even when overlap is zero
- [ ] Live (archived) vs recomputed side-by-side / overlay exists when both sets are loaded
- [ ] Helper is unit-tested (overlap, abut, BLT-style n-gram)
- [ ] `proposeSnipsFromProfile` / defaults unchanged
- [ ] `make build` published Isolation Demo (and PWA if doctor.ts changed)
- [ ] Spec updated with a Resolution section documenting what shipped
