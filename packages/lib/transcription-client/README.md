# Transcription Client

Groq Whisper API client. Validates API keys, sends audio to Groq for transcription, handles retries and failures.

## Boundary

- **Owns**: Groq API key validation (HTTP call to test endpoint), audio transcription (sends MP3 audio to Groq Whisper endpoint), retry logic (network failures, rate limits), transcript formatting (plaintext output from Groq response)
- **Does NOT own**: Audio capture (capture-engine), volume analysis (volume-analyzer), audio playback (playback-engine), snip selection (PWA decides which snips to transcribe), storage authority (session-store owns all transcripts)

## Main Callable Interfaces

(Planning names, not frozen APIs)

- `validateKey(apiKey)` → returns validation result
  - Input: Groq API key string (from PWA settings)
  - Output: `{valid: boolean, reason?: string}` (e.g., `{valid: false, reason: "Invalid API key"}`)
  - Caller: PWA settings screen (when user inputs key or clicks "Validate" button)
  - Store changed: None (validation is read-only)

- `transcribeAudio(audioBlob, apiKey)` → returns transcript
  - Input: audio blob (MP3 chunk or snip), Groq API key
  - Output: `{text: string, language?: string, error?: string}` (e.g., `{text: "Hello world", language: "en"}`)
  - Caller: PWA transcription flow (per snip, not per chunk or entire session)
  - Store changed: session-store (PWA writes transcript to session-store after transcribeAudio returns)

## Isolation Demo

See `isolation-demo/README.md` for the package-local runnable demo. The demo uses fixture audio (simulated snip with known transcription result) by default. Optionally, it can use real Groq API with user-supplied key for live transcription. It proves: API key validation works, transcription request/response works, error handling works (invalid key, network failure, rate limit).

## Product Specs

See `docs/specs/` for detailed implementation specs and work orders.

## Customers

- `apps/web-whisper-pwa` (primary customer; see `customers/web-whisper-pwa.md`)
- Isolation Demo (standing human customer; see `customers/00-isolation-demo.md`)
