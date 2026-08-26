Spec Status: unresolved
Spec Type: initial-product-spec
Created: 2026-08-26T15:20:37Z
Product: packages/lib/transcription-client

# Transcription Client — Initial Product Spec

## Product Goal

Provide Groq Whisper API client. Validates API keys, sends audio to Groq for transcription, handles retries and failures. Does NOT capture, analyze, or play audio. Does NOT decide which snips to transcribe (PWA decides that).

## Boundary

- **Owns**: Groq API key validation (HTTP call to test endpoint or small audio test), audio transcription (sends MP3 audio blob to Groq Whisper endpoint `https://api.groq.com/openai/v1/audio/transcriptions`), retry logic (network failures, rate limits with exponential backoff), transcript formatting (extract plaintext from Groq JSON response)
- **Does NOT own**: Audio capture (capture-engine), volume analysis (volume-analyzer), audio playback (playback-engine), snip selection (PWA decides which snips to transcribe based on volume profile), storage authority (session-store owns all transcripts; PWA writes transcript after transcribeAudio returns)

## Main Interfaces

(From slice-up plan; expand in Phase 03)

- `validateKey(apiKey)` → `{valid: boolean, reason?: string}`
- `transcribeAudio(audioBlob, apiKey)` → `{text: string, language?: string, error?: string}`

## Isolation Demo

The package-local Isolation Demo uses fixture audio (simulated snip with known transcription result: "This is a test transcription") as the safe default. Optionally, the demo can use real Groq API with user-supplied key for live transcription.

See `isolation-demo/README.md` for panel-based layout. Demo proves: API key validation works (valid key → green "Valid", invalid key → red "Invalid" with reason), transcription request works (fixture returns mock transcript immediately; live mode sends HTTP request to Groq and returns real transcript), error handling works (network failure, rate limit, invalid audio format).

## Phase 03 Product Spec Tasks

This stub spec will be expanded by the Phase 03 product-spec agent for `packages/lib/transcription-client` to include:

- Groq API endpoint details (`https://api.groq.com/openai/v1/audio/transcriptions`, model `whisper-large-v3` or similar)
- API key validation strategy (test endpoint vs small audio test; consider cost/latency)
- Audio format requirements (MP3 is supported; check if Groq needs specific encoding or can accept any MP3)
- Retry logic (exponential backoff, max retries, which errors to retry: network failure yes, invalid key no, rate limit yes)
- Transcript formatting (Groq returns JSON with `text` field; extract plaintext, optionally `language` field)
- Error handling (network failure, rate limit, invalid key, invalid audio format, Groq service down)
- Isolation Demo implementation notes (fixture audio + mock transcript, optional live mode with real Groq API, API key input field for live mode, error simulation buttons: "Simulate Network Failure", "Simulate Rate Limit")
- Validation plan (manual demo walkthrough, fixture mode test, live mode test with real Groq key, error handling test)

## Customer Relationships

Customers of transcription-client:
- `apps/web-whisper-pwa` (see `customers/web-whisper-pwa.md`)
- Isolation Demo (see `customers/00-isolation-demo.md`)

Customer request sections will be filled by Phase 04 customer-request agents.
