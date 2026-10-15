# Transcription Client

Groq Whisper API client. Validates API keys, sends audio to Groq for transcription, handles retries and failures.

## Boundary

- **Owns**: Groq API key validation (HTTP call to test endpoint), audio transcription (sends MP3 audio to Groq Whisper endpoint), retry logic (network failures, rate limits), transcript formatting (plaintext output from Groq response)
- **Does NOT own**: Audio capture (capture-engine), volume analysis (volume-analyzer), audio playback (playback-engine), snip selection (PWA decides which snips to transcribe), storage authority (session-store owns all transcripts), log storage (emits via `session-store.log('transcription-client', …)` only)

## Main Callable Interfaces

(Planning names, not frozen APIs)

- `validateKey(apiKey)` → returns validation result
  - Input: Groq API key string (from PWA settings)
  - Output: `{valid: boolean, reason?: string}` (e.g., `{valid: false, reason: "Invalid API key"}`)
  - Caller: PWA settings screen (when user inputs key or clicks "Validate" button)
  - Store changed: None (validation is read-only)

- `transcribeAudio(audioBlob, apiKey)` → returns transcript
  - Input: audio blob (one assembled snip — time-trimmed WAV or MP3 — never a raw 4s chunk and never the whole session), Groq API key, optional `prompt` (Whisper context)
  - Output: `{text: string, language?: string, avgLogprob?: number, noSpeechProb?: number, error?: string}` (e.g., `{text: "Hello world", language: "en"}`)
  - Caller: PWA `transcribePendingSnips` / session-detail retry, and Isolation Demo archive snip step-through (`assembleSnipTranscriptionBlob` then one call per snip)
  - Store changed: session-store (PWA writes transcript to session-store after transcribeAudio returns)

- `buildContextPrompt` / `createContextChain` / `transcribeSequence` → context-aware snip chain
  - Input: optional vocabulary line, accumulated prior transcript, previous snip quality, ordered snip blobs
  - Output: Groq `prompt` string (vocabulary first, then ~150-word tail within 224 tokens) and serial per-snip results
  - Caller: PWA transcription loop and Isolation Demo context-chain page
  - Store changed: none (prompt is not persisted)

See `apps/web-whisper-pwa/docs/specs/20260908143900-feedback-phase-07-transcribe-assembled-snip-blobs.md` for the Phase 07 investigation of what blob the PWA actually sends.

See `docs/specs/20261015141100-feedback-context-aware-snip-prompt.md` for the context-chain contract (serial Groq calls, poisoning guard, latency tradeoff).

## Isolation Demo

See `isolation-demo/README.md` for the package-local runnable demo. The demo uses fixture audio (simulated snip with known transcription result) by default. Optionally, it can use real Groq API with user-supplied key for live transcription. It proves: API key validation works, transcription request/response works, error handling works (invalid key, network failure, rate limit).

The **Context chain** page (`isolation-demo/context-chain.html`) transcribes a fixture snip sequence with and without context side by side, and shows the poisoning-guard fallback (vocabulary only). Mock responses are the safe default; live Groq is optional when a key is supplied.

## Product Specs

See `docs/specs/` for detailed implementation specs and work orders.

## Customers

- `apps/web-whisper-pwa` (primary customer; see `customers/web-whisper-pwa.md`)
- Isolation Demo (standing human customer; see `customers/00-isolation-demo.md`)
