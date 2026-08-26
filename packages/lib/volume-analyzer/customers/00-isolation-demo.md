# Customer: Isolation Demo (Standing Human Customer)

The Isolation Demo is a standing founder/developer customer that operates volume-analyzer by itself, without the production PWA.

## Producer's Understanding of This Customer

Volume-analyzer understands that the Isolation Demo is a human founder/developer operating the package independently to prove it works before PWA integration. This is the package factory floor: a separately launchable UI for testing every volume-analyzer capability without requiring session-store, capture-engine, or the production app.

### What the Isolation Demo Customer Needs

**Primary operating job:** Prove that volume-analyzer's core algorithms work correctly by feeding inputs, seeing outputs, and verifying behavior against known-good fixture data.

**Specific capabilities the demo must prove:**

1. **Volume computation works**:
   - Demo provides fixture MP3 chunks with known volume patterns (quiet, loud, quiet-loud-quiet)
   - Operator clicks "Compute Volume" → demo calls volume-analyzer's volume computation logic
   - Histogram displays bars (one bar per chunk, Y-axis = peak dB, -60dB to 0dB scale)
   - Operator verifies: quiet fixture shows bars near -55dB, loud fixture shows bars near -15dB (visual proof that dB computation matches expected values)

2. **Silence detection works**:
   - Histogram displays horizontal dashed line at current silence threshold (default -40dB)
   - Operator adjusts threshold slider (-60dB to -20dB range) → dashed line moves up/down on histogram
   - Samples below threshold count as "quiet," samples above count as "loud"
   - Operator can visually verify: if threshold set to -30dB, more chunks count as quiet (stricter); if -50dB, fewer chunks count as quiet (looser)

3. **Snip proposal works**:
   - After volume computed, operator clicks "Propose Snips" → demo calls snip proposal algorithm
   - Histogram displays vertical cyan lines (snip boundaries) overlaid on volume bars
   - Snip list panel displays proposed snips (Snip ID, Chunks, Time Range, Duration)
   - Operator verifies: snip boundaries appear at silence gaps, leading/trailing silence excluded, edge cases handled correctly

4. **Edge cases handled correctly**:
   - **All-Quiet fixture**: Operator selects "All Quiet" fixture → compute → propose → snip list empty with message "No speech detected (all-quiet session)" (proves zero-snip case)
   - **All-Loud fixture**: Operator selects "All Loud" → compute → propose → snip list shows 1 snip covering entire duration (proves single-snip case)
   - **Short Speech fixture**: Operator selects "Short Speech" (3s, < min snip duration 5s) → compute → propose → snip list shows 1 snip covering 3s (proves short-snip handling, no rejection)
   - **Quiet-Loud-Quiet fixture**: Operator selects "Quiet → Loud → Quiet" → compute → propose → snip list shows 1 snip (excludes leading 3s quiet + trailing 3s quiet, includes only middle 9s loud region)

5. **Threshold tuning works (real-time updates)**:
   - Operator computes volume → proposes snips (default -40dB) → sees 1 snip (e.g., 3s–12s)
   - Operator moves threshold slider to -25dB (stricter) → snip boundaries auto-update → snip range shrinks (e.g., 4s–11s, or splits into 2 snips if internal quiet regions now detected)
   - Operator moves threshold slider to -50dB (looser) → snip boundaries auto-update → snip range expands (e.g., 2s–13s, or merges adjacent snips)
   - Visual proof that algorithm is tunable, not hard-coded, and threshold impacts snip boundaries in predictable ways

6. **Optional: Live capture integration (proves capture → volume analysis flow)**:
   - Operator toggles "Enable Live Capture" ON → demo includes capture-engine (in-memory mode, does not persist to session-store)
   - "Start Capture" / "Stop Capture" buttons appear
   - Operator clicks "Start Capture" → speaks into mic for 10s → clicks "Stop Capture"
   - Captured chunks live in RAM (array of MP3 blobs, not written to session-store)
   - Operator clicks "Compute Volume" → volume-analyzer processes in-memory chunks → histogram displays volume profile from live audio
   - Operator clicks "Propose Snips" → snip boundaries proposed from live audio
   - Proves: volume-analyzer works with real audio from capture-engine, not just fixtures (but does not prove session-store integration; that's proven by PWA or session-store's own Isolation Demo)

**Data mode requirements:**

- **Safe default: Fixture audio** (no mic permission, no capture-engine dependency, no session-store reads/writes). Operator can launch demo, see results immediately, verify algorithms work without any external dependencies.
- **Fixture chunks**: 5 pre-generated MP3 blobs with known patterns (quiet-loud-quiet, all-quiet, all-loud, loud-quiet-loud, short-speech). Embedded in demo bundle or generated on load using Web Audio API (OscillatorNode with varying gain: 0.01 gain = quiet, 0.5 gain = loud, encoded to MP3 in-browser).
- **Optional mode: Live from Capture (in-memory only)**. When toggle ON, fixture dropdown hidden, capture controls visible. Captured chunks discarded when page reloads or toggle OFF. Does not persist to session-store (intentionally isolated from storage layer).

**Non-requirements (Isolation Demo does NOT need):**

- **No session-store integration**: Demo uses in-memory mock store (fixture chunks or live-captured chunks stored in RAM, not IndexedDB). Real session-store integration is proven by PWA, not Isolation Demo.
- **No transcription**: Demo does not call transcription-client or display transcript text (transcription is transcription-client's job, not volume-analyzer's job). Demo only proves volume computation + snip proposal.
- **No playback**: Demo does not play audio chunks or snips (playback is playback-engine's job). Demo may optionally include audio waveform visualization, but playback controls not required.
- **No PWA UI chrome**: Demo is factory floor, not phone-shaped. Desktop browser viewport (1280px+ width), panel-based layout, not mobile-first design.

**UI expectations (panel-based layout, matches `isolation-demo/README.md`):**

The demo has 4 main panels (see `isolation-demo/README.md` for full spec):

1. **Top Chrome Panel** (fixed header, full width):
   - Heading: "Volume Analyzer Isolation Demo"
   - Data mode chip: "FIXTURE AUDIO" (default, gray border) or "LIVE FROM CAPTURE (in-memory)" (cyan border when toggle ON)
   - "Enable Live Capture" toggle (checkbox or switch)

2. **Control Panel** (left quarter):
   - "Compute Volume" button (cyan, enabled when chunks available)
   - "Propose Snips" button (cyan, enabled after volume profile computed)
   - "Reset" button (gray, always enabled, clears volume + snips + returns to initial state)
   - Silence threshold slider: "-60dB ← → -20dB" (default -40dB, updates dashed line in histogram when moved)
   - Fixture pattern dropdown (only visible when toggle OFF): "Quiet → Loud → Quiet" (default), "All Quiet", "All Loud", "Loud → Quiet → Loud", "Short Speech"

3. **Volume Histogram Panel** (center half):
   - Heading: "Volume Profile (Peak dB per Chunk)"
   - Horizontal bar chart: X-axis = chunk index (0, 1, 2, ...), Y-axis = peak dB (-60dB to 0dB)
   - Bars: Quiet chunks = red bars near bottom (-50dB to -60dB), Loud chunks = green bars near top (-10dB to -20dB)
   - Threshold line: Horizontal dashed line at current threshold (e.g., -40dB), moves when slider adjusted
   - Snip boundaries: Vertical cyan lines (mark start/end of each proposed snip), appear after "Propose Snips" clicked

4. **Snip List Panel** (right quarter, scrollable):
   - Heading: "Proposed Snips"
   - Table: Columns = Snip ID (0, 1, 2, ...), Chunks (e.g., "0–3", "5–7"), Time Range (e.g., "0.0s – 12.5s"), Duration (e.g., "12.5s")
   - Updates when "Propose Snips" clicked or threshold slider moved (real-time recomputation)

**Walkthrough steps (operator should be able to complete these):**

1. Launch demo (`cd packages/lib/volume-analyzer/isolation-demo && npm start`) → page loads with default fixture "Quiet → Loud → Quiet" selected
2. Click "Compute Volume" → histogram populates with 3 bars (quiet bar ~-55dB, loud bar ~-15dB, quiet bar ~-55dB, threshold line at -40dB)
3. Click "Propose Snips" → snip list shows 1 snip (excludes leading/trailing silence, includes only middle loud region ~3s–12s)
4. Move threshold slider to -25dB → threshold line moves up, snip boundaries auto-update (snip range shrinks or splits)
5. Select fixture "All Quiet" → click "Compute Volume" → histogram shows all bars near bottom → click "Propose Snips" → snip list empty with message "No speech detected"
6. Select fixture "All Loud" → compute → propose → snip list shows 1 snip covering entire session (0s–10s)
7. Toggle "Enable Live Capture" ON → click "Start Capture" → speak into mic → click "Stop Capture" → compute → propose → see snips from live audio
8. Click "Reset" → histogram clears, snip list clears, buttons re-enable, returns to initial state

**Walkthrough value (what founder/developer learns):**

- Volume computation produces correct dB values (histogram bars match expected quiet/loud patterns)
- Silence detection threshold impacts snip boundaries predictably (stricter threshold → narrower snips, looser threshold → wider snips)
- Snip proposal handles edge cases correctly (all-quiet → zero snips, all-loud → one snip, quiet-loud-quiet → one snip excluding silence)
- Algorithm is tunable (threshold slider causes real-time snip boundary updates, proves algorithm is not hard-coded)
- Package works with fixture audio (no external dependencies) and optionally with live capture (proves capture → volume analysis flow)

**Developer trust building:** Before PWA integration, founder can operate volume-analyzer directly, feed known-good fixtures, verify outputs match expectations, and trust that volume computation + snip proposal algorithms work correctly. If PWA later has bugs, founder can check Isolation Demo first to isolate whether issue is in volume-analyzer (factory floor shows problem) or PWA integration (factory floor works, PWA integration broken).

## Customer Request

(To be filled by Phase 04 customer-request agent for isolation-demo → volume-analyzer)

The isolation-demo customer will write its request here: what interfaces it needs from volume-analyzer, what inputs it will provide (fixture chunks or live capture chunks), what outputs it expects (volume profile, snip list), and what validation it needs to see to trust the package.

## Producer Response

(To be filled by Phase 05 producer-response agent for volume-analyzer)

Volume-analyzer will respond here: how it will meet the isolation-demo's request, what interfaces it will expose for demo use, what data modes it supports (fixture by default, optionally live-from-capture in-memory), and how the demo proves the package works independently.
