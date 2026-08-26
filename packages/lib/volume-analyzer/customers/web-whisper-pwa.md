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

I'm the Web Whisper PWA. I need volume-analyzer to turn long recordings into intelligent transcription segments. Here's what I need:

### Core Workflow

**After recording completes:**
1. User taps "Stop" → capture-engine returns completion summary
2. I navigate to session detail (or update session card on Home)
3. I immediately call `analyzeVolume(sessionId)` in background (non-blocking)
4. While volume analysis runs, user can play the session (playback doesn't need volume profiles)
5. After `analyzeVolume` succeeds, I call `proposeSnips(sessionId)`
6. Snips are now available for transcription (if Groq key present) or developer mode inspection

**If transcription enabled:**
7. For each snip from `proposeSnips`, I read chunk blobs from session-store
8. I concatenate chunks for snip time range into snip audio blob
9. I call `transcription-client.transcribeAudio(snipBlob, apiKey)` per snip
10. I write transcript text to session-store per snip

### Interfaces I Need

**`analyzeVolume(sessionId)`**

When I call it: Automatically after recording completes, or when user clicks "Recompute Volume" in developer mode.

Input:
- `sessionId` (string): Valid session ID with chunks already written by capture-engine

Output I expect:
- `{success: true, profileSummary: {chunkCount: number, avgVolume: number, maxVolume: number, sampleCount: number}}`
- OR `{success: false, error: string}` (NOT thrown exception)

Error codes I need to handle:
- `"session_not_found"` → I log error and show toast "Session not found"
- `"no_chunks_for_session"` → I log error and show toast "No audio chunks found" (shouldn't happen if capture-engine completed successfully)
- `"chunk_decode_failed"` → I log error and show toast "Unable to analyze volume: audio decode error"
- `"session_store_write_failed"` → I log error and show toast "Volume analysis failed: storage error"

How I use it:
- If `success === true`: Volume profile is now written to session-store. I can call `proposeSnips` next.
- If `success === false`: I log error, skip snip proposal, fall back to transcribe full session (no snips) OR skip transcription and allow playback only.

**Does `proposeSnips` call `analyzeVolume` automatically if volume profile missing?**

**My preference: NO.** I want explicit control over the workflow. If `proposeSnips` is called before volume profile exists, return `{success: false, error: "volume_profile_missing"}` and I will call `analyzeVolume` first, then retry.

This makes the sequence explicit:
1. `analyzeVolume(sessionId)` → writes volume profile to session-store
2. `proposeSnips(sessionId)` → reads volume profile from session-store → writes snips

If volume-analyzer prefers to auto-call `analyzeVolume` when missing, that's acceptable but not required. Either way, I need clear success/failure return values.

**`proposeSnips(sessionId, options?)`**

When I call it: After `analyzeVolume` succeeds, or when user adjusts threshold in developer mode and clicks "Re-snip".

Input:
- `sessionId` (string): Valid session ID with volume profile already computed
- `options` (optional): `{quietThreshold?: number, minSnipDuration?: number, maxSnipDuration?: number}`
  - Default threshold -40dB is fine
  - In developer mode, user can adjust threshold slider (-60dB to -20dB) and I pass new value

Output I expect:
- `{success: true, snips: [{snipId, startTime, endTime, startChunkIndex, endChunkIndex, chunkRefs: [chunkIds], confidence}]}`
- OR `{success: false, error: string}`

Error codes I need to handle:
- `"session_not_found"` → I log error and show toast "Session not found"
- `"volume_profile_missing"` → I call `analyzeVolume(sessionId)` first, then retry `proposeSnips`
- `"session_store_write_failed"` → I log error and show toast "Snip proposal failed: storage error"

Edge cases I expect:
- **All-quiet session** (no loud samples): `{success: true, snips: []}` (empty array, NOT an error)
  - I display "No speech detected (transcription skipped)" in session detail
  - Playback still works (user can hear the quiet recording)
- **All-loud session** (no silence gaps): `{success: true, snips: [{snipId, startTime: 0, endTime: sessionDuration, ...}]}` (1 snip covering entire session)
  - I transcribe the whole session as one snip (acceptable)
- **Very short session** (< 5s): `{success: true, snips: [{snipId, startTime: 0, endTime: sessionDuration, ...}]}` (1 snip covering entire session)
  - I transcribe normally

How I use snips:
- For transcription: Read `chunkRefs` array, fetch chunk blobs from session-store via `getChunksForSession`, concatenate blobs for snip time range, send to transcription-client
- For developer mode display: Show snip list in session detail with "Play Snip" button per snip (call playback-engine)
- For transcript display: Roll up per-snip transcripts into full session transcript

**`recomputeSnipsWithThreshold(sessionId, quietThreshold)`**

When I call it: User adjusts threshold slider in developer mode and clicks "Re-snip".

Input:
- `sessionId` (string): Session with existing volume profile
- `quietThreshold` (number): New threshold value from slider (-60dB to -20dB range, or 10% to 50% relative)

Output: Same as `proposeSnips`: `{success: true, snips: [...]}` or `{success: false, error: string}`

How I use it: Same as `proposeSnips`. This is a fast re-run (reuses existing volume profile, only re-runs snip algorithm). I expect < 50ms latency so I can call it in response to threshold slider changes (with debounce if slider is continuous).

### Session-Store Integration Expectations

Volume-analyzer MUST:
- Read chunks from session-store via `getChunksForSession(sessionId)`
- Write volume profile to session-store via `saveVolumeProfile(sessionId, profile)`
- Write snips to session-store via `saveSnips(sessionId, snips)`

I do NOT call these session-store methods myself. Volume-analyzer owns all volume profile and snip writes.

Volume profile schema I expect in session-store (for developer mode histogram display):
- `{sessionId, chunkVolumes: [{chunkId, peakDb}], createdAt}`

Snip schema I expect:
- `{snipId, sessionId, startTime, endTime, startChunkIndex, endChunkIndex, chunkRefs: [chunkIds], confidence, createdAt}`

### Timing and Async Behavior

- `analyzeVolume` may take 1–5 seconds for a 60s session (MP3 decode + volume computation per chunk). I call this async and show "Analyzing volume..." status indicator if needed.
- `proposeSnips` should be fast (< 100ms, reads existing volume profile). I call this synchronously after `analyzeVolume` completes.
- `recomputeSnipsWithThreshold` should be very fast (< 50ms). I call this in response to threshold slider changes with debounce.

### Error Handling Strategy

**If `analyzeVolume` fails:**
- I do NOT call `proposeSnips` (volume profile required)
- Fall back options:
  1. Transcribe full session (no snips) if Groq key present
  2. Skip transcription, allow playback only
- Display user-facing message: "Unable to analyze volume. Playback is available, but transcription may not work optimally."

**If `proposeSnips` fails with "volume_profile_missing":**
- I call `analyzeVolume(sessionId)` first
- Then retry `proposeSnips(sessionId)`
- If retry fails, fall back to option 1 or 2 above

**If `proposeSnips` succeeds with empty snip list (all-quiet):**
- I do NOT retry or treat as error
- Display "No speech detected" in session detail
- Skip transcription (nothing to transcribe)
- Playback still works

### Developer Mode vs Normal Mode

**Normal mode (default):**
- I call `analyzeVolume` + `proposeSnips` automatically after recording stops
- User sees session card with duration, transcript text (when Groq key present), playback affordance
- Snips are invisible to user (used internally for transcription)

**Developer mode (Settings → Developer mode ON):**
- I expose volume/snip details in session detail:
  - Snip count: "Snips: 4"
  - Snip list: Table with snip ID, time range, duration, "Play Snip" button
  - Threshold slider: (-60dB to -20dB, default -40dB) with "Re-snip" button
  - Volume histogram (future Phase 07): Line graph with snip boundaries overlaid
- User can adjust threshold, click "Re-snip" → I call `recomputeSnipsWithThreshold`
- Snip boundaries update in real-time (histogram + snip list)

Volume-analyzer provides data; I own histogram rendering and developer mode UI controls.

### What I Do NOT Need

- I do NOT need volume-analyzer to generate waveform UI components (I own histogram rendering if needed)
- I do NOT need volume-analyzer to decide whether to transcribe (I decide based on Groq key + snip list)
- I do NOT need volume-analyzer to call transcription-client or playback-engine (I orchestrate those)
- I do NOT need volume-analyzer to read/write session-store directly in my code (volume-analyzer calls session-store internally)

### Summary of Interfaces

| Interface | Input | Output | Failure Result |
|-----------|-------|--------|----------------|
| `analyzeVolume(sessionId)` | sessionId (string) | `{success, profileSummary}` | `{success: false, error: string}` (NOT exception) |
| `proposeSnips(sessionId, options?)` | sessionId (string), options (optional) | `{success, snips: [...]}` | `{success: false, error: string}` |
| `recomputeSnipsWithThreshold(sessionId, threshold)` | sessionId (string), threshold (number) | `{success, snips: [...]}` | `{success: false, error: string}` |

All interfaces return structured results with `success` flag. NO thrown exceptions for normal failure cases (session not found, volume profile missing, etc.).

## Producer Response

(To be filled by Phase 05 producer-response agent for volume-analyzer)

Volume-analyzer will respond here: how it will meet the PWA's request, what interfaces it will provide, what session-store calls it will make, how it will handle edge cases, and what snip proposal format it will return.
