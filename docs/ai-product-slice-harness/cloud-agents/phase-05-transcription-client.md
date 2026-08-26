# Phase 05: transcription-client Producer Responses

**Date**: 2026-08-26  
**Phase**: 05 (Producer Responses)  
**Producer**: packages/lib/transcription-client  
**Customer Documents**: 2 customer files in `packages/lib/transcription-client/customers/`

## Producer Summary

Transcription-client is the lib package that integrates with Groq Whisper API to transcribe audio. It handles API calls, error handling, and returns plain transcript text. It has 2 customers:

1. **Isolation Demo** (`00-isolation-demo.md`): Standing human customer that proves Groq integration and error handling work with fixture/live modes
2. **web-whisper-pwa** (`web-whisper-pwa.md`): Primary orchestrator that calls transcription-client to transcribe snips post-recording

## Producer Response Content

Transcription-client's producer responses specify:

### Core Interfaces

**`validateKey(apiKey)`** → `{valid: boolean, reason?: string}`

- Format check only (starts with "gsk_", length >= 32 chars)
- Does NOT call Groq API (too slow for live Settings validation)
- Real validation happens in `transcribeAudio` when first API call made

**`transcribeAudio(audioBlob, apiKeyOrOptions)`** → `{text: string, language?: string}` or `{error: string}`

For Isolation Demo:
- Input: `audioBlob, options?: {apiKey?, mode?: 'fixture' | 'live', simulateError?}`
- Mode='fixture' (default if no apiKey): Returns fixture transcript instantly (no network call)
- Mode='live': Requires apiKey, calls real Groq Whisper API

For PWA:
- Input: `audioBlob, apiKey`
- Calls Groq API: `POST https://api.groq.com/openai/v1/audio/transcriptions`
- Model: `whisper-large-v3`
- Timeout: 30s (typical response < 5s)

### Key Design Decisions

- **Fixture mode for demo**: Returns instant fixture transcript based on blob duration. No API key or network access needed. Useful for testing UI/integration.
- **Live mode**: Calls real Groq API with user's API key. Returns actual transcript from Groq.
- **Error handling (structured results, NOT exceptions)**: All errors returned as `{error: string}` objects. Error codes: `invalid_key` (401), `network_error` (fetch failed), `audio_too_large` (> 25 MB), `invalid_audio` (400), `quota_exceeded` (429), `server_error` (500/503).
- **No automatic retry**: If `transcribeAudio` fails, return error immediately. PWA decides whether to retry (show "Retry" button).

### What Transcription-Client Will NOT Ship in Phase 06

- **Automatic retry on transient errors**: Out of scope. PWA handles retries.
- **Progress events during transcription**: Groq API is fast (< 5s for typical snip), progress not needed.
- **Batch transcription**: No `transcribeMultipleSnips(snipBlobs[])` interface. PWA calls `transcribeAudio` once per snip.
- **Transcript caching**: Does NOT cache transcripts in memory. PWA calls `session-store.writeTranscript` after successful transcription.

## Phase 06 Follow-Up

Phase 06 implementation agent will build transcription-client with fixture/live modes, integrate with Groq API, build Isolation Demo, validate with PWA (Settings key validation, post-recording transcription flow).
