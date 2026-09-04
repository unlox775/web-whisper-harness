# Phase 07 Iteration 04: volume-analyzer Isolation Demo zoom / scroll / snip play

**Date**: 2026-09-04  
**Scope**: One feedback spec — Isolation Demo diagnosis UX only (no snip-algorithm change)

## Overview

Phase 07-04 writes one feedback spec so Code Monkey can launch **one Cursor Cloud Agent**. Do not use Codex.

Theme: Dave imported a long session archive into the volume-analyzer Isolation Demo. The histogram is too dense to diagnose suspected double-grabbed snips. He needs zoom, pan, live sliders while scrolled, and per-snip playback with a playhead — before any algorithm fix.

## Spec Roster

1. **Isolation Demo — histogram zoom / scroll + snip play** — `packages/lib/volume-analyzer`  
   - Path: `packages/lib/volume-analyzer/docs/specs/20260904213000-feedback-isolation-demo-histogram-zoom-scroll-snip-play.md`  
   - Prompt: `docs/ai-product-slice-harness/cloud-agents/phase-07-volume-analyzer-histogram-zoom-scroll-snip-play.md`  
   - Status: unresolved  
   - Scope: Isolation Demo `VolumeHistogram` / `SnipList` / `App` / styles only. Window slider, horizontal pan, preserve scroll on slider recompute, play snip from in-memory blobs, session-relative playhead. `make build` to publish `docs/isolation-demos/volume-analyzer/`.  
   - Out of scope: `proposeSnipsFromProfile` / `src/snips.ts` / defaults; PWA session-detail histogram; session-store / playback-engine package edits.

## How to launch

One Cursor Cloud Agent. Paste `docs/ai-product-slice-harness/cloud-agents/phase-07-volume-analyzer-histogram-zoom-scroll-snip-play.md` as the initial prompt.

`make phase-7` prints Phase 07 prompt paths and refuses Codex.

## Implementer rules

- Cursor Cloud Agent only — never Codex
- Isolation Demo only; do not change the snip algorithm
- Screenshot of zoomed + scrolled dense view with snip markers before marking resolved
- `make build` before push (Isolation Demo Pages artifacts)
- Do not mark the spec resolved until the implementation PR ships a Resolution section
