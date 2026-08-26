# Customer: apps/web-whisper-pwa

The Web Whisper PWA is the primary customer of transcription-client. The PWA calls transcription-client to validate Groq API keys (Settings screen) and transcribe snips (session detail screen).

## Producer's Understanding of This Customer

The Web Whisper PWA is the primary customer of transcription-client. The PWA orchestrates the full recording-to-transcript flow: it captures audio (via capture-engine), stores sessions and chunks (via session-store), proposes snips (via volume-analyzer), and plays back audio (via playback-engine). Transcription-client sits at the network boundary: it sends audio to Groq Whisper API and returns text.

### What the PWA needs from transcription-client

**1. API key validation in Settings screen**

The PWA Settings screen allows the user to enter a Groq API key. When the user clicks "Save" or "Validate", the PWA calls `validateKey(apiKey)` to test the key before enabling transcription. The PWA needs:

- **Synchronous or async validation**: `validateKey` must return `{valid: boolean, reason?: string}` (not throw exceptions)
- **Clear failure reasons**: If the key is invalid, the PWA needs a human-readable reason to display (e.g., "Invalid API key", "Network error", "Groq service unavailable")
- **Fast validation**: Validation should complete in 1–5 seconds for valid keys; the PWA will show a spinner while validating
- **No storage side effects**: Validation is read-only; it must not write to session-store or any other durable storage

The PWA displays the validation result as a status indicator in Settings:
- Valid key → green "Transcription Enabled ✓" badge
- Invalid key → red "Transcription Disabled ✗" badge with reason text below

**2. Snip transcription in session detail screen**

After a recording session completes, the PWA calls volume-analyzer to propose snips (speech segments based on silence detection). The user then clicks "Transcribe" in the session detail screen. The PWA loops over snips and calls `transcribeAudio(audioBlob, apiKey)` for each snip.

The PWA needs:

- **Per-snip transcription**: `transcribeAudio` must accept a single audio blob (snip audio assembled from chunks by the PWA) and return `{text: string, language?: string}` or `{error: string}`
- **Graceful error handling**: If one snip fails, the PWA continues with the next snip. `transcribeAudio` must not throw exceptions; it must return `{error: string}` for failures
- **Retry logic for transient errors**: Network failures and rate limits should be retried automatically (with exponential backoff). The PWA should not need to implement its own retry logic
- **Plaintext transcript**: The returned `text` must be plaintext (UTF-8, no markdown formatting, no HTML tags). The PWA displays it directly in the session detail UI and allows the user to copy it to the clipboard
- **Optional language detection**: If Groq returns a language code (e.g., "en", "es"), the PWA will display it as metadata; if not present, the PWA omits the language indicator

**3. Error handling expectations**

The PWA expects transcription-client to distinguish between:

- **Permanent errors** (do not retry, stop transcription for remaining snips):
  - Invalid API key (`{error: "Invalid API key"}`) → PWA shows "Transcription disabled: invalid API key" and stops transcription
  - Invalid audio format (`{error: "Invalid audio format"}`) → PWA marks the snip as failed and continues with next snip (this should be rare; all snips are MP3)

- **Transient errors** (retry automatically, then return error if retries exhausted):
  - Network failure (`{error: "Network failure"}`) → PWA marks the snip as failed and continues with next snip
  - Rate limit (`{error: "Rate limit exceeded"}`) → PWA shows "Rate limit reached; retry later" and stops transcription for remaining snips
  - Groq service unavailable (`{error: "Groq service unavailable"}`) → PWA marks the snip as failed and continues with next snip

The PWA trusts transcription-client to implement retry logic (exponential backoff for network failures, rate limits, and server errors). The PWA does not retry `transcribeAudio` calls itself.

**4. No direct storage access**

Transcription-client must NOT call session-store directly. The PWA is responsible for:
- Assembling snip audio from chunks (via `session-store.getChunksForSession(sessionId)` with snip's chunk references)
- Writing transcripts to session-store (via `session-store.writeTranscript(snipId, text)`) after `transcribeAudio` returns successfully

Transcription-client receives an audio blob (Blob or ArrayBuffer) and returns text. Storage integration is the PWA's responsibility.

### How the PWA uses transcription-client outputs

**Settings screen:**
- User enters Groq API key
- User clicks "Validate" or "Save"
- PWA calls `validateKey(apiKey)`
- If `{valid: true}` → display green "Transcription Enabled ✓" badge, save key to Settings (localStorage or session-store settings table)
- If `{valid: false, reason}` → display red "Transcription Disabled ✗" badge with reason text, do not save key

**Session detail screen (transcription flow):**
1. User opens a completed recording session
2. PWA checks Settings for valid Groq API key
3. If key is valid → "Transcribe" button is enabled
4. If key is missing or invalid → "Transcribe" button is disabled or hidden
5. User clicks "Transcribe"
6. PWA calls `volume-analyzer.proposeSnips(sessionId)` → receives array of snips (e.g., 8 snips)
7. For each snip:
   - PWA calls `session-store.getChunksForSession(sessionId)` with snip's chunk references
   - PWA concatenates chunk blobs into snip audio blob
   - PWA calls `transcribeAudio(snipAudioBlob, apiKey)`
   - If `{text, language}` → PWA calls `session-store.writeTranscript(snipId, text)`, displays transcript in session detail
   - If `{error}` → PWA marks snip as failed, displays "Transcription failed: <error>" for that snip, continues with next snip
8. After all snips processed, PWA displays full session transcript (concatenated snip transcripts) with "Copy" button

**Developer mode (optional):**
- If developer mode is enabled, the PWA may listen to transcription-client events (`transcriptionStarted`, `transcriptionComplete`, `transcriptionFailed`) and display them in a developer console or log panel
- Events are optional; the PWA does not depend on them for normal operation

### Customer assumptions about transcription-client

The PWA assumes transcription-client will:

1. **Not require setup or initialization**: The PWA calls `validateKey` and `transcribeAudio` as pure functions (or as methods on a simple client instance). No async initialization, no global state, no singleton pattern
2. **Support MP3 audio only**: All snips are MP3 format (Groq Whisper supports multiple formats, but Web Whisper uses MP3 throughout the pipeline). The PWA will not send WAV, FLAC, or other formats
3. **Return results within 30 seconds**: Groq Whisper typically responds in 1–5 seconds for short snips. The PWA expects `transcribeAudio` to return (success or error) within 30 seconds per snip. If a snip takes longer than 30 seconds, the PWA may consider it a timeout (though transcription-client's internal timeout should prevent this)
4. **Not block the UI**: The PWA calls `transcribeAudio` asynchronously (Promise or async/await). Transcription-client must not block the main thread during HTTP requests
5. **Not log sensitive data**: Transcription-client may emit events or log errors, but it must not log the full API key (only the first 4 characters or a hash). Transcript text is not sensitive (it's user-generated content), but the API key is a secret

### Known edge cases the PWA will handle

1. **Key expires or is revoked between validation and transcription**: The user validates a key in Settings, then Groq revokes the key before the user clicks "Transcribe". The PWA expects `transcribeAudio` to return `{error: "Invalid API key"}` gracefully. The PWA will show "Transcription failed: invalid API key" and prompt the user to re-validate the key in Settings.

2. **Network disconnects mid-transcription**: The user starts transcription, then disconnects from Wi-Fi. The PWA expects `transcribeAudio` to retry (up to the backoff limit), then return `{error: "Network failure"}`. The PWA will mark affected snips as failed and allow the user to retry later (manually, by clicking "Transcribe" again after reconnecting).

3. **Rate limit during batch transcription**: The user transcribes a session with 20 snips. Groq rate-limits the requests after 10 snips (HTTP 429). The PWA expects `transcribeAudio` to retry with backoff, but if the rate limit persists, return `{error: "Rate limit exceeded"}`. The PWA will stop transcription for the remaining 10 snips and show "Rate limit reached; retry later".

4. **Snip audio is silent or corrupted**: Volume-analyzer may propose a snip with no speech (e.g., a cough or background noise). The PWA expects `transcribeAudio` to succeed with empty or minimal transcript (e.g., Groq returns `{text: ""}` for silent audio). This is not an error; the PWA will display the empty transcript or omit the snip from the session transcript display.

### Success criteria from the PWA's perspective

The PWA considers transcription-client successful if:

1. **Key validation works**: Valid keys return `{valid: true}` consistently (no false negatives). Invalid keys return `{valid: false, reason: <string>}` with a clear reason.
2. **Transcription works**: `transcribeAudio` returns accurate transcript text for speech audio. Empty or minimal text for silent audio is acceptable.
3. **Errors are clear**: When transcription fails, the error message is human-readable and actionable (e.g., "Invalid API key" prompts the user to check Settings; "Network failure" prompts the user to check their connection).
4. **Retries are invisible**: The PWA does not need to know that transcription-client is retrying. The retry logic is internal to transcription-client. The PWA only sees the final success or failure.
5. **Latency is acceptable**: Transcription completes in 1–5 seconds per snip for typical speech audio (4–60 seconds per snip). The PWA shows a spinner during transcription; if it takes longer than 10 seconds, the user may notice, but it's not a failure as long as the result eventually arrives.

### What the PWA will NOT ask transcription-client to do

- **Decide which snips to transcribe**: Volume-analyzer proposes snips. The PWA decides whether to transcribe all snips or a subset. Transcription-client only transcribes the audio it receives.
- **Store transcripts**: Session-store owns all durable data. Transcription-client returns text; the PWA writes it to session-store.
- **Manage API key storage**: The PWA stores the Groq API key in Settings (localStorage or session-store). Transcription-client receives the key as a function argument; it does not read or write Settings.
- **Provide a UI**: Transcription-client is a library (no UI). The PWA provides all UI for Settings, session detail, and transcription progress. Transcription-client's Isolation Demo is a separate factory-floor UI, not part of the PWA.

## Customer Request

I'm the Web Whisper PWA. I need transcription-client to handle the Groq Whisper API boundary: key validation and audio transcription. Here's what I need:

### Core Workflow

**First-time setup (Settings screen):**
1. User opens Settings, pastes Groq API key into input field
2. User tabs out or clicks "Save" → I call `validateKey(apiKey)`
3. If valid: I save key to localStorage, show green "Valid ✓" indicator, enable transcription
4. If invalid: I show red "Invalid ✗" indicator with reason, keep transcription disabled

**Per-session transcription (Session Detail screen):**
1. User taps "Transcribe Session" button
2. I read snip list from session-store (created by volume-analyzer)
3. For each snip:
   - I read chunk blobs for snip's `chunkRefs` from session-store
   - I concatenate chunk blobs into snip audio blob (single MP3 blob)
   - I call `transcribeAudio(snipAudioBlob, apiKey)`
   - If success: I write transcript text to session-store via `writeTranscript(snipId, text)`
   - If failure: I mark snip as failed, continue to next snip
4. After all snips: I display full transcript text in session detail

### Interfaces I Need

**`validateKey(apiKey)`**

When I call it:
- User inputs/changes API key in Settings (on blur or "Save" button)
- User clicks "Recheck key" button in Settings
- App launch (if key exists in localStorage, I auto-validate in background to update status)

Input:
- `apiKey` (string): Groq API key from Settings input field (format `gsk_...`)

Output I expect:
- `{valid: true}` if key works
- `{valid: false, reason: string}` if key doesn't work

Reason codes I need to handle:
- `"Invalid API key"` → I show in Settings: "Key status: Invalid - Invalid API key format"
- `"Network error"` → I show: "Key status: Unable to validate - Network error"
- `"Groq service unavailable"` → I show: "Key status: Unable to validate - Service unavailable"
- `"Key format incorrect"` → I show: "Key status: Invalid - Key format incorrect"

How I use it:
- If `valid === true`: Save key to localStorage, update status chip to "ENABLE" (cyan), show "Key status: Valid ✓" (green)
- If `valid === false`: Do NOT save key, keep status chip "DISABLED" (gray), show "Key status: Invalid ✗ - [reason]" (red)

Validation strategy preference: Zero-cost if Groq provides a test endpoint. If not, a minimal audio test (< 1 second MP3 blob) is acceptable. DO NOT validate on every transcription call (too slow); validate once in Settings.

**Does `validateKey` throw exceptions? NO.** Always return `{valid: boolean, reason?: string}`. I need to handle validation failure gracefully (show UI message, not crash).

**`transcribeAudio(audioBlob, apiKey)`**

When I call it: Per snip, after user taps "Transcribe Session" and I've assembled snip audio blobs.

Input:
- `audioBlob` (Blob): MP3 audio data for one snip (typically 4–60 seconds, concatenated from chunks)
- `apiKey` (string): Groq API key from localStorage (already validated via `validateKey`, but transcribeAudio must handle expired/revoked keys gracefully)

Output I expect:
- Success: `{text: string, language?: string}`
  - `text`: Transcribed plaintext (UTF-8, no markdown)
  - `language`: ISO 639-1 code (e.g., "en", "es") if Groq returns it (optional)
- Failure: `{error: string}` (NOT thrown exception)

Error codes I need to handle:
- `"Network failure"` → I show error toast "Transcription failed: Network error", mark snip as failed, continue to next snip
- `"Rate limit exceeded"` → I show error toast "Rate limit exceeded. Retry later.", STOP transcription for remaining snips (don't hammer Groq)
- `"Invalid API key"` → I show error toast "API key invalid or expired", STOP transcription for remaining snips, prompt user to update key in Settings
- `"Invalid audio format"` → I show error toast "Transcription failed: Invalid audio format", mark snip as failed, continue to next snip (shouldn't happen if I provide MP3)
- `"Groq service unavailable"` → I show error toast "Groq service unavailable", mark snip as failed, continue to next snip

How I use it:
- If success: Write `text` to session-store via `writeTranscript(snipId, text)`, update progress bar ("3 / 8 snips transcribed"), display language badge if provided
- If error: Log error, mark snip as failed, display error message, handle per error code (stop or continue)

**Does `transcribeAudio` throw exceptions? NO.** Always return `{text, language}` or `{error}`. I need to handle transcription failure gracefully (per snip, not crash entire flow).

### Retry Logic I Expect

Transcription-client MUST retry on:
- Network failures (timeout, connection refused)
- HTTP 429 (rate limit) with exponential backoff
- HTTP 5xx (server error) with exponential backoff

Retry schedule I expect: 1s, 2s, 4s (exponential backoff, max 3 attempts total = 1 initial + 2 retries)

DO NOT retry on:
- HTTP 400 (invalid audio format) → permanent error
- HTTP 401/403 (invalid API key) → permanent error

After retries exhausted, return `{error: "..."}` to me. I handle the error and decide whether to retry the entire transcription flow later.

### Progress and Timeout

Transcription typically takes 1–5 seconds per snip for short audio. I expect < 30s timeout per `transcribeAudio` call. If transcription takes > 30s, return `{error: "Network failure: timeout"}` and I'll mark snip as failed.

I display progress to user:
- "Transcribing..." (spinner)
- "3 / 8 snips transcribed" (progress bar)
- Update every time `transcribeAudio` returns

### Partial Transcription Failure Handling

If some snips succeed and others fail:
- I display message: "7 of 8 snips transcribed. 1 failed."
- I show transcript text for successful snips
- I show "[Snip 5 failed to transcribe]" inline where failure occurred
- I offer "Retry Failed" button → re-calls `transcribeAudio` for only failed snips

If ALL snips fail with same error (e.g., all "Invalid API key"):
- I do NOT retry snip-by-snip
- I show global error: "Transcription failed: Invalid API key. Check Settings."
- I do NOT write any transcripts to session-store

### Transcription Disabled Handling

If no Groq API key in localStorage OR key validation returned `valid: false`:
- I do NOT call `transcribeAudio` (key not valid)
- I show in session detail: "Transcription disabled. Add API key in Settings." (informational, NOT error)
- Playback still works (recording + playback work without transcription)

This is NOT a failure case. It's a valid product state: recorder without transcription.

### Snip Audio Assembly (My Responsibility)

Before calling `transcribeAudio`, I assemble snip audio blob:

1. Read snip metadata from session-store: `{snipId, chunkRefs: [chunkId1, chunkId2, ...]}`
2. For each chunkId in chunkRefs:
   - Read chunk blob from session-store via `getChunksForSession` or `getChunk`
3. Concatenate chunk blobs: `new Blob([blob1, blob2, blob3], {type: 'audio/mpeg'})`
4. Pass concatenated blob to `transcribeAudio(blob, apiKey)`

Transcription-client does NOT assemble audio. I provide ready-to-transcribe MP3 blob per snip.

### Error Recovery Patterns

**Invalid API key during transcription:**
- First snip fails with `{error: "Invalid API key"}`
- I STOP transcription for remaining snips (don't retry)
- I show error: "API key invalid or expired. Update key in Settings."
- I do NOT auto-navigate to Settings (user may want to view partial transcript or delete session)

**Network failure during transcription:**
- Transcription-client retries per snip (1s, 2s, 4s backoff)
- After retries exhausted: `{error: "Network failure"}`
- I mark snip as failed, continue to next snip
- If multiple snips fail, I show "3 snips failed to transcribe" with "Retry Failed" button

**Rate limit exceeded:**
- Transcription-client retries with exponential backoff (as per Groq API retry-after header if provided)
- After retries exhausted: `{error: "Rate limit exceeded"}`
- I STOP transcription for remaining snips
- I show error: "Rate limit exceeded. Retry transcription later."
- I do NOT auto-retry (user decides when to retry)

### Events (Optional)

If transcription-client emits events for telemetry, I can subscribe:

- `transcriptionStarted(snipId, audioDuration)` → I log for debugging
- `transcriptionComplete(snipId, textLength, language)` → I log for debugging
- `transcriptionFailed(snipId, error, retryCount)` → I log for debugging

These are NOT required for core functionality. Events are bonus for developer mode logging.

### What I Do NOT Need

- I do NOT need transcription-client to read snips from session-store (I read snips and assemble audio)
- I do NOT need transcription-client to write transcripts to session-store (I write transcripts after `transcribeAudio` returns)
- I do NOT need transcription-client to display progress UI (I own progress bar and status text)
- I do NOT need transcription-client to decide transcription strategy (I decide which snips to transcribe)

### Summary of Interfaces

| Interface | Input | Output | Failure Result |
|-----------|-------|--------|----------------|
| `validateKey(apiKey)` | apiKey (string) | `{valid: boolean, reason?: string}` | Always structured return (NO exception) |
| `transcribeAudio(audioBlob, apiKey)` | audioBlob (Blob), apiKey (string) | `{text, language?}` or `{error}` | Always structured return (NO exception) |

NO thrown exceptions for normal failure cases. All errors returned as structured objects with descriptive error strings.

## Producer Response

I'm transcription-client. I accept your web-whisper-pwa customer request. You are my orchestrator—calling me to transcribe snip audio after recording completes. I will provide clean Groq API integration with structured error returns (NOT exceptions), handle all failure modes gracefully, and return plain transcript text ready for display/copy. Here's exactly what I will ship in Phase 06:

### Core Interfaces

**`validateKey(apiKey)`** → `{valid: boolean, reason?: string}`

Input: `apiKey` (string) from Settings input field

Output: `{valid: true}` or `{valid: false, reason: string}`

Validation checks:
- Format check: Key starts with "gsk_", length >= 32 chars → `{valid: true}`
- Format invalid → `{valid: false, reason: 'invalid_format'}`

I do NOT call Groq API in `validateKey` (too slow for live Settings input validation). Format check only. Real validation happens in `transcribeAudio` when first API call made.

**`transcribeAudio(audioBlob, apiKey)`** → `{text: string, language?: string}` or `{error: string}`

Inputs:
- `audioBlob` (Blob): Snip audio (concatenated MP3 chunks from playback-engine or session-store)
- `apiKey` (string): Groq API key from Settings

Output on success: `{text: string, language?: string}`
- `text`: Transcript text from Groq (plain text, no timestamps)
- `language`: Optional language code detected by Groq (e.g., "en", "es")

Output on failure: `{error: string}` (NOT thrown exception)

Error cases:
- `{error: 'invalid_key'}` → Groq API returns 401 Unauthorized (key is wrong or revoked)
- `{error: 'network_error'}` → Fetch failed, timeout, or network unavailable
- `{error: 'audio_too_large'}` → Blob > 25 MB (Groq limit; typical snips are 0.5–5 MB, rarely hit)
- `{error: 'invalid_audio'}` → Groq API returns 400 Bad Request (blob not valid audio format)
- `{error: 'quota_exceeded'}` → Groq API returns 429 Rate Limit (free tier exceeded)
- `{error: 'server_error'}` → Groq API returns 500/503 (temporary Groq outage)

Implementation:
- POST `https://api.groq.com/openai/v1/audio/transcriptions`
- Request: FormData with `file: audioBlob`, `model: "whisper-large-v3"`, `response_format: "json"`
- Headers: `Authorization: Bearer ${apiKey}`
- Timeout: 30s (Groq is fast, typical response < 5s; 30s allows long audio)
- Parse JSON response: `{text: string, language?: string}`

### Error Handling (Structured Results, NOT Exceptions)

All errors returned as `{error: string}` objects. I do NOT throw exceptions for normal failure cases (invalid key, network error, etc.).

You check for error field:
```javascript
const result = await transcriptionClient.transcribeAudio(snipBlob, apiKey);
if (result.error) {
  if (result.error === 'invalid_key') {
    showErrorToast('Invalid Groq API key. Check Settings.');
  } else if (result.error === 'quota_exceeded') {
    showErrorToast('Groq quota exceeded. Try again later.');
  } else {
    showErrorToast(`Transcription failed: ${result.error}`);
  }
} else {
  showTranscript(result.text);
  await sessionStore.writeTranscript(snipId, result.text);
}
```

### Retry Pattern (Your Responsibility)

I do NOT implement automatic retry logic. If `transcribeAudio` fails, I return error immediately.

You decide whether to retry:
- Show "Retry" button in UI
- User clicks "Retry" → you call `transcribeAudio` again
- Implement exponential backoff if desired (e.g., wait 2s, 4s, 8s between retries)

This gives you control over retry UX (show retry count, cancel button, etc.).

### What I Will NOT Ship in Phase 06

**Automatic retry on transient errors**: Out of scope. You handle retries (show "Retry" button).

**Progress events during transcription**: Out of scope. Groq API is fast (< 5s for typical snip), progress not needed. You show loading spinner while awaiting result.

**Batch transcription**: Out of scope. You call `transcribeAudio` once per snip. I do NOT provide `transcribeMultipleSnips(snipBlobs[])` batch interface. If you want to transcribe 5 snips, call `transcribeAudio` 5 times (sequentially or parallel, your choice).

**Transcript caching**: Out of scope. I do NOT cache transcripts in memory. You call `session-store.writeTranscript(snipId, text)` after successful transcription to persist.

### Spec Status

Spec Status: unresolved (Phase 06 implementation not yet built)

Phase 06 will implement `transcribeAudio` with Groq API integration, `validateKey` with format check, validate with PWA integration tests (Settings key validation, post-recording transcription flow).
