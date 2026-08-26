# Customer: apps/web-whisper-pwa

The Web Whisper PWA is the primary customer of transcription-client. The PWA calls transcription-client to validate Groq API keys (Settings screen) and transcribe snips (session detail screen).

## Producer's Understanding of This Customer

(To be filled by Phase 03 product-spec agent for transcription-client)

The PWA needs transcription-client to:
- Validate Groq API keys on demand (user inputs key in Settings, PWA calls `validateKey` when user clicks "Save" or "Validate" button)
- Transcribe snips (PWA calls `transcribeAudio` per snip, not per chunk or entire session; snips are selected by volume-analyzer based on silence detection)
- Handle errors gracefully (invalid key → return `{valid: false, reason: "Invalid API key"}` NOT throw exception; network failure → retry with exponential backoff, then return error if retries exhausted; rate limit → wait and retry)
- Return transcript text in plaintext format (no markdown, no formatting; PWA will display it in session detail or copy it to clipboard)

The PWA will use transcription-client outputs to:
- Display key validation status in Settings (green "Valid ✓" or red "Invalid ✗" with reason)
- Transcribe all snips for a session when user clicks "Transcribe" button (loop over snips, call `transcribeAudio` per snip, write transcripts to session-store, display in session detail)
- Handle failures (if transcription fails for one snip, continue with next snip; display "Transcription failed" for failed snips)

## Customer Request

(To be filled by Phase 04 customer-request agent for web-whisper-pwa → transcription-client)

The PWA customer will write its request here: exact interfaces it needs (`validateKey`, `transcribeAudio`), error handling expectations (what errors are recoverable, what errors should stop immediately), retry logic expectations (how many retries, what delays, what errors to retry), transcript format expectations (plaintext, any post-processing needed).

## Producer Response

(To be filled by Phase 05 producer-response agent for transcription-client)

Transcription-client will respond here: how it will meet the PWA's request, what interfaces it will provide, what error formats it will return, how it will implement retry logic, and what transcript format it will return.
