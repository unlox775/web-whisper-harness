# Phase 07 Iteration 02: Durability, audible volume, snips text, histogram playhead

**Date**: 2026-09-04  
**Scope**: Unresolved feedback specs only (no product implementation in this roster PR)

## Overview

Phase 07-02 writes five feedback specs so Code Monkey can launch **one Cursor Cloud Agent per spec**. Do not use Codex.

Themes: mid-recording stall events, PWA wake lock + no-audio pulse/beep, playback loudness that actually works on iPhone, snip transcript previews, and a histogram playhead.

## Spec Roster

1. **Ongoing audio stream stall detection (mid-recording)** — `packages/lib/capture-engine`  
   - Path: `packages/lib/capture-engine/docs/specs/20260904120001-feedback-ongoing-audio-stream-stall-detection.md`  
   - Prompt: `docs/ai-product-slice-harness/cloud-agents/phase-07-ongoing-audio-stream-stall-detection.md`  
   - Status: unresolved  
   - Scope: `audioStalled` / `audioResumed` after audio has started; do not auto-stop; keep start `no_audio_received` watchdog

2. **Recording durability UX — wake lock + no-audio pulse/beep** — `apps/web-whisper-pwa`  
   - Path: `apps/web-whisper-pwa/docs/specs/20260904120002-feedback-recording-durability-ux.md`  
   - Prompt: `docs/ai-product-slice-harness/cloud-agents/phase-07-recording-durability-ux.md`  
   - Status: unresolved  
   - Depends on: spec 1  
   - Scope: screen wake lock; consume stall/resume; pulse + 3-beep; do not auto-stop

3. **Playback volume actually changes loudness (esp. iPhone)** — `packages/lib/playback-engine`  
   - Path: `packages/lib/playback-engine/docs/specs/20260904120003-feedback-playback-volume-loudness.md`  
   - Prompt: `docs/ai-product-slice-harness/cloud-agents/phase-07-playback-volume-loudness.md`  
   - Status: unresolved  
   - Scope: Web Audio gain so `setVolume` is audible on iOS Safari; Isolation Demo slider

4. **Snips list shows transcript text per snip** — `apps/web-whisper-pwa`  
   - Path: `apps/web-whisper-pwa/docs/specs/20260904120004-feedback-snips-list-transcript-text.md`  
   - Prompt: `docs/ai-product-slice-harness/cloud-agents/phase-07-snips-list-transcript-text.md`  
   - Status: unresolved  
   - Scope: compact transcript preview on each snip row

5. **Histogram playhead follows main session playback** — `apps/web-whisper-pwa`  
   - Path: `apps/web-whisper-pwa/docs/specs/20260904120005-feedback-histogram-playhead.md`  
   - Prompt: `docs/ai-product-slice-harness/cloud-agents/phase-07-histogram-playhead.md`  
   - Status: unresolved  
   - Scope: playhead on debug `VolumeHistogram` from `timeupdate`

session-store is **not** in this roster.

## Dependency order

```
(1) capture-engine stall events
        ↓
(2) PWA durability UX (wake lock + pulse/beep)

(3) playback-engine loudness     — independent
(4) PWA snips transcript text    — independent
(5) PWA histogram playhead       — independent
```

- **Serial:** Spec 1 → Spec 2 (PWA 2 consumes events from 1).
- **Parallel:** Spec 3, Spec 4, and Spec 5 can run in parallel with each other.
- Spec 3 / 4 / 5 may also run **in parallel with Spec 1** if you are careful (they do not share those files). Do **not** start Spec 2 until Spec 1’s events exist on the branch Spec 2 implements against.

## Recommended implement order

1. Spec 1 (capture stall)  
2. Spec 2 (PWA durability) — after 1  
3. Spec 3, Spec 4, Spec 5 — any order, can overlap with each other (and with Spec 1 if desired)

## How to launch

One Cursor Cloud Agent per spec. Paste the matching `docs/ai-product-slice-harness/cloud-agents/phase-07-*.md` file as the initial prompt.

`make phase-7` prints these prompt paths and refuses Codex.

## Implementer rules (all five)

- Cursor Cloud Agents only — never Codex
- One primary product per spec; do not reach into unrelated packages
- PWA UI specs (2, 4, and preferred 5): iPhone DevTools screenshot proof before marking resolved
- PWA specs: `make build` before push (refresh `docs/` PWA artifacts only)
- Do not mark a spec resolved until that spec’s implementation PR ships a Resolution section

## Out of scope for this roster PR

- Product behavior code
- Marking any of the five specs resolved
- session-store changes
