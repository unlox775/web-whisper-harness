# Phase 04: PWA → volume-analyzer Customer Request

**Date**: 2026-08-26  
**Phase**: 04 (Customer Requests)  
**Relationship**: apps/web-whisper-pwa → packages/lib/volume-analyzer  
**Customer Document**: `packages/lib/volume-analyzer/customers/web-whisper-pwa.md`

## Relationship Summary

The PWA calls volume-analyzer post-recording to compute volume profiles (for volume histogram display) and propose snip boundaries (for transcription). Volume-analyzer reads chunks from session-store, processes them, and writes volume profiles + snips back to session-store.

## Customer Request Content

The PWA's customer request in `packages/lib/volume-analyzer/customers/web-whisper-pwa.md` specifies:

- **`analyzeVolume(sessionId)` interface**: Called post-recording to compute volume profile. Volume-analyzer reads chunks from session-store, decodes MP3 to PCM, computes peak dB per chunk, writes volume profile to session-store.

- **`proposeSnips(sessionId)` interface**: Called after volume analysis to detect snip boundaries based on quiet regions. Returns snip list. PWA displays snips in session detail view.

- **`recomputeSnipsWithThreshold(sessionId, thresholdDb)` interface**: Called when user adjusts silence threshold in settings. Volume-analyzer recomputes snip boundaries with new threshold.

- **Error handling expectations**: All errors returned as structured objects (NOT thrown exceptions). PWA displays error toasts for `session_not_found`, `no_chunks`, `no_volume_profile`.

- **Edge case handling**: All-quiet sessions (zero snips), all-loud sessions (single snip covering entire session), short sessions (< 5s, still valid snips).

- **Volume histogram display**: PWA reads volume profile from session-store, displays histogram (one bar per chunk, Y-axis = peak dB). Volume-analyzer does NOT provide UI; PWA owns histogram rendering.

## Phase 05 Follow-Up

Phase 05 producer-response agent will write volume-analyzer's response in the same customer document, confirming how it will meet the PWA's request.
