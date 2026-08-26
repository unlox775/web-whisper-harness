# Volume Analyzer

Analyzes recorded audio chunks to compute volume profiles and propose snip boundaries for transcription. Reads chunk audio (MP3 blobs) from session-store, decodes to PCM, computes volume over time, detects silence based on threshold, and proposes segment boundaries where speech starts and stops.

**Core value**: Replace "transcribe the whole session" with "transcribe only the speech segments," saving API cost and improving transcript usefulness.

## Product Type

This product lives under `packages/lib/`. Lib packages own behavior.

**Durable data ownership**: Volume-analyzer **owns no durable data**. Session-store owns all data (sessions, chunks, volume profiles, snips). Volume-analyzer reads chunks from session-store, computes profiles and snips, and writes results back to session-store.

## Boundary

### Owns

- **Volume computation**: Decode MP3 chunks to PCM using Web Audio API `decodeAudioData()`, compute peak dB or RMS volume per time sample (100ms intervals), produce volume profile array
- **Silence detection**: Compare volume samples to threshold (default -40dB or 30% relative volume), mark regions as "quiet" or "loud"
- **Snip proposal algorithm**: Group contiguous loud chunks into snips, split on silence gaps longer than minimum duration, merge short snips, split long snips, handle edge cases (all-quiet → zero snips, all-loud → one snip)
- **Volume profile schema**: Format of volume profile data structure written to session-store (chunk-level and sample-level)

### Does NOT Own

- **Audio capture**: Capture-engine owns microphone acquisition, PCM recording, MP3 encoding, chunk creation
- **Audio playback**: Playback-engine owns playing sessions, chunks, or snips
- **Transcription**: Transcription-client owns sending audio to Groq Whisper and receiving text
- **Storage authority**: Session-store owns all persistent data (sessions, chunks, volume profiles, snips, transcripts)
- **UI orchestration**: PWA owns the recording flow, session detail screens, developer mode controls

## Main Callable Interfaces

Planning names (not frozen APIs). Each interface states caller, input, output, store read or changed, and failure result.

### `analyzeVolume(sessionId)`

- **Input**: `sessionId` (string or UUID; assumes session exists in session-store with chunks already written by capture-engine)
- **Action**: Read all chunks for session from session-store, decode each MP3 chunk to PCM, compute volume profile (peak dB per 100ms sample), aggregate chunk-level volume profile (avg/max per chunk), write volume profile to session-store
- **Output**: `{success: boolean, profileSummary: {chunkCount: number, avgVolume: number, maxVolume: number, sampleCount: number}}` (detailed profile written to session-store, not returned inline)
- **Caller**: PWA after recording completes (automated), or developer mode "Recompute Volume" button
- **Store read**: Session-store (read session metadata, read all chunk MP3 blobs for session)
- **Store changed**: Session-store (write volume profile for session: array of `{chunkId, chunkIndex, avgDb, peakDb, samples: Float32Array}`)
- **Failure result**: `{success: false, error: "Session not found" | "No chunks for session" | "Chunk decode failed" | "Session-store write failed"}`

### `proposeSnips(sessionId, options?)`

- **Input**: 
  - `sessionId` (string or UUID; requires session with volume profile already computed)
  - `options` (optional): `{quietThreshold?: number, minSnipDuration?: number, maxSnipDuration?: number}` (defaults: quietThreshold -40dB or 30%, minSnipDuration 5s, maxSnipDuration 60s)
- **Action**: Read volume profile from session-store (calls `analyzeVolume(sessionId)` first if profile missing), detect silence gaps (volume < threshold for > 1s), group contiguous loud regions into snips, merge snips shorter than minSnipDuration, split snips longer than maxSnipDuration, write snip list to session-store
- **Output**: `{success: boolean, snips: [{snipId, startTime, endTime, startChunkIndex, endChunkIndex, confidence}]}` (snips also written to session-store)
- **Caller**: PWA after recording completes (automated), or user "Re-snip" button (developer mode with custom threshold)
- **Store read**: Session-store (read session metadata, read volume profile for session)
- **Store changed**: Session-store (write snip list for session: array of `{snipId, startTime, endTime, startChunkIndex, endChunkIndex, chunkRefs: [chunkIds], confidence}`)
- **Failure result**: `{success: false, error: "Session not found" | "Volume profile missing" | "Session-store write failed"}` (all-quiet session is not a failure, returns `{success: true, snips: []}`)

### `recomputeSnipsWithThreshold(sessionId, quietThreshold)`

- **Input**: `sessionId`, `quietThreshold` (number, 0–100% relative or -60dB to 0dB absolute)
- **Action**: Read existing volume profile from session-store (does NOT recompute volume), re-run snip proposal algorithm with new threshold, write updated snip list to session-store
- **Output**: `{success: boolean, snips: [{...}]}` (same shape as `proposeSnips`)
- **Caller**: Developer mode "Re-snip" button after threshold slider adjusted
- **Store read**: Session-store (read session, read volume profile)
- **Store changed**: Session-store (overwrite snip list for session)
- **Failure result**: Same as `proposeSnips`

## Isolation Demo

See `isolation-demo/README.md` for the package-local runnable demo.

**Purpose**: Prove that volume-analyzer works independently without the production PWA.

**Runtime**: Web app (local dev server), desktop browser viewport (factory floor operating surface, not phone-shaped)

**Launch**: `cd packages/lib/volume-analyzer/isolation-demo && npm start` (or `npm run dev`)

**Data mode**: Fixture audio by default (simulated chunks with known volume patterns: quiet → loud → quiet → loud → quiet). Optionally, live audio from capture-engine (in-memory only, not persisted). No real session-store reads (fixture chunks are generated in-demo).

**Safe default**: Fixture audio with known volume pattern (no mic permission, no capture-engine dependency).

**Walkthrough value**: Proves volume computation works (histogram shows expected peaks), silence detection works (threshold slider changes snip boundaries), snip proposal works (snip list updates when threshold changes), edge cases handled correctly (all-quiet → zero snips, all-loud → one snip).

## Product Specs

See `docs/specs/` for detailed implementation specs and work orders.

- `docs/specs/20260826152037-initial-product-spec.md` - Initial product spec (Phase 03, `Spec Status: unresolved` until Phase 06 implementation complete)

## Customers

- `apps/web-whisper-pwa` (primary production customer; see `customers/web-whisper-pwa.md`)
- Isolation Demo (standing founder/developer customer; see `customers/00-isolation-demo.md`)

## Algorithm Overview

### Volume Computation

1. Decode MP3 chunks to PCM using Web Audio API `decodeAudioData()`
2. Divide PCM buffer into 100ms windows
3. Compute peak dB per window: `peakDb = 20 * Math.log10(max absolute sample value)`
4. Store sample array (one value per 100ms) in volume profile

### Snip Proposal

1. Mark samples >= quietThreshold as "loud," samples < threshold as "quiet"
2. Find silence gaps (contiguous quiet regions ≥ 1s)
3. Group contiguous loud regions between silence gaps into candidate snips
4. Merge snips shorter than minSnipDuration (default 5s)
5. Split snips longer than maxSnipDuration (default 60s) at nearest internal silence gap
6. Assign snip IDs, compute chunk references, compute confidence (loud sample ratio)

### Edge Cases

- **All-quiet session**: Returns `{success: true, snips: []}` (zero snips, not an error)
- **All-loud session**: Returns one snip covering entire session
- **Very short session** (< 5s): Returns one snip covering entire session
- **Leading/trailing silence**: Excluded from snip start/end times (snips start at first loud sample, end at last loud sample)
