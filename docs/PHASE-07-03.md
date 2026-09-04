# Phase 07 Iteration 03: Session archive export/import

**Date**: 2026-09-04  
**Scope**: Unresolved feedback specs only (no product implementation in this roster PR)

## Overview

Phase 07-03 writes five feedback specs so Code Monkey can launch **one Cursor Cloud Agent per spec**. Do not use Codex.

Theme: Dave exports a bad/failed recording as a portable **zip** (manifest + audio chunks), then uploads that archive into Isolation Demos that already take audio (playback, volume/snips, transcription). Today DeveloperConsole `dumpStore` / Export Table as JSON is tables only — blobs are stripped.

## Spec Roster

1. **Session audio archive export/import** — `packages/datastore/session-store`  
   - Path: `packages/datastore/session-store/docs/specs/20260904180001-feedback-session-audio-archive-export-import.md`  
   - Prompt: `docs/ai-product-slice-harness/cloud-agents/phase-07-session-audio-archive-export-import.md`  
   - Status: unresolved  
   - Scope: versioned zip format; `exportSessionArchive` / `parseSessionArchive` / `importSessionArchive`; session-store Isolation Demo Export + Import; tests. No PWA UI. No other packages’ demos.

2. **Debug Export Session download** — `apps/web-whisper-pwa`  
   - Path: `apps/web-whisper-pwa/docs/specs/20260904180002-feedback-debug-export-session-download.md`  
   - Prompt: `docs/ai-product-slice-harness/cloud-agents/phase-07-debug-export-session-download.md`  
   - Status: unresolved  
   - Depends on: spec 1  
   - Scope: Session Detail Debug tab **Export Session** download via session-store API; iPhone screenshot; `make build`. No isolation demos. No retention changes.

3. **Isolation Demo — upload session archive as play source** — `packages/lib/playback-engine`  
   - Path: `packages/lib/playback-engine/docs/specs/20260904180003-feedback-isolation-demo-upload-session-archive-as-play-source.md`  
   - Prompt: `docs/ai-product-slice-harness/cloud-agents/phase-07-playback-upload-session-archive.md`  
   - Status: unresolved  
   - Depends on: spec 1 `parseSessionArchive`  
   - Scope: playback Isolation Demo file input; play parsed chunks. No PWA. Do not reimplement the format.

4. **Isolation Demo — upload session archive as analyze source** — `packages/lib/volume-analyzer`  
   - Path: `packages/lib/volume-analyzer/docs/specs/20260904180004-feedback-isolation-demo-upload-session-archive-as-analyze-source.md`  
   - Prompt: `docs/ai-product-slice-harness/cloud-agents/phase-07-volume-analyzer-upload-session-archive.md`  
   - Status: unresolved  
   - Depends on: spec 1 `parseSessionArchive`  
   - Scope: volume-analyzer Isolation Demo file input; existing analyze/snip pipeline. No PWA. Do not change snip algorithm.

5. **Isolation Demo — upload session archive as transcribe source** — `packages/lib/transcription-client`  
   - Path: `packages/lib/transcription-client/docs/specs/20260904180005-feedback-isolation-demo-upload-session-archive-as-transcribe-source.md`  
   - Prompt: `docs/ai-product-slice-harness/cloud-agents/phase-07-transcription-upload-session-archive.md`  
   - Status: unresolved  
   - Depends on: spec 1 `parseSessionArchive`  
   - Scope: transcription Isolation Demo file input; chunk audio as transcribe input (match demo’s existing one-blob model). No PWA. Do not change Groq client.

## Dependency order

```
(1) session-store archive APIs + parse helper     — SERIAL FIRST
        ↓
(2) PWA Debug Export Session     — after 1
(3) playback-engine Isolation Demo upload
(4) volume-analyzer Isolation Demo upload
(5) transcription-client Isolation Demo upload
        ↗ all three consume parseSessionArchive; parallel with each other after 1
```

- **Serial:** Spec 1 first. Specs 2, 3, 4, and 5 all need spec 1 on the branch they implement against (merged to main, or the same phase after 1 lands).
- **Parallel:** After spec 1: **2, 3, 4, and 5 in parallel** (different packages; do not share those files).

## Recommended implement order

1. Spec 1 (session-store) — **must finish first**
2. Spec 2, Spec 3, Spec 4, Spec 5 — any order, **in parallel** after 1

## How to launch

One Cursor Cloud Agent per spec. Paste the matching `docs/ai-product-slice-harness/cloud-agents/phase-07-*.md` file as the initial prompt.

`make phase-7` prints these prompt paths and refuses Codex.

## Implementer rules (all five)

- Cursor Cloud Agents only — never Codex
- One primary product per spec; do not reach into unrelated packages (importing `parseSessionArchive` from session-store is allowed for specs 2–5)
- PWA UI spec (2): iPhone DevTools screenshot proof before marking resolved
- PWA spec (2): `make build` before push (refresh `docs/` PWA artifacts only)
- Specs 1, 3, 4, 5: Isolation Demo proof; do not run `make build` unless PWA publish output actually changed
- Do not mark a spec resolved until that spec’s implementation PR ships a Resolution section

## Out of scope for this roster PR

- Product behavior code
- Marking any of the five specs resolved
- Calling Codex
