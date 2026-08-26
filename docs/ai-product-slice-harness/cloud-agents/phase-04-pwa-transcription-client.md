# Phase 04: PWA → transcription-client Customer Request

**Date**: 2026-08-26  
**Phase**: 04 (Customer Requests)  
**Relationship**: apps/web-whisper-pwa → packages/lib/transcription-client  
**Customer Document**: `packages/lib/transcription-client/customers/web-whisper-pwa.md`

## Relationship Summary

The PWA calls transcription-client to validate Groq API keys (in settings) and transcribe snip audio (after snips proposed by volume-analyzer). Transcription-client interacts with Groq Whisper API, handles retries, and returns transcript text to PWA.

## Customer Request Content

The PWA's customer request in `packages/lib/transcription-client/customers/web-whisper-pwa.md` specifies:

- **`validateKey(apiKey)` interface**: Called when user enters Groq API key in settings. Returns `{valid: true}` or `{valid: false, reason}`. PWA displays validation status chip (green checkmark or red X) and enables/disables transcription features.

- **`transcribeAudio(audioBlob, options)` interface**: Called when user clicks "Transcribe" button on snip. PWA assembles snip audio (concatenates chunk blobs for snip's chunk range), passes to transcription-client. Returns `{text: string, language?: string}` or `{error: string}`.

- **Retry logic expectations**: Transient errors (network failure, rate limit 429, server error 500) retried with exponential backoff (1s, 2s, 4s, 8s). Non-transient errors (invalid key 401, invalid audio 400) NOT retried.

- **Timeout and progress**: PWA displays spinner during transcription. Transcription-client supports 60s timeout (typical snip transcription completes in 5–15s). If timeout exceeded, return `{error: 'transcription_timeout'}`.

- **Error handling patterns**: All errors returned as structured objects (NOT thrown exceptions). PWA displays error toasts for `invalid_api_key`, `network_failure`, `rate_limit`, `transcription_timeout`, `invalid_audio`.

- **Snip audio assembly delegation**: PWA assembles snip audio blobs (reads chunks from session-store, concatenates blobs for snip's chunk range), passes single blob to transcription-client. Transcription-client does NOT read session-store.

## Phase 05 Follow-Up

Phase 05 producer-response agent will write transcription-client's response in the same customer document, confirming how it will meet the PWA's request.
