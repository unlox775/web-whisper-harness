# Volume Analyzer Isolation Demo

Package-local runnable demo for operating volume-analyzer independently without the production PWA.

## Purpose

Proves that volume-analyzer:
- Computes volume profile (peak dB per chunk) from audio chunks
- Detects silence based on threshold (e.g., < -40dB = silence)
- Proposes snips (segment boundaries) by grouping loud chunks and splitting on silence
- Allows operator to adjust silence threshold and see snip boundaries update in real-time

## Runtime

- **Platform**: Web app (local dev server, factory floor operating surface)
- **Viewport**: Desktop browser (wider factory floor, not phone-shaped)
- **Launch**: `cd packages/lib/volume-analyzer/isolation-demo && npm start` (or equivalent)

## Data Mode

**Fixture audio by default** (simulated chunks with known volume patterns: quiet → loud → quiet → loud → quiet). Optionally, **live audio from capture-engine** (in-memory only, not persisted). No real session-store reads (fixture chunks are generated in-demo).

**Safe default**: Fixture audio with known volume pattern (no mic permission, no capture-engine dependency).

## Panel-Based Layout

**4 distinct regions:**

### 1. Top Chrome Panel (fixed header, spans full width)

- **Left**: "Volume Analyzer Isolation Demo" heading (bold)
- **Center**: Data mode chip: "FIXTURE AUDIO" (default, gray border) or "LIVE FROM CAPTURE (in-memory)" (cyan border, if capture mode enabled)
- **Right**: "Enable Live Capture" toggle (checkbox or switch; when ON → capture-engine included, live audio used instead of fixture)

### 2. Control Panel (left quarter of viewport, below chrome)

**Components:**
- "Compute Volume" button (cyan, full-width, enabled when chunks available)
- "Propose Snips" button (cyan, full-width, enabled after volume profile computed)
- "Reset" button (gray, full-width, clears volume profile + snips + fixture chunks if fixture mode; always enabled)
- Silence threshold slider: "-60dB ← → -20dB" (default -40dB, adjustable; updates snip proposals in real-time when volume profile exists)
- Fixture pattern dropdown (only visible when "Enable Live Capture" OFF):
  - "Quiet → Loud → Quiet → Loud → Quiet" (default, 5 segments)
  - "All Quiet" (no loud sections, tests zero-snip case)
  - "All Loud" (no silence, tests single-snip case)
  - "Loud → Quiet → Loud" (2 loud segments, 1 silence gap)

**Behaviors:**
- When "Compute Volume" clicked → volume profile computes (fixture chunks or live capture chunks analyzed), histogram panel populates, button disables until Reset
- When "Propose Snips" clicked → snip list computes based on current silence threshold, snip list panel populates, button disables until Reset or threshold changes
- When silence threshold slider moves → snip proposals recompute automatically (if volume profile exists), snip list updates
- When fixture pattern dropdown changes → fixture chunks regenerate (if in fixture mode), volume profile + snips clear (must recompute)
- When "Reset" clicked → volume profile cleared, snips cleared, histogram cleared, snip list cleared, buttons reset (Compute/Propose enabled again)
- When "Enable Live Capture" toggled ON → capture-engine included (in-memory), "Start Capture" button appears, fixture dropdown hidden

### 3. Volume Histogram Panel (center half of viewport, below chrome)

**Components:**
- Heading: "Volume Profile (Peak dB per Chunk)" (small gray text)
- Horizontal bar chart (one bar per chunk, X-axis = chunk index, Y-axis = peak dB from -60dB to 0dB):
  - Quiet chunks: bars near bottom (e.g., -50dB to -60dB), red color
  - Loud chunks: bars near top (e.g., -10dB to -20dB), green color
  - Silence threshold line: horizontal dashed line at current threshold (e.g., -40dB), updates when slider moves
  - Snip boundaries: vertical cyan lines overlaid on histogram (mark start/end of each snip), appear after "Propose Snips" clicked

**Behaviors:**
- When "Compute Volume" clicked: bars populate (one per chunk, heights = peak dB values)
- When silence threshold slider moves: dashed line moves up/down, snip boundaries recompute and redraw
- When "Reset" clicked: histogram clears (no bars)

### 4. Snip List Panel (right quarter of viewport, below chrome, scrollable)

**Components:**
- Heading: "Proposed Snips" (small gray text)
- List of proposed snips (grows after "Propose Snips" clicked; each snip is a row):
  - Column 1: Snip ID (0, 1, 2...)
  - Column 2: Start chunk index → End chunk index (e.g., "Chunks 0–3", "Chunks 5–7")
  - Column 3: Start time → End time (e.g., "0.0s – 12.5s", "20.0s – 28.3s")
  - Column 4: Duration (e.g., "12.5s", "8.3s")

**Behaviors:**
- When "Propose Snips" clicked → snip list populates (one row per snip, based on silence detection)
- When silence threshold slider moves → snip list updates automatically (snips recompute: more silence → more snips; less silence → fewer snips)
- When "Reset" clicked → snip list clears (no rows)

## Before / After States

**Before state (page load, fixture mode, no volume computed yet):**
- Top chrome: "FIXTURE AUDIO" chip, "Enable Live Capture" toggle OFF
- Control panel: "Compute Volume" enabled (cyan), "Propose Snips" disabled (gray), "Reset" enabled, silence threshold -40dB, fixture pattern "Quiet → Loud → Quiet → Loud → Quiet"
- Volume histogram: Empty (no bars), placeholder text "Click 'Compute Volume' to generate profile"
- Snip list: Empty (no rows), placeholder text "Click 'Propose Snips' after volume computed"

**After state (after Compute Volume → Propose Snips with default -40dB threshold, fixture pattern Quiet→Loud→Quiet→Loud→Quiet):**
- Top chrome: "FIXTURE AUDIO" chip, "Enable Live Capture" toggle OFF
- Control panel: "Compute Volume" disabled (gray, already computed), "Propose Snips" disabled (gray, already computed), "Reset" enabled, silence threshold -40dB (slider at default)
- Volume histogram: 15 bars visible (chunks 0–14: bars at ~-55dB, ~-15dB, ~-55dB, ~-15dB, ~-55dB pattern), dashed line at -40dB, 2 vertical cyan lines (snip boundaries marking loud segments)
- Snip list: 2 rows visible (Snip 0: Chunks 3–6, 12.0s–24.5s, 12.5s duration; Snip 1: Chunks 9–12, 36.0s–48.3s, 12.3s duration)

**After state (threshold slider moved to -30dB, snips recomputed):**
- Snip list: Possibly 3 rows now (if some quieter chunks now count as loud), or 1 row (if some loud chunks now count as silence) — depends on fixture data
- Volume histogram: Dashed line moved up to -30dB, snip boundary lines moved

## What This Demo Does NOT Do

- Does not call session-store (fixture chunks are in-memory only)
- Does not transcribe snips (transcription-client does that)
- Does not play audio (playback-engine does that; this demo only computes volume + snips)
- Volume-analyzer's public interface expects session-store reads (`analyzeVolume(sessionId)` → reads chunks from store)
- This demo exercises the CORE LOGIC (volume computation, silence detection, snip proposal) without the storage integration
- Storage integration is proven in session-store's Isolation Demo or the final PWA

## Implementation Notes

(To be filled by Phase 06 implementation agent)

- Fixture audio generation: Generate MP3 blobs with known volume patterns (use Web Audio API OscillatorNode with varying gain: 0.01 = quiet, 0.5 = loud)
- Volume computation: Decode MP3 to PCM (Web Audio API `decodeAudioData`), compute peak dB (20 * log10(maxSample / 1.0))
- Silence detection: Compare peak dB to threshold; chunk is "silent" if peak < threshold
- Snip proposal: Group contiguous non-silent chunks; each group = one snip
- Live capture integration (optional mode): Include capture-engine (in-memory only), use its RAM chunks for volume analysis instead of fixture
