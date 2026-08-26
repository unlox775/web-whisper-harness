Spec Status: unresolved
Spec Type: initial-product-spec
Created: 2026-08-26T15:20:37Z
Product: packages/lib/volume-analyzer

# Volume Analyzer — Initial Product Spec

## Product Goal

Analyze recorded audio chunks to compute volume profiles and propose snip boundaries for transcription. Volume-analyzer reads chunk audio (MP3 blobs), decodes to PCM, computes volume over time, detects silence based on threshold, and proposes segment boundaries where speech starts and stops. The package exists to turn one long recording into intelligently segmented pieces that can be transcribed efficiently.

**Core value**: Replace "transcribe the whole session" with "transcribe only the speech segments," saving API cost and improving transcript usefulness.

## Product Type

This product lives under `packages/lib/`. Lib packages own behavior.

**Durable data ownership**: Volume-analyzer **owns no durable data**. Session-store owns all data (sessions, chunks, volume profiles, snips). Volume-analyzer reads chunks from session-store, computes profiles and snips, and writes results back to session-store. Volume-analyzer does not maintain its own persistence layer.

## Boundary

### Owns

- **Volume computation**: Decode MP3 chunks to PCM using Web Audio API `decodeAudioData()`, compute peak dB or RMS volume per time sample (100ms intervals recommended), produce volume profile array
- **Silence detection**: Compare volume samples to threshold (default -40dB or 30% relative volume), mark regions as "quiet" or "loud" based on threshold
- **Snip proposal algorithm**: Group contiguous loud chunks into snips, split on silence gaps longer than minimum duration, merge short snips, split long snips, handle edge cases (all-quiet → zero snips, all-loud → one snip, very short session → one snip)
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
- **Failure result**: `{success: false, error: "Session not found" | "No chunks for session" | "Chunk decode failed" | "Session-store write failed"}` (caller should log error, optionally mark session as "volume analysis failed")

### `proposeSnips(sessionId, options?)`

- **Input**: 
  - `sessionId` (string or UUID; requires session with volume profile already computed)
  - `options` (optional): `{quietThreshold?: number, minSnipDuration?: number, maxSnipDuration?: number}` (defaults: quietThreshold -40dB or 30% relative, minSnipDuration 5s, maxSnipDuration 60s)
- **Action**: Read volume profile from session-store (calls `analyzeVolume(sessionId)` first if profile missing), detect silence gaps (volume < threshold for > 1s), group contiguous loud regions into snips, merge snips shorter than minSnipDuration, split snips longer than maxSnipDuration, write snip list to session-store
- **Output**: `{success: boolean, snips: [{snipId, startTime, endTime, startChunkIndex, endChunkIndex, confidence}]}` (snips also written to session-store)
- **Caller**: PWA after recording completes (automated), or user "Re-snip" button (developer mode with custom threshold)
- **Store read**: Session-store (read session metadata, read volume profile for session)
- **Store changed**: Session-store (write snip list for session: array of `{snipId, startTime, endTime, startChunkIndex, endChunkIndex, chunkRefs: [chunkIds], confidence}`)
- **Failure result**: `{success: false, error: "Session not found" | "Volume profile missing" | "Volume profile empty (all-quiet session)" | "Session-store write failed"}` (caller should log error; all-quiet session is not a failure, returns `{success: true, snips: []}` with explanatory note)

### `recomputeSnipsWithThreshold(sessionId, quietThreshold)`

- **Input**: `sessionId`, `quietThreshold` (number, 0–100% relative or -60dB to 0dB absolute)
- **Action**: Read existing volume profile from session-store (does NOT recompute volume), re-run snip proposal algorithm with new threshold, write updated snip list to session-store
- **Output**: `{success: boolean, snips: [{...}]}` (same shape as `proposeSnips`)
- **Caller**: Developer mode "Re-snip" button after threshold slider adjusted
- **Store read**: Session-store (read session, read volume profile)
- **Store changed**: Session-store (overwrite snip list for session)
- **Failure result**: Same as `proposeSnips`

## Volume Computation Algorithm

### Decode MP3 to PCM

Use Web Audio API `AudioContext.decodeAudioData(arrayBuffer)` to decode MP3 chunk blob to PCM `AudioBuffer`. AudioBuffer contains PCM samples as Float32Array (values -1.0 to +1.0), sample rate (typically 48kHz or 44.1kHz), and channel count (mono or stereo).

**Mono handling**: If chunk is stereo, average left and right channels to produce mono PCM for volume analysis. This simplifies volume computation and matches capture-engine's PCM-first design (capture produces mono PCM, encodes to MP3, volume-analyzer decodes back to mono PCM).

### Compute Volume Samples

For each chunk's PCM buffer:
1. Divide PCM buffer into 100ms windows (sample rate / 10 samples per window, e.g., 4800 samples for 48kHz)
2. For each window, compute **peak dB**: `peakDb = 20 * Math.log10(Math.max(...window samples absolute values))`
3. Alternatively, compute **RMS volume**: `rms = Math.sqrt(sum(sample^2) / windowSize)`, then `rmsDb = 20 * Math.log10(rms)`
4. Store sample array: `samples: Float32Array` (one value per 100ms, length = chunk duration * 10)

**Decision: Peak dB vs RMS**. Recommendation: **Peak dB** for silence detection (catches brief loud moments that should not be cut), **RMS volume** for visualization (smoother waveform). Compute both, store both in volume profile. Use peak dB for snip proposal algorithm.

### Aggregate Chunk-Level Volume

For each chunk, compute:
- `avgDb`: Average of all sample dB values in chunk
- `peakDb`: Maximum sample dB value in chunk
- `quietSampleCount`: Count of samples below threshold (for quick all-quiet detection)

Store chunk-level profile: `{chunkId, chunkIndex, avgDb, peakDb, quietSampleCount, samples: Float32Array}`.

### Edge Cases

- **Empty chunk** (no PCM samples after decode): Mark chunk as "decode failed," skip in snip proposal, log warning
- **Very quiet chunk** (all samples < -60dB): Valid chunk, mark as silent, include in snip proposal (may be silence gap between snips)
- **Very loud chunk** (peak > -10dB or clipping): Valid chunk, mark as loud, may indicate clipping or very close mic (do not reject, include in snip)
- **Chunk decode error** (MP3 corrupt or unsupported codec): Return failure for `analyzeVolume`, caller should log error and optionally mark session as incomplete

## Silence Detection Algorithm

### Threshold-Based Detection

Default quiet threshold: **-40dB** (or **30% relative volume** if using normalized 0–100% scale). Threshold is user-adjustable in developer mode.

For each 100ms sample in volume profile:
- If `sampleDb < quietThreshold`: sample is **quiet**
- If `sampleDb >= quietThreshold`: sample is **loud**

### Silence Gap Detection

A **silence gap** is a contiguous sequence of quiet samples lasting **≥ 1 second** (10 consecutive quiet samples at 100ms resolution).

Silence gaps shorter than 1s are ignored (brief pauses within speech, not true silence). This prevents over-segmentation (e.g., speaker pauses between words should not create separate snips).

### Algorithm Parameters

- `quietThreshold`: -40dB default, adjustable -60dB to -20dB (or 10% to 50% relative)
- `minSilenceGapDuration`: 1.0s default (min duration to count as silence gap)
- `minSnipDuration`: 5s default (snips shorter than this are merged with adjacent snips)
- `maxSnipDuration`: 60s default (snips longer than this are split at nearest silence gap or at 60s boundary if no silence)

## Snip Proposal Algorithm

### Core Algorithm: Group Loud Regions

1. **Mark loud regions**: Scan volume profile, mark all samples `>= quietThreshold` as loud
2. **Find silence gaps**: Scan for contiguous quiet regions ≥ 1s
3. **Create candidate snips**: Each region between silence gaps (or session start/end) is a candidate snip
4. **Merge short snips**: If candidate snip < `minSnipDuration`, merge with adjacent snip (prefer merging forward, unless at end of session)
5. **Split long snips**: If candidate snip > `maxSnipDuration`, split at nearest internal silence gap; if no internal silence, split at `maxSnipDuration` boundary (hard split)
6. **Assign snip IDs**: Number snips sequentially (0, 1, 2, ...)
7. **Compute chunk references**: For each snip, record `startChunkIndex`, `endChunkIndex`, and `chunkRefs: [chunkIds]` (list of chunks that overlap snip time range)
8. **Compute confidence**: Confidence = `(loud sample count in snip) / (total sample count in snip)` (0.0 to 1.0, higher = more confident this is speech, not silence)

### Edge Cases

- **All-quiet session** (no loud samples): Return `{success: true, snips: []}` (zero snips, not an error; caller should display "No speech detected, transcription skipped")
- **All-loud session** (no silence gaps ≥ 1s): Return one snip covering entire session (start 0s, end = session duration)
- **Very short session** (< 5s, shorter than `minSnipDuration`): Return one snip covering entire session (do not reject short sessions)
- **Silence at start/end**: Leading silence (first N seconds quiet) and trailing silence (last N seconds quiet) are excluded from snips (snips start at first loud sample, end at last loud sample)
- **No chunks** (session with zero chunks): Return `{success: false, error: "No chunks for session"}` (cannot analyze volume or propose snips)

### Example Walkthrough

**Input**: Session with 3 chunks (12s total), volume profile:
- Chunk 0 (0–4s): samples [quiet, quiet, loud, loud, loud, loud, loud, loud, loud, loud] (0–0.2s quiet, 0.2–4s loud)
- Chunk 1 (4–8s): samples [loud, loud, loud, loud, quiet, quiet, quiet, quiet, quiet, quiet] (4–5.6s loud, 5.6–8s quiet)
- Chunk 2 (8–12s): samples [quiet, quiet, loud, loud, loud, loud, loud, loud, loud, loud] (8–8.2s quiet, 8.2–12s loud)

**Silence gap detection**: 
- Gap 1: 5.6s–8.2s (2.6s quiet, ≥ 1s → silence gap)
- Leading silence: 0–0.2s (< 1s → not a silence gap, but excluded from snip start)
- Trailing silence: none (session ends on loud)

**Candidate snips**:
- Snip 0: 0.2s–5.6s (loud region before silence gap, 5.4s duration, ≥ minSnipDuration, ✓)
- Snip 1: 8.2s–12s (loud region after silence gap, 3.8s duration, < minSnipDuration 5s → merge with adjacent? No adjacent after, keep as short snip)

**Final snips**:
- Snip 0: startTime 0.2s, endTime 5.6s, chunks [0, 1], confidence 0.95 (38 loud samples / 40 total)
- Snip 1: startTime 8.2s, endTime 12s, chunks [2], confidence 0.90 (34 loud samples / 38 total)

**Output**: `{success: true, snips: [{snipId: 0, startTime: 0.2, endTime: 5.6, startChunkIndex: 0, endChunkIndex: 1, chunkRefs: [chunk0Id, chunk1Id], confidence: 0.95}, {snipId: 1, startTime: 8.2, endTime: 12, startChunkIndex: 2, endChunkIndex: 2, chunkRefs: [chunk2Id], confidence: 0.90}]}`

## Session-Store Integration

Volume-analyzer does not own storage. All reads and writes go through session-store's public interface.

### Reads (Session-Store → Volume-Analyzer)

- `getSession(sessionId)`: Read session metadata (id, duration, chunk count, status)
- `getChunksForSession(sessionId)`: Read all chunk metadata and MP3 blobs for session
- `getVolumeProfile(sessionId)`: Read existing volume profile (if already computed)

### Writes (Volume-Analyzer → Session-Store)

- `saveVolumeProfile(sessionId, profile)`: Write volume profile for session (replaces existing profile if present)
  - `profile`: `{chunkProfiles: [{chunkId, chunkIndex, avgDb, peakDb, samples: Float32Array}], computedAt: timestamp}`
- `saveSnips(sessionId, snips)`: Write snip list for session (replaces existing snips if present)
  - `snips`: `[{snipId, startTime, endTime, startChunkIndex, endChunkIndex, chunkRefs: [chunkIds], confidence}]`

### Error Handling

If session-store read fails (session not found, chunks missing, DB error):
- Return `{success: false, error: "Session not found"}` or specific error
- Caller (PWA) should log error, display user-facing message ("Unable to analyze volume, session may be incomplete")

If session-store write fails (DB full, write permission error):
- Return `{success: false, error: "Session-store write failed"}`
- Caller should retry or mark session as "analysis incomplete"

## Isolation Demo

The package-local Isolation Demo is the standing founder/developer customer. It operates volume-analyzer independently without the production PWA.

### Purpose

Prove that volume-analyzer:
- Decodes MP3 chunks to PCM correctly (Web Audio API `decodeAudioData` works)
- Computes volume profile accurately (peak dB values match expected fixture values)
- Detects silence based on threshold (quiet regions identified correctly)
- Proposes snips intelligently (snip boundaries at silence gaps, edge cases handled)
- Allows operator to adjust threshold and see snip boundaries update in real-time (proves algorithm is tunable)

### Runtime

- **Platform**: Web app (local dev server, Node.js + Vite or equivalent)
- **Viewport**: Desktop browser (1280px+ width recommended, factory floor operating surface, not phone-shaped)
- **Launch**: `cd packages/lib/volume-analyzer/isolation-demo && npm start` (or `npm run dev`), then open `http://localhost:3000` (or auto-assigned port)

### Data Mode

**Fixture audio by default** (safe default, no mic permission, no capture-engine dependency, no session-store reads).

Fixture chunks: Pre-generated MP3 blobs with known volume patterns embedded in demo:
1. **Quiet → Loud → Quiet** (15s total: 3s quiet, 9s loud speech, 3s quiet)
2. **All Quiet** (10s of near-silence, tests zero-snip case)
3. **All Loud** (10s of continuous speech, no silence, tests single-snip case)
4. **Loud → Quiet → Loud** (12s total: 4s loud, 4s quiet gap, 4s loud, tests 2-snip case)
5. **Short Speech** (3s loud, < minSnipDuration 5s, tests short-snip merge logic)

**Optional mode: Live from Capture** (in-memory, not persisted). When "Enable Live Capture" toggle ON:
- Include capture-engine as demo dependency (in-memory mode only, does not write to session-store)
- Display "Start Capture" / "Stop Capture" buttons
- After stop, captured chunks live in RAM (array of MP3 blobs + metadata)
- Operator clicks "Compute Volume" → volume-analyzer processes in-memory chunks → histogram displays
- Operator clicks "Propose Snips" → snips proposed from in-memory volume profile
- Discarded when page reloads or toggle OFF

### Panel-Based Layout (Matches Isolation Demo README)

See `isolation-demo/README.md` for full 4-panel layout:
1. **Top Chrome Panel**: Heading, data mode chip ("FIXTURE AUDIO" / "LIVE FROM CAPTURE (in-memory)"), "Enable Live Capture" toggle
2. **Control Panel** (left quarter): "Compute Volume" button, "Propose Snips" button, "Reset" button, silence threshold slider (-60dB to -20dB, default -40dB), fixture pattern dropdown (visible when toggle OFF)
3. **Volume Histogram Panel** (center half): Horizontal bar chart (one bar per chunk, X-axis = chunk index, Y-axis = peak dB), silence threshold line (dashed horizontal), snip boundaries (vertical cyan lines), updates when "Compute Volume" or "Propose Snips" clicked
4. **Snip List Panel** (right quarter): Proposed snips table (Snip ID, Chunks, Time Range, Duration), updates when "Propose Snips" clicked or threshold slider moves

### Before / After States (Fixture Mode)

**Before state (page load, fixture mode, no volume computed yet)**:
- Top chrome: "FIXTURE AUDIO" chip, "Enable Live Capture" toggle OFF
- Control panel: "Compute Volume" enabled (cyan), "Propose Snips" disabled (gray), "Reset" enabled, silence threshold -40dB, fixture pattern "Quiet → Loud → Quiet"
- Volume histogram: Empty (no bars), placeholder text "Click 'Compute Volume' to generate profile"
- Snip list: Empty (no rows), placeholder text "Click 'Propose Snips' after volume computed"

**After state (after "Compute Volume" clicked, fixture "Quiet → Loud → Quiet")**:
- Volume histogram: 3 bars visible (chunks 0–2 for 15s total: chunk 0 ~-55dB quiet, chunk 1 ~-15dB loud, chunk 2 ~-55dB quiet), dashed line at -40dB threshold
- Control panel: "Compute Volume" disabled (gray, already computed), "Propose Snips" enabled (cyan, ready to propose)
- Snip list: Still empty (snips not proposed yet)

**After state (after "Propose Snips" clicked, default -40dB threshold)**:
- Volume histogram: Same 3 bars, **2 vertical cyan lines** (snip boundaries: start of loud region at ~3s, end of loud region at ~12s)
- Snip list: **1 row** visible (Snip 0: Chunks 1–1, 3.0s–12.0s, 9.0s duration)
- Control panel: "Propose Snips" disabled (gray, already proposed)

**After state (threshold slider moved to -30dB, snips recomputed)**:
- Volume histogram: Dashed line moved up to -30dB, snip boundaries may shift (if chunk 0 or 2 had samples between -40dB and -30dB, snip range extends)
- Snip list: Possibly same 1 snip with extended range, or 2 snips if new loud regions detected
- Control panel: Slider at -30dB, "Propose Snips" re-enabled (cyan, ready to recompute with new threshold)

### Walkthrough Value

Operator can:
1. Select fixture pattern (e.g., "All Quiet") → click "Compute Volume" → see histogram with all bars near bottom (proves all-quiet detection)
2. Select "All Quiet" → click "Propose Snips" → see snip list empty with message "No speech detected (all-quiet session)" (proves zero-snip edge case)
3. Select "All Loud" → compute → propose → see 1 snip covering entire session (proves all-loud edge case)
4. Select "Quiet → Loud → Quiet" → compute → propose → see 1 snip (excludes leading/trailing silence)
5. Adjust threshold slider from -40dB to -25dB → snip boundaries move, snip count may change (proves algorithm is tunable, not hard-coded)
6. Toggle "Enable Live Capture" ON → start capture → speak into mic → stop → compute → propose → see snips from live audio (proves capture → volume analysis flow without session-store)

**Proves independently**: Volume computation works (histogram shows expected dB values for known fixture patterns), silence detection works (quiet regions < threshold excluded from snips), snip proposal works (boundaries at silence gaps, edge cases handled), threshold tuning works (real-time snip boundary updates).

## Validation Plan

### Manual Demo Walkthrough (Phase 06 Implementation Checklist)

1. **Fixture mode basic flow**:
   - Launch demo (`npm start`)
   - Default fixture "Quiet → Loud → Quiet" selected
   - Click "Compute Volume" → histogram populates with 3 bars (quiet, loud, quiet pattern visible)
   - Click "Propose Snips" → snip list shows 1 snip (excludes leading/trailing silence)
   - ✓ Pass: Histogram matches expected pattern, snip list shows 1 snip with ~9s duration

2. **Edge case: All Quiet**:
   - Select fixture "All Quiet" → compute → propose
   - ✓ Pass: Snip list empty, message "No speech detected"

3. **Edge case: All Loud**:
   - Select fixture "All Loud" → compute → propose
   - ✓ Pass: Snip list shows 1 snip covering entire session (0s to 10s)

4. **Threshold tuning**:
   - Select fixture "Quiet → Loud → Quiet" → compute → propose (default -40dB)
   - Move threshold slider to -25dB (stricter, more samples count as quiet)
   - ✓ Pass: Snip boundaries move (snip start time later, end time earlier), or snip splits into multiple snips
   - Move threshold slider to -50dB (looser, fewer samples count as quiet)
   - ✓ Pass: Snip boundaries move (snip start time earlier, end time later), may merge with edge silence

5. **Live capture mode (optional)**:
   - Toggle "Enable Live Capture" ON → click "Start Capture" → speak into mic for 10s → click "Stop Capture"
   - Click "Compute Volume" → histogram populates with live audio bars
   - Click "Propose Snips" → snip list shows snips from live audio
   - ✓ Pass: Histogram shows volume pattern from live audio, snip boundaries reasonable (speech regions identified)

6. **Reset flow**:
   - After any operation, click "Reset" → histogram clears, snip list clears, buttons re-enable
   - ✓ Pass: Demo returns to initial state

### Automated Test Cases (Future Phase 07 Work Order)

Phase 06 focuses on manual demo validation. Automated unit tests (Jest or Vitest) are future work:
- `analyzeVolume()` with fixture MP3 blobs → assert volume profile dB values match expected ±2dB
- `proposeSnips()` with all-quiet volume profile → assert returns `{success: true, snips: []}`
- `proposeSnips()` with all-loud volume profile → assert returns 1 snip covering entire session
- `proposeSnips()` with quiet-loud-quiet profile → assert returns 1 snip (excludes leading/trailing silence)
- `recomputeSnipsWithThreshold()` with threshold -30dB vs -50dB → assert snip boundaries differ

## Implementation Checklist (Phase 06)

Phase 06 implementation agent should build:

### Core Volume Computation Logic

- [ ] `analyzeVolume(sessionId)` function (reads chunks from session-store, decodes MP3 to PCM, computes volume profile, writes to session-store)
- [ ] `decodeChunkToPCM(mp3Blob)` helper (Web Audio API `decodeAudioData`, returns PCM Float32Array)
- [ ] `computeVolumeSamples(pcmBuffer)` helper (divide PCM into 100ms windows, compute peak dB per window, return Float32Array of dB values)
- [ ] `aggregateChunkVolume(samples)` helper (compute avgDb, peakDb, quietSampleCount for chunk)
- [ ] Error handling (chunk decode fails, session-store read/write fails, return `{success: false, error: ...}`)

### Snip Proposal Logic

- [ ] `proposeSnips(sessionId, options?)` function (reads volume profile, detects silence gaps, groups loud regions, writes snips to session-store)
- [ ] `detectSilenceGaps(volumeProfile, quietThreshold)` helper (scan samples, find contiguous quiet regions ≥ 1s, return array of `{startTime, endTime}`)
- [ ] `groupLoudRegions(volumeProfile, silenceGaps)` helper (regions between silence gaps become candidate snips)
- [ ] `mergeShortSnips(snips, minSnipDuration)` helper (merge snips < 5s with adjacent snips)
- [ ] `splitLongSnips(snips, maxSnipDuration)` helper (split snips > 60s at nearest internal silence gap or hard boundary)
- [ ] `computeSnipConfidence(snip, volumeProfile)` helper (confidence = loud sample count / total sample count)
- [ ] `recomputeSnipsWithThreshold(sessionId, quietThreshold)` function (reuses existing volume profile, re-runs snip proposal with new threshold)

### Session-Store Integration

- [ ] Session-store interface layer (read session, read chunks, read volume profile, write volume profile, write snips)
- [ ] Mock session-store for Isolation Demo (in-memory store for fixture chunks, does not depend on real session-store package)

### Isolation Demo UI

- [ ] 4-panel layout (top chrome, control panel, histogram panel, snip list panel)
- [ ] Fixture audio generation (5 fixture MP3 blobs with known patterns, embedded in demo or generated on load)
- [ ] "Compute Volume" button → calls `analyzeVolume()` with fixture chunks → updates histogram
- [ ] "Propose Snips" button → calls `proposeSnips()` → updates snip list + histogram boundaries
- [ ] Silence threshold slider → updates dashed line in histogram, enables "Propose Snips" button (recompute with new threshold)
- [ ] Histogram rendering (canvas or SVG, one bar per chunk, Y-axis dB scale, threshold line, snip boundary lines)
- [ ] Snip list table (Snip ID, Chunks, Time Range, Duration columns)
- [ ] "Reset" button → clears histogram, snip list, re-enables buttons
- [ ] Optional: "Enable Live Capture" toggle → includes capture-engine, adds "Start/Stop Capture" buttons (in-memory mode)

### Documentation

- [ ] Update `README.md` with usage examples (`analyzeVolume`, `proposeSnips`)
- [ ] Update `isolation-demo/README.md` with launch instructions, walkthrough steps
- [ ] Mark this spec `Spec Status: resolved` after implementation complete and demo validated

## Customer Relationships

Volume-analyzer has two customers:

1. **`apps/web-whisper-pwa`** (primary production customer; see `customers/web-whisper-pwa.md`)
   - PWA calls `analyzeVolume(sessionId)` after recording completes
   - PWA calls `proposeSnips(sessionId)` to get transcription segments
   - PWA may call `recomputeSnipsWithThreshold(sessionId, threshold)` if user adjusts threshold in developer mode

2. **Isolation Demo** (standing founder/developer customer; see `customers/00-isolation-demo.md`)
   - Demo exercises volume computation, silence detection, snip proposal independently
   - Demo uses fixture audio by default (no session-store dependency)
   - Demo optionally includes live capture (in-memory, no persist)

Customer request sections (middle third of customer documents) will be filled by Phase 04 customer-request agents. Producer response sections (bottom third) will be filled by Phase 05 producer-response agents.
