# Phase 07 Iteration 01: Session Detail Visual Match

**Date**: 2026-08-27  
**Scope**: Feedback specs for matching existing Web Whisper session-detail screen

## Overview

Phase 07-01 focuses on bringing the harness PWA session-detail screen into visual and functional parity with the existing production Web Whisper app (https://unlox775.github.io). The goal is to match the iPhone experience shown in Dave's screenshots.

## Spec Roster

This iteration produces two feedback specs:

1. **playback-engine volume control** (packages/lib/playback-engine)
   - Path: `packages/lib/playback-engine/docs/specs/20260827044500-feedback-playback-volume-control.md`
   - Status: unresolved
   - Scope: Add setVolume control to PlaybackHandle

2. **session-detail visual match** (apps/web-whisper-pwa)
   - Path: `apps/web-whisper-pwa/docs/specs/20260827044510-feedback-session-detail-match-existing.md`
   - Status: unresolved
   - Scope: Match existing app's session-detail card layout, controls, and behaviors

## Implementation Order

**Product dependency order:**

1. **playback-engine first** - Volume control is a package-level feature that PWA will consume
2. **web-whisper-pwa second** - Depends on playback-engine volume control being available

Each package has its own cloud agent prompt in `docs/ai-product-slice-harness/cloud-agents/`.

## In Scope

- Volume slider control during playback (shot-06 shows volume slider while playing)
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

## Out of Scope (Deferred)

### Phase 7.1b: Live Recording Overlay (Placeholder)
- Screenshot incoming (not here yet)
- Bottom overlay showing live transcription while recording
- Phase 6 full-screen red recording takeover is good; overlay will be additive
- **DO NOT spec from guesswork** - wait for screenshot

### Open Questions (No Spec Yet)
- **Home/Sessions layout**: Record button placement (top vs bottom), session list position
  - Dave is used to original layout but open to better placement
  - Wait for more screenshots before speccing

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
- shot-01: session detail, transcription, trash+Close
- shot-02: developer icons visible, Chunks list
- shot-03: Snips tab, snip items with badges and controls
- shot-04: Groq rate-limit error on whisper-large-v3-turbo
- shot-05: Delete recording modal
- shot-06: different session, playing with volume slider

Reference these screenshots when implementing visual layout.
