# Phase 07: Live Recording Overlay Implementation

**Package**: apps/web-whisper-pwa  
**Spec**: apps/web-whisper-pwa/docs/specs/20260827045000-feedback-live-recording-overlay.md  
**Status**: unresolved  
**Depends on**: playback-engine volume control (spec 20260827044500) should be merged first

## Task Summary

Add live transcription overlay to recording screen + update home screen layout based on iPhone shots 07-08. Keep Phase 6 full-screen red recording, add bottom overlay showing real-time transcript.

## Critical Design Requirements

**Read this first:**
1. **KEEP Phase 6 full-screen recording** - Dave liked it, do NOT go back to home-with-list during recording
2. **ADD live transcription overlay** - Bottom overlay on full-screen recording screen
3. **Simple implementation** - Transcribe per-chunk (no incremental snip detection needed for Phase 07.1)
4. **Home layout** - CAPTURE card at top, session list below with READY/PART TX badges

## What to Change

### 1. Recording Screen - Add Live Transcription Overlay

**Keep from Phase 6:**
- Full-screen dark background
- Pulsing red recording indicator
- Large duration counter
- Big red "Stop recording" button

**Add: Bottom Live Transcription Overlay**

**UI Components:**
- Fixed position bottom overlay (dark card, teal accent)
- Section heading: "Live transcription"
- Pending state (first ~30s): Italic gray "Pending - first words arrive in about 30 seconds."
- Active state: Scrollable transcript box (max-height ~200px, auto-scroll to bottom)
- Accumulating transcript text (new text at bottom, like chat)
- RETRY TX button (if any chunk fails)

**Implementation (Simple Approach - Transcribe Per-Chunk):**

```typescript
// In RecordingScreen or orchestration.ts
handle.on('chunkEncoded', async (event: ChunkEncodedEvent) => {
  const { sessionId, chunkId } = event;
  
  // Skip if no Groq key
  if (!apiKey) return;
  
  // Get chunk blob from session-store
  const chunk = await sessionStore.getChunk(chunkId);
  if (!chunk?.blob) return;
  
  // Transcribe chunk directly (no snip detection)
  try {
    const result = await transcriptionClient.transcribeAudio(chunk.blob, apiKey);
    
    // Append to live transcript (component state)
    setLiveTranscript(prev => prev + ' ' + result.text);
    
    // Hide pending message after first success
    setShowPending(false);
    
  } catch (err) {
    // Track failed chunk for RETRY
    setFailedChunks(prev => [...prev, chunkId]);
    console.error('Live transcription failed for chunk:', chunkId, err);
  }
});
```

**Overlay Behavior:**
- Show pending message for first ~30 seconds OR until first transcription completes
- Auto-scroll to bottom when new text arrives
- RETRY TX button: retries all failed chunks, appends results to transcript

**Note:** This transcribes per-chunk (not per-snip). Less efficient (more Groq API calls) but works with current APIs. If costs become an issue, defer incremental snip detection to later iteration.

### 2. Home Screen Layout Changes

**From:** Current Phase 6 layout (may have capture card at bottom)

**To:**
- **CAPTURE card at TOP**
  - Big gradient "Start recording" button
  - Status line below button
- **Session list BELOW capture card**
  - Newest sessions at top

**Session Card Additions:**

Add to each session card:
1. **Status badge** (left, before duration):
   - READY (green pill) - Fully transcribed
   - PART TX (orange pill) - Partially transcribed
   - Logic: Check `session.hasTranscript` and compare snip count vs transcript count
   
2. **Transcript snippet** (below timestamp/size):
   - First ~100 characters of concatenated transcript
   - 2 lines max, truncated with "..."
   - Gray text, smaller font (~13px)
   
3. **RETRY TX button** (inline, right-aligned, ONLY on PART TX cards):
   - Same styling as session detail RETRY TX
   - Taps → triggers transcription for failed snips
   - Updates badge to READY when complete

**Badge Computation:**
```typescript
function computeSessionBadge(session: SessionRecord, transcripts: TranscriptRecord[]): 'ready' | 'part-tx' | null {
  if (!session.hasSnips) return null; // No snips yet
  
  const snipCount = session.snipCount || 0;
  const transcriptCount = transcripts.length;
  
  if (transcriptCount === 0) return null; // Not transcribed
  if (transcriptCount < snipCount) return 'part-tx'; // Partially transcribed
  return 'ready'; // Fully transcribed
}
```

## What NOT to Change

- Do NOT remove Phase 6 full-screen recording (keep it)
- Do NOT show session list during recording (shots 07-08 show old design, ignore that)
- Do NOT add incremental snip detection to volume-analyzer (defer to later if needed)
- Do NOT add histogram/doctor/ladybug to PWA (Isolation Demo visual refs only)
- Do NOT commit node_modules, dist, or lockfiles

## Implementation Order

1. Update home screen layout:
   - Move capture card to top (if not already)
   - Add READY/PART TX badges to session cards
   - Add transcript snippet to cards
   - Add RETRY TX button to PART TX cards
2. Add live transcription overlay to recording screen:
   - Bottom overlay UI (heading, pending message, transcript box, RETRY TX)
   - Listen to `chunkEncoded` events
   - Transcribe chunks in real-time
   - Append to overlay transcript
3. Test on iPhone Safari PWA (screenshot proof)
4. Run `make build` to rebuild docs/
5. Update spec with Resolution section and screenshot proof

## Stop Conditions

Mark spec resolved when:
1. Recording screen has live transcription overlay (bottom)
2. Overlay shows pending message, then accumulating transcript in real-time
3. RETRY TX button on overlay works
4. Home screen: CAPTURE card at top, session list below
5. Session cards have READY/PART TX badges
6. Session cards show transcript snippet
7. PART TX cards have RETRY TX button
8. iPhone screenshot proof provided
9. `make build` completed, docs/ folder updated
10. Spec updated with Resolution section

## Implementation Prompt

```
Implement live recording overlay per feedback spec 20260827045000-feedback-live-recording-overlay.md.

Prerequisites:
- Read iPhone screenshots in /workspace/uploads/existing-app/full/shot-07-record.png, shot-08-record.png

CRITICAL - Read Before Starting:
1. KEEP Phase 6 full-screen recording (do NOT show session list during recording)
2. ADD bottom live transcription overlay to full-screen recording screen
3. Use simple approach: transcribe per-chunk (no incremental snip detection)
4. Home layout: CAPTURE card at top, session list below with badges

Requirements:

1. Recording screen - Add live transcription overlay (bottom):
   - Fixed position overlay (dark card, teal accent)
   - Heading: "Live transcription"
   - Pending state: Italic "Pending - first words arrive in about 30 seconds."
   - Active state: Scrollable transcript box, accumulating text, auto-scroll
   - RETRY TX button (if chunks fail)
   
2. Listen to chunkEncoded events and transcribe per-chunk:
   - handle.on('chunkEncoded', callback)
   - Get chunk blob from session-store
   - Call transcriptionClient.transcribeAudio(blob, apiKey)
   - Append result to overlay transcript
   - Track failed chunks for RETRY
   
3. Home screen layout:
   - CAPTURE card at TOP (move if needed)
   - Session list BELOW capture card
   - Add READY/PART TX badges to session cards (left of duration)
   - Add transcript snippet to cards (2 lines, ~100 chars, truncated)
   - Add RETRY TX button to PART TX cards (inline, right-aligned)

4. Badge logic:
   - READY (green): Fully transcribed (transcript count == snip count)
   - PART TX (orange): Partially transcribed (transcript count < snip count)
   - Compute from session.hasSnips, session.snipCount, transcripts.length

5. Test on iPhone Safari PWA (screenshot proof)
6. Run `make build` to rebuild docs/
7. Update spec with Resolution section and screenshot proof

Do NOT:
- Remove Phase 6 full-screen recording
- Show session list during recording (shots 07-08 show old design, ignore)
- Add incremental snip detection (defer to later)
- Add histogram/doctor/ladybug to PWA (Isolation Demo refs only)
- Commit node_modules, dist, or lockfiles

Stop when spec is resolved with Resolution section and iPhone screenshot proof.
```
