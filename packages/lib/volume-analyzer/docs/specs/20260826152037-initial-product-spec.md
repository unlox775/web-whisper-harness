Spec Status: unresolved
Spec Type: initial-product-spec
Created: 2026-08-26T15:20:37Z
Product: packages/lib/volume-analyzer

# Volume Analyzer — Initial Product Spec

## Product Goal

Provide volume computation and snip proposal. Reads chunk audio from session-store, computes volume profile (peak dB per chunk), detects silence, proposes snip boundaries (segment ranges for transcription). Does NOT capture, play, or transcribe audio.

## Boundary

- **Owns**: Volume computation (RMS or peak dB from PCM), silence detection (threshold-based, e.g., < -40dB = silence), snip proposal algorithm (group contiguous loud chunks, split on silence > threshold duration), volume profile schema (chunkVolumes array stored in session-store)
- **Does NOT own**: Audio capture (capture-engine), audio playback (playback-engine), transcription (transcription-client), storage authority (session-store owns all data), snip transcription (transcription-client does that)

## Main Interfaces

(From slice-up plan; expand in Phase 03)

- `analyzeVolume(sessionId)` → volume profile
- `proposeSnips(sessionId)` → snip list (calls analyzeVolume first if volume profile missing)

## Isolation Demo

The package-local Isolation Demo uses fixture audio (simulated chunks with known volume patterns: quiet → loud → quiet → loud → quiet) as the safe default. Optionally, the demo can include capture-engine (in-memory only) for live audio input.

See `isolation-demo/README.md` for panel-based layout. Demo proves: volume computation works (histogram shows expected peaks), silence detection works (threshold slider changes snip boundaries), snip proposal works (snip list updates when threshold changes).

## Phase 03 Product Spec Tasks

This stub spec will be expanded by the Phase 03 product-spec agent for `packages/lib/volume-analyzer` to include:

- Volume computation algorithm (RMS vs peak dB; consider Web Audio API AnalyserNode or manual PCM calculation)
- Silence detection threshold (default value, user-adjustable in developer mode)
- Snip proposal algorithm (min/max snip duration, how to handle very short silences vs very long silences, how to handle sessions with no silence)
- Session-store integration (how to read chunks, decode MP3 to PCM for volume analysis, write volume profile + snips)
- Isolation Demo implementation notes (fixture audio generation, optional capture-engine in-memory integration, histogram rendering, threshold slider behavior)
- Validation plan (manual demo walkthrough, fixture audio test cases: all-quiet, all-loud, quiet-loud-quiet, loud-quiet-loud)

## Customer Relationships

Customers of volume-analyzer:
- `apps/web-whisper-pwa` (see `customers/web-whisper-pwa.md`)
- Isolation Demo (see `customers/00-isolation-demo.md`)

Customer request sections will be filled by Phase 04 customer-request agents.
