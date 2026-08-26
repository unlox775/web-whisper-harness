# Phase 05: volume-analyzer Producer Responses

**Date**: 2026-08-26  
**Phase**: 05 (Producer Responses)  
**Producer**: packages/lib/volume-analyzer  
**Customer Documents**: 2 customer files in `packages/lib/volume-analyzer/customers/`

## Producer Summary

Volume-analyzer is the lib package that computes volume profiles from audio chunks and proposes snip boundaries based on quiet regions. It reads chunks, processes them, and writes volume profiles + snips to session-store. It has 2 customers:

1. **Isolation Demo** (`00-isolation-demo.md`): Standing human customer that proves volume computation and snip proposal work with fixture data (no session-store dependency)
2. **web-whisper-pwa** (`web-whisper-pwa.md`): Primary orchestrator that calls volume-analyzer post-recording

## Producer Response Content

Volume-analyzer's producer responses specify:

### Interfaces for Isolation Demo (Fixture-First)

**`analyzeVolume(chunks)`** → `{chunkVolumes: [{chunkId, peakDb}]}` or error

- Input: `chunks: Array<{id, seq, blob}>` (fixture chunks from demo)
- Decodes each MP3 blob to PCM, computes peak dB per chunk
- Returns volume profile array
- Errors: `{error: 'no_chunks'}`, `{error: 'invalid_audio', chunkId}`

**`proposeSnips(chunks, volumeProfile, options?)`** → `{snips: [...]}` or error

- Inputs: chunks metadata, volumeProfile, `options?: {silenceThresholdDb?: -40}`
- Detects silence regions (peakDb < threshold), groups loud chunks into snips
- Returns snip proposals with confidence scores

### Interfaces for PWA (Session-Store Integration)

**`analyzeVolume(sessionId)`** → `{success: boolean, profileSummary?, error?}`

- Reads chunks from session-store, computes volume profile, writes to session-store
- Returns structured result (NOT exception): `{success: true, profileSummary: {chunkCount, avgPeakDb, maxPeakDb}}` or `{success: false, error: string}`
- Errors: `session_not_found`, `no_chunks`, `database_unavailable`, `audio_decode_failed`

**`proposeSnips(sessionId, options?)`** → `{success: boolean, snips?, error?}`

- Reads volume profile (calls `analyzeVolume` first if null), detects snips, writes to session-store
- Returns structured result with snips array or error

### Key Design Decisions

- **Fixture-first for demo**: Demo passes chunks array directly (no session-store). Validates algorithms with known-good patterns (Quiet→Loud→Quiet, All Quiet, All Loud, etc.).
- **Session-store integration for PWA**: Automatic reads (`getChunksForSession`, `getChunk`) and writes (`writeVolumeProfile`, `writeSnip`). PWA doesn't call session-store directly.
- **Volume profile overwrite**: `writeVolumeProfile` REPLACES existing profile (overwrite if exists, NOT error). Supports "Recompute Volume" feature.
- **Snip append**: `writeSnip` APPENDS snips (multiple calls per session append snips, NOT replace). Each call generates unique snipId.

### What Volume-Analyzer Will NOT Ship in Phase 06

- **`recomputeSnipsWithThreshold`**: Out of scope because session-store doesn't ship snip deletion. Workaround: leave old snips, write new snips with version suffix.
- **Session-store integration in Isolation Demo**: Too complex for demo scope. Demo operates in pure fixture mode.
- **Progress events during analysis**: Synchronous Promise (not streaming). PWA shows loading spinner while awaiting result.

## Phase 06 Follow-Up

Phase 06 implementation agent will build volume-analyzer with fixture and session-store modes, build Isolation Demo with known-good patterns, validate snip proposals.
