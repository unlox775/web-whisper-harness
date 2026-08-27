Spec Status: unresolved
Spec Type: feedback
Created: 2026-08-27T04:50:00Z
Product: apps/web-whisper-pwa

# Live Recording Overlay Feedback Spec

## User Feedback

From iPhone screenshots shot-07 and shot-08 (https://unlox775.github.io existing app):

### shot-07: Recording at 1:55 Elapsed
- Home screen visible (unusual - shows list during recording)
- CAPTURE card at TOP: big red "Stop recording", "Recording — 1:55 elapsed"
- Metadata line: "Audio: 115.4s / 27 seg  Data: 901.3 KB"
- Session list below with status badges:
  - READY badge (green) - 0:56, Jun 27 at 9:31 AM, 440 KB, transcript snippet
  - PART TX badge (orange) - 17:11, Jun 24 at 9:00 AM, 8 MB, with RETRY TX button
- **Floating "Live transcription" overlay** over session list
  - Accumulating transcript text (real-time transcription DURING capture)
  - RETRY TX button
  - Shows snip text as it's transcribed

### shot-08: Recording at 0:09 Elapsed
- Same home layout, earlier in recording
- Bottom overlay visible: "Live transcription"
- Italic pending message: "Pending - first words arrive in about 30 seconds."
- Session cards: READY 0:56 Jun 27, PART TX 17:11 with RETRY TX

## Dave's Intent (Design Refinements)

**Recording Screen:**
- KEEP Phase 6 full-screen red recording takeover (Dave liked it)
- Do NOT stay on home with session list visible during recording (shot-07/08 show old design)
- ADD bottom live-transcription overlay onto Phase 6 full-screen recording screen

**Home Screen (When NOT Recording):**
- Capture card at TOP (not bottom)
- Session list below capture card
- Session cards show: READY/PART TX badge, duration, date, size, snippet, RETRY TX on PART TX

**Live Transcription Overlay (During Recording):**
- Bottom overlay on full-screen recording screen
- Title: "Live transcription"
- Pending state: Italic "Pending - first words arrive in about 30 seconds."
- Active state: Accumulating snip text as transcribed
- RETRY TX button (for failed snips)

## Current Harness Gaps (Verified on main)

1. **Recording Screen:**
   - Phase 6 has full-screen red recording with duration counter, stop button
   - Missing live transcription overlay (no real-time transcription during capture)

2. **Home Screen Layout:**
   - Phase 6 may have capture card at bottom (Dave thought sessions were above record button)
   - Need to verify and possibly move capture card to top

3. **Session Card Status Badges:**
   - Harness session cards do NOT show READY/PART TX badges
   - No snippet preview in card
   - RETRY TX exists in session detail but not on home cards

4. **Live Transcription During Capture:**
   - Current flow: capture → stop → analyze volume → propose snips → transcribe
   - No incremental transcription DURING capture
   - **This may require package-level changes** (see Producer Contract Analysis below)

## Producer Contract Analysis

**Current APIs:**
- `capture-engine.startCapture()` returns handle with `on('chunkEncoded', callback)` events
- `volume-analyzer.analyzeVolumeForSession(sessionId)` - analyzes FULL session (post-capture)
- `volume-analyzer.proposeSnipsForSession(sessionId)` - proposes snips from FULL volume profile
- `transcription-client.transcribeAudio(audioBlob, apiKey)` - transcribes single audio blob

**Live Transcription Requirements:**
1. Listen to `chunkEncoded` events during capture
2. Analyze volume for each chunk as it arrives (incremental, not full-session)
3. Detect speech boundaries incrementally (rolling snip detection)
4. Transcribe new snips as they're detected
5. Display accumulating transcript in overlay

**Gap Assessment:**

**Can we do it with current APIs?**
- ✅ Listen to `chunkEncoded`: Already supported (capture-engine emits events)
- ⚠️ Incremental volume analysis: `analyzeChunksVolume(chunks)` can analyze single chunks, but `analyzeVolumeForSession` expects full session
- ❌ Incremental snip detection: `proposeSnipsFromProfile` expects full volume profile, NOT rolling detection
- ✅ Transcribe single snip: `transcribeAudio(blob)` works on individual blobs

**Decision:**

**Option A: Simple Live Transcription (PWA-only, current APIs)**
- Listen to `chunkEncoded` events
- Transcribe each chunk directly (no snip detection)
- Less efficient (Groq API calls per chunk, not per snip)
- Works with current APIs (no package changes)
- Good enough for Phase 07.1

**Option B: Proper Live Snip Detection (Requires volume-analyzer changes)**
- Add `analyzeChunkVolume(chunkBlob)` - analyze single chunk
- Add `detectSnipBoundariesIncremental(chunkProfiles, lastSnipEnd)` - rolling snip detection
- More efficient (fewer API calls, better snip boundaries)
- Requires volume-analyzer feedback spec (new producer contract)

**Recommended Approach:** Start with Option A (PWA-only), defer Option B to later iteration if Groq costs become an issue.

## Requested Outcome

### Recording Screen (Full-Screen Red Takeover)

**Keep from Phase 6:**
- Full-screen dark background
- Pulsing red recording indicator
- Large duration counter (MM:SS format)
- Big red "Stop recording" button

**Add: Live Transcription Overlay (Bottom)**
- Fixed position bottom overlay (above stop button or below duration)
- Dark card background with teal accent
- Section heading: "Live transcription" (white, ~16px, bold)
- **Pending state** (first ~30 seconds):
  - Italic gray text: "Pending - first words arrive in about 30 seconds."
- **Active state** (after first transcription):
  - Scrollable transcript box (max-height ~200px, auto-scroll to bottom)
  - Accumulating snip text as transcribed
  - New text appears at bottom (like chat messages)
- **RETRY TX button** (if any snip fails):
  - Same as session detail RETRY TX
  - Retries failed snips

**Implementation Approach (Option A - Simple Live Transcription):**

1. Listen to `capture-engine` `chunkEncoded` events:
   ```typescript
   handle.on('chunkEncoded', async (event) => {
     const { sessionId, chunkId, duration } = event;
     // Get chunk blob from session-store
     const chunk = await sessionStore.getChunk(chunkId);
     // Transcribe chunk directly (no snip detection)
     try {
       const result = await transcriptionClient.transcribeAudio(chunk.blob, apiKey);
       // Append text to overlay transcript
       setLiveTranscript(prev => prev + ' ' + result.text);
     } catch (err) {
       // Mark as failed, show RETRY TX button
       setFailedChunks(prev => [...prev, chunkId]);
     }
   });
   ```

2. Show pending message for first ~30 seconds (wait for first transcription to complete)

3. Auto-scroll overlay to bottom as new text arrives

4. RETRY TX button retries all failed chunks (re-transcribe and append)

**Note:** This transcribes per-chunk (not per-snip), which is less efficient but works with current APIs. If Groq costs become an issue, write volume-analyzer incremental snip detection spec later.

### Home Screen Layout (When NOT Recording)

**From:** Current Phase 6 layout (verify capture card position)

**To:**
- **CAPTURE card at TOP** (confirmed by shots, Dave's preference)
  - Big gradient "Start recording" button
  - Status line below button
- **Session list below CAPTURE card**
  - Newest sessions at top
  - Each card shows:
    - **Status badge** (left): READY (green) or PART TX (orange)
    - Duration (bold): "17:11"
    - Timestamp: "Jun 24 at 9:00 AM"
    - Size: "8 MB"
    - **Transcript snippet** (2 lines, truncated): First ~100 chars of transcript
    - **RETRY TX button** (inline, right-aligned, ONLY on PART TX cards)

**Status Badge Logic:**
- READY (green): Session fully transcribed (all snips have transcripts)
- PART TX (orange): Session partially transcribed (some snips missing transcripts or failed)
- Compute badge from session-store: `getSession(sessionId)` → check `hasTranscript` flag and snip/transcript counts

**RETRY TX on Home Cards:**
- Visible ONLY on PART TX cards
- Taps RETRY TX → Trigger transcription for failed snips (same as session detail RETRY TX)
- Update card badge to READY when complete

## Notes for Phase 07 Implementation

### Scope
- Recording screen: Add live transcription overlay (bottom)
- Home screen: Verify/move capture card to top, add status badges + snippet + RETRY TX to session cards

### Dependencies
- **Existing:** capture-engine emits `chunkEncoded` events (already works)
- **Existing:** transcription-client `transcribeAudio(blob)` works on individual blobs
- **Existing:** session-store has all session/chunk/snip/transcript data

### Implementation Order
1. Implement home screen layout changes (capture card top, status badges, snippets, RETRY TX)
2. Implement live transcription overlay on recording screen (listen to chunkEncoded, transcribe chunks)
3. Test on iPhone Safari PWA (screenshot proof required)
4. Run `make build` to rebuild docs/ folder for GitHub Pages
5. Mark spec resolved with screenshot proof

### Out of Scope (Deferred)
- **Incremental snip detection** (volume-analyzer changes) - Not required for Phase 07.1
  - If Groq costs become an issue, write separate volume-analyzer feedback spec
  - For now: transcribe per-chunk (works with current APIs)
- **Home layout: record button position** - Confirmed: top (capture card) + session list below
- Do NOT add histogram/doctor/ladybug to PWA (Isolation Demo visual refs only)

## Resolution Criteria

Mark this spec resolved when:
- [ ] Recording screen has live transcription overlay (bottom)
- [ ] Overlay shows pending message (~30s), then accumulating transcript
- [ ] Overlay updates in real-time as chunks are transcribed
- [ ] RETRY TX button on overlay retries failed chunks
- [ ] Home screen has CAPTURE card at top, session list below
- [ ] Session cards show READY/PART TX badges
- [ ] Session cards show transcript snippet (2 lines, truncated)
- [ ] PART TX cards have RETRY TX button (inline, right-aligned)
- [ ] iPhone screenshot proof provided (before/after comparison)
- [ ] `make build` completed, docs/ folder updated
- [ ] Spec updated with Resolution section documenting what shipped
