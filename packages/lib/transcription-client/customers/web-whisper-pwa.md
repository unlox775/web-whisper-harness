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

(To be filled by Phase 04 customer-request agent for web-whisper-pwa → transcription-client)

The PWA customer will write its request here: exact interfaces it needs (`validateKey`, `transcribeAudio`), error handling expectations (what errors are recoverable, what errors should stop immediately), retry logic expectations (how many retries, what delays, what errors to retry), transcript format expectations (plaintext, any post-processing needed).

## Producer Response

(To be filled by Phase 05 producer-response agent for transcription-client)

Transcription-client will respond here: how it will meet the PWA's request, what interfaces it will provide, what error formats it will return, how it will implement retry logic, and what transcript format it will return.
