Spec Status: resolved
Spec Type: feedback
Created: 2026-11-03T17:50:00Z
Product: apps/web-whisper-pwa (cross-package integration test)
Contract: docs/DURABILITY-CONTRACT.md

# Feedback: End-to-end soak test — 60-minute recording, zero chunk loss

## User Feedback

Every package was tested only against fakes. Nothing recorded for an hour across real package boundaries and checked every seq. That is the only test that would have caught the 48 lost chunks.

## Depends on

All three: session-store `20261103175000`, capture-engine `20261103175001`, PWA `20261103175002`. Run last.

## Requested Outcome

A cross-package soak test (e.g. `apps/web-whisper-pwa/tests/soak/no-chunk-loss.test.ts`, runnable via `npm run test:soak` and a `make soak` target) using the **real** capture-engine persist queue and **real** session-store on fake-indexeddb, fake timers, and a synthetic encoder:

1. Simulate 60 minutes of recording (900 chunks at 4 s) on a pre-populated large DB (≥ 5,000 old chunks, ≥ 20,000 log rows, near cap).
2. Inject transient failures (random ~5% of writes fail transiently; plus three 3-10 s windows where all writes fail).
3. Trigger retention concurrently (Stop-path, near-cap path, and a forced Settings call mid-recording).
4. Assert: every seq 0..899 saved exactly once, in order; `getChunkCoverage.missingSeqs` empty; `savedDurationMs === elapsedMs`; no `chunk_lost`; `flushPending()` resolves `lostChunks: []`.
5. Negative control: inject one permanent error → exactly one `chunk_lost` with correct range, and coverage shows that one gap.
6. Runs in CI in < 60 s wall time.

## Contract doc updates

The planning PR already rewrote the superseded contract lines to the new behavior. The implementing PR must make the docs below match the shipped API exactly (signatures, event shapes, error classes) and keep both sides in sync:

- Add a "Proven by" link to this test in `docs/DURABILITY-CONTRACT.md` and in the durability sections of `packages/datastore/session-store/customers/capture-engine.md` and `packages/lib/capture-engine/customers/web-whisper-pwa.md`.

## Out of scope

Changing package behavior (if the soak fails, file a spec against the failing package).

## Resolution

**Resolved:** 2026-11-03T18:30:00Z on branch `cursor/pwa-e2e-soak-no-chunk-loss-818c`.

### What shipped

1. `apps/web-whisper-pwa/tests/soak/no-chunk-loss.test.ts` — real capture-engine persist queue + real session-store on fake-indexeddb, fake timers, synthetic encoder.
2. 60-minute accelerated take: 900 × 4 s chunks, ≥ 5,000 old chunks + ≥ 20,000 log rows near cap, ~5% random `store_busy` plus three 3–10 s all-fail windows, PWA retention on the near-cap / Settings / Stop paths.
3. Asserts every seq 0..899 saved once and in order; `getChunkCoverage.missingSeqs` empty; `savedDurationMs === elapsedMs` (`1:00:00 elapsed · 1:00:00 saved · 0 gaps`); no `chunk_lost`; `flushPending()` → `lostChunks: []`.
4. Negative control: permanent `quota_exceeded` on seq 5 → exactly one `chunk_lost` with `0:20–0:24` and coverage `1:20 elapsed · 1:16 saved · 1 gap`.
5. `npm run test:soak` and `make soak`. Proven-by links on `docs/DURABILITY-CONTRACT.md`, `packages/datastore/session-store/customers/capture-engine.md`, and `packages/lib/capture-engine/customers/web-whisper-pwa.md`.
