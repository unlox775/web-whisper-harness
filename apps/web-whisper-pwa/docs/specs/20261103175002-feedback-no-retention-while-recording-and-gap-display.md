Spec Status: unresolved
Spec Type: feedback
Created: 2026-11-03T17:50:00Z
Product: apps/web-whisper-pwa
Contract: docs/DURABILITY-CONTRACT.md

# Feedback: No retention while recording; show saved audio and gaps honestly

## User Feedback

During recording the PWA calls `enforceCap` / retention after **every** chunk (`src/context.tsx` ~l.246, 374, 393, 412, 496, 507). Combined with store/engine bugs this lost 48 chunks; the session then showed 56:08 elapsed with only 52:56 of audio and no indication of gaps.

## Depends on

- `packages/datastore/session-store/docs/specs/20261103175000-feedback-owner-serialized-writes-never-reject.md` (`getChunkCoverage`, cheap retention)
- `packages/lib/capture-engine/docs/specs/20261103175001-feedback-never-drop-encoded-chunks.md` (`chunk_lost`, `persist_backpressure`, `flushPending` result)

Supersedes `20261006180517-feedback-await-flushpending-before-retention.md`.

## Requested Outcome

1. **No retention during recording** unless storage stats say usage ≥ 90% of cap (then at most once per 60 s). Otherwise retention runs only after Stop (after `await flushPending()`), on app start/idle, or from Settings.
2. **Session detail / coverage view shows** elapsed time vs saved audio duration and gaps from `getChunkCoverage`, e.g. "56:08 elapsed · 52:56 saved · 48 gaps", with each gap's time range.
3. A session with missing seqs is never shown as READY/done without the gap indicator.
4. **"Storage write failed" banner only on real loss** (`chunk_lost`). Transient `store_write_failed` goes to logs only; `persist_backpressure` shows a softer "Saving is behind" notice.

## Contract doc updates

The planning PR already rewrote the superseded contract lines to the new behavior. The implementing PR must make the docs below match the shipped API exactly (signatures, event shapes, error classes) and keep both sides in sync:

- `apps/web-whisper-pwa/customers/README.md` and any PWA expectations docs: state the PWA no longer coordinates writers with retention.
- Verify producer-side `packages/datastore/session-store/customers/web-whisper-pwa.md` and `packages/lib/capture-engine/customers/web-whisper-pwa.md` match what the PWA now calls; fix any drift.

## Tests (must pass)

- 100-chunk recording under cap → retention never called during recording; called once after Stop.
- Recording at ≥ 90% cap → retention called at most once per 60 s.
- Coverage with missing middle seq → gap shown with time range; session not READY-without-gap.
- `store_write_failed` alone → no banner; `chunk_lost` → banner.
- iPhone-viewport screenshot of session detail with gaps (per iphone visual QA). Run `make build` last.

## Out of scope

Store and engine internals; soak harness (separate spec).
