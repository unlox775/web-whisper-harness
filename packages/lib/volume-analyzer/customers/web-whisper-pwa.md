# Customer: apps/web-whisper-pwa

The Web Whisper PWA is the primary customer of volume-analyzer. The PWA calls volume-analyzer to compute volume profiles and propose snips after recording completes.

## Producer's Understanding of This Customer

Volume-analyzer understands that the PWA is the primary production customer representing the end user (Dave and anyone like him recording on a phone). The PWA orchestrates the full recording-to-transcript flow and needs volume-analyzer to intelligently segment long recordings into transcribable pieces.

### What the PWA Needs from Volume-Analyzer

**Core workflow integration:**
- **After recording completes**: PWA calls `analyzeVolume(sessionId)` automatically to compute volume profiles for the just-finished session. This happens in the background while the session card appears in the session list.
- **After volume analysis completes**: PWA calls `proposeSnips(sessionId)` to get snip boundaries based on silence detection. The snip list is used to decide what audio gets sent to transcription-client.
- **Transcription efficiency**: The PWA needs snips (not full-session audio or individual chunks) as the transcription unit. One snip = one Groq Whisper API call. Snips exclude silence, saving API cost and improving transcript quality.

**Developer mode features:**
- **Manual recomputation**: User may adjust silence threshold in developer mode (Settings → Developer Mode → Session Detail → "Re-snip with threshold...") and click "Re-snip" button. PWA calls `recomputeSnipsWithThreshold(sessionId, newThreshold)` to regenerate snip boundaries without recomputing volume profile (faster).
- **Snip count display**: Session detail (developer mode) shows "Snips: 4" (count from snip list) so user can see how the session was segmented.
- **Volume histogram** (future Phase 07 work): Developer mode may display volume histogram with snip boundaries overlaid (read volume profile + snips from session-store, render histogram, volume-analyzer provides profile data but PWA owns histogram rendering).

**Edge case handling expectations:**
- **All-quiet session** (no loud audio detected): `proposeSnips` returns `{success: true, snips: []}`. PWA should NOT treat this as an error. Display "Recording complete, no speech detected (transcription skipped)" instead of "Transcription failed." Playback still works (user can hear the quiet recording).
- **All-loud session** (no silence gaps): `proposeSnips` returns 1 snip covering entire session (0s to session duration). PWA transcribes the whole session as one snip (acceptable, not an error).
- **Very short session** (< 5s, shorter than min snip duration): `proposeSnips` returns 1 snip covering entire session. PWA transcribes normally.
- **Volume analysis fails** (session not found, chunks missing, decode error): `analyzeVolume` returns `{success: false, error: "..."}`. PWA should log error, display user-facing message ("Unable to analyze volume, session may be incomplete"), and allow playback (do not block playback on volume analysis failure). Transcription may be skipped or attempted on full session (PWA decides fallback strategy).

**Non-requirements (PWA does NOT need):**
- Volume-analyzer does NOT generate waveform UI components (PWA owns histogram rendering if needed)
- Volume-analyzer does NOT decide whether to transcribe (PWA decides based on Groq key presence + snip list availability)
- Volume-analyzer does NOT call transcription-client or playback-engine (PWA orchestrates those calls)
- Volume-analyzer does NOT persist directly to IndexedDB (all persistence goes through session-store package)

### How the PWA Uses Snip List

**Transcription flow (when Groq key present):**
1. PWA receives snip list from `proposeSnips`: `[{snipId, startTime, endTime, chunkRefs: [chunkIds], ...}, ...]`
2. For each snip, PWA reads referenced chunk MP3 blobs from session-store
3. PWA concatenates chunk blobs for snip time range (or extracts time-sliced audio from chunks)
4. PWA calls `transcriptionClient.transcribeAudio(snipBlob, apiKey)` per snip
5. PWA writes transcript text to session-store (attached to snip ID)
6. PWA displays transcript text in session detail (per-snip or rolled-up full session transcript)

**Playback flow (developer mode, per-snip playback):**
1. User opens session detail → developer mode shows snip list (Snip 0, Snip 1, ...)
2. User clicks "Play Snip 0" → PWA reads snip time range from snip list
3. PWA calls `playbackEngine.playSnip(sessionId, snipId)` (playback-engine reads chunks, plays time-sliced audio)
4. Snip playback lets user hear what will be transcribed (or what was transcribed), useful for debugging bad snip boundaries

**Assumptions about session-store integration:**
- Volume-analyzer reads chunks from session-store using `getChunksForSession(sessionId)` (assumes session-store provides this interface)
- Volume-analyzer writes volume profile to session-store using `saveVolumeProfile(sessionId, profile)` (assumes session-store accepts this write)
- Volume-analyzer writes snips to session-store using `saveSnips(sessionId, snips)` (assumes session-store accepts this write)
- PWA reads snips from session-store after `proposeSnips` completes (assumes session-store provides `getSnips(sessionId)`)

**Timing and async behavior:**
- `analyzeVolume(sessionId)` may take 1–5 seconds for a 60s session (MP3 decode + volume computation per chunk). PWA should call this async and show "Analyzing volume..." status if needed (not blocking, can happen in background).
- `proposeSnips(sessionId)` is fast (< 100ms, reads existing volume profile, runs snip algorithm, writes snips). PWA can call this synchronously after `analyzeVolume` completes.
- `recomputeSnipsWithThreshold(sessionId, threshold)` is very fast (< 50ms, reuses volume profile, only re-runs snip algorithm). PWA can call this in response to threshold slider changes (debounce if slider is continuous).

**Error handling contract:**
- If `analyzeVolume` fails, PWA should NOT call `proposeSnips` (volume profile required for snip proposal). Fall back to: transcribe full session (no snips), or skip transcription and allow playback only.
- If `proposeSnips` fails with "Volume profile missing," PWA should call `analyzeVolume` first, then retry `proposeSnips`.
- If `proposeSnips` succeeds with empty snip list (all-quiet), PWA should NOT retry or treat as error. Display "No speech detected" and skip transcription.

**Developer mode vs normal mode:**
- **Normal mode (default)**: PWA calls `analyzeVolume` + `proposeSnips` automatically after recording stops. User sees session card with duration, transcript text (when Groq key present), and playback affordance. Snips are invisible (used internally for transcription).
- **Developer mode (Settings → Developer mode ON)**: PWA exposes volume/snip details in session detail. User can see snip count, adjust threshold, click "Re-snip," play individual snips, view volume histogram (future). Volume-analyzer provides data; PWA owns UI rendering and controls.

## Customer Request

(To be filled by Phase 04 customer-request agent for web-whisper-pwa → volume-analyzer)

The PWA customer will write its request here: exact interfaces it needs (`analyzeVolume`, `proposeSnips`), session-store integration expectations (does PWA call analyzeVolume first, or does proposeSnips call it automatically if missing?), error handling expectations, edge case handling.

## Producer Response

(To be filled by Phase 05 producer-response agent for volume-analyzer)

Volume-analyzer will respond here: how it will meet the PWA's request, what interfaces it will provide, what session-store calls it will make, how it will handle edge cases, and what snip proposal format it will return.
