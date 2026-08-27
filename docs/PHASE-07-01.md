# Phase 07 Iteration 01: Session Detail Visual Match

**Date**: 2026-08-27  
**Scope**: Feedback specs for matching existing Web Whisper session-detail screen

## Overview

Phase 07-01 focuses on bringing the harness PWA session-detail screen into visual and functional parity with the existing production Web Whisper app (https://unlox775.github.io). The goal is to match the iPhone experience shown in Dave's screenshots.

## Spec Roster

This iteration produces three feedback specs:

1. **playback-engine volume control** (packages/lib/playback-engine)
   - Path: `packages/lib/playback-engine/docs/specs/20260827044500-feedback-playback-volume-control.md`
   - Status: unresolved
   - Scope: Add setVolume control to PlaybackHandle

2. **live recording overlay + home layout** (apps/web-whisper-pwa)
   - Path: `apps/web-whisper-pwa/docs/specs/20260827045000-feedback-live-recording-overlay.md`
   - Status: unresolved
   - Scope: Add bottom live transcription overlay to recording screen, update home layout (CAPTURE card top, session cards with READY/PART TX badges + snippet + RETRY TX)

3. **session-detail visual match** (apps/web-whisper-pwa)
   - Path: `apps/web-whisper-pwa/docs/specs/20260827044510-feedback-session-detail-match-existing.md`
   - Status: unresolved
   - Scope: Match existing app's session-detail card layout, controls, and behaviors (snips list as proper scrollable product UI)

## Implementation Order

**Product dependency order:**

1. **playback-engine first** - Volume control is a package-level feature that PWA will consume
2. **live recording overlay second** - Independent of playback-engine, can run in parallel or after
3. **session-detail visual match third** - Benefits from having live recording complete (home layout consistency)

Each package has its own cloud agent prompt in `docs/ai-product-slice-harness/cloud-agents/`.

**Parallelization:** Live recording overlay and playback-engine volume control are independent and can run in parallel if desired.

## In Scope

### Playback Engine (Package)
- Volume slider control during playback (shot-06 shows volume slider while playing)
- `PlaybackHandle.setVolume(level)` method (0.0 to 1.0)

### Live Recording Overlay (PWA)
- **Live transcription overlay** on recording screen (bottom, shot-07/08)
  - Keep Phase 6 full-screen red recording takeover
  - ADD bottom overlay: "Live transcription", pending message, accumulating transcript, RETRY TX
  - Simple implementation: transcribe per-chunk (no incremental snip detection needed)
- **Home screen layout** (when NOT recording):
  - CAPTURE card at TOP
  - Session list BELOW capture card
  - Session cards with READY/PART TX badges (green/orange)
  - Transcript snippet on cards (2 lines, ~100 chars)
  - RETRY TX button on PART TX cards (inline, right-aligned)

### Session Detail Visual Match (PWA)
- RECORDED SESSION card layout matching iPhone shots
- Transcription section with RETRY TX button
- "Transcribed N of N snips" status line
- **SNIPS LIST as proper scrollable product UI** (main feature: per-snip RETRY with visible errors)
  - This is NOT a developer-mode leftover feature
  - Do NOT copy the cramped tiny bottom panel from existing app
  - Spec a proper iPhone-friendly scrollable list
  - Show actual error text on failed snips (e.g., rate-limit message)
  - Per-snip RETRY button is the core requirement (debugging failed transcriptions)
  - Chunks toggle is secondary; snips-for-retry is the primary reason for this UI
- Delete confirmation modal with exact copy: "Delete Recording HH:MM?"
- Close and trash buttons
- Volume slider during playback (using playback-engine setVolume)

## Out of Scope (Deferred)

### Future Optimization (Volume-Analyzer Incremental Snip Detection)
- Current approach: transcribe per-chunk (less efficient, more Groq API calls)
- Future: incremental snip detection during capture (fewer API calls, better boundaries)
- Would require volume-analyzer feedback spec for incremental APIs
- Defer until Groq costs become an issue

### Open Questions (Resolved with shot-07/08)
- ~~Home/Sessions layout~~ - RESOLVED: CAPTURE card at top, session list below
- ~~Live recording overlay~~ - RESOLVED: Bottom overlay on full-screen recording screen

### Not Product UI (Isolation Demo Visual References)
- Debug-only features visible in shots: graph icon, stethoscope/Doctor icon, ladybug icon, green overlay squares
- **Histogram** (shot-02 shows volume graph): This is Isolation Demo input for volume-analyzer, NOT PWA UI
  - Attached shots show useful visual reference for volume-analyzer Isolation Demo histogram
  - Optional: note in volume-analyzer isolation-demo README pointing to shot-02 as visual inspiration
- **Doctor/stethoscope, ladybug, graph icons**: Do NOT put these in PWA session detail

## Notes

- iPhone-first: All layouts must work on ~390px viewport
- Require screenshot proof before marking specs resolved
- After PWA implementation completes, rebuild `docs/` folder with `make build` for GitHub Pages deployment
- Do NOT commit node_modules, dist, or lockfile surprises
- Specs-only commit for this phase; implementation happens in separate agents

### Visual References for Isolation Demos (NOT PWA Scope)

The attached iPhone shots (shot-02 especially) show debug UI that should NOT go in the PWA but may inspire Isolation Demo improvements:

- **Volume histogram** (shot-02 debug icon): Visual reference for volume-analyzer Isolation Demo
  - Current volume-analyzer Isolation Demo may benefit from a histogram visualization
  - Shot-02 shows a useful graph layout for volume over time with snip boundaries
  - Optional improvement: Add histogram to volume-analyzer isolation-demo matching that visual style
- **Doctor/stethoscope, ladybug, graph icons**: These remain developer-mode or Isolation Demo features, NOT product UI

## Source Material

iPhone screenshots from existing production app (https://unlox775.github.io):

**Session detail screens:**
- shot-01: session detail, transcription, trash+Close
- shot-02: developer icons visible, Chunks list (histogram visual reference for volume-analyzer Isolation Demo)
- shot-03: Snips tab, snip items with badges and controls
- shot-04: Groq rate-limit error on whisper-large-v3-turbo
- shot-05: Delete recording modal
- shot-06: different session, playing with volume slider

**Live recording screens:**
- shot-07-record: Recording at 1:55, floating "Live transcription" overlay, session list with READY/PART TX badges
- shot-08-record: Recording at 0:09, bottom overlay with pending message "first words arrive in about 30 seconds"

Reference these screenshots when implementing visual layout.
