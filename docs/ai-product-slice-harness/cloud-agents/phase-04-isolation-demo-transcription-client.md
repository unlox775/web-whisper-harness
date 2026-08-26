# Phase 04: Isolation Demo → transcription-client Customer Request

**Date**: 2026-08-26  
**Phase**: 04 (Customer Requests)  
**Relationship**: Isolation Demo → packages/lib/transcription-client  
**Customer Document**: `packages/lib/transcription-client/customers/00-isolation-demo.md`

## Relationship Summary

The Isolation Demo is the standing founder/developer customer that operates transcription-client independently to prove API key validation and audio transcription work correctly, with clear error handling and fixture mode support. It is the package factory floor for validating transcription logic.

## Customer Request Content

The Isolation Demo's customer request in `packages/lib/transcription-client/customers/00-isolation-demo.md` specifies:

- **Safe default: Fixture mode**: Demo defaults to fixture mode (no Groq API key required, no network calls, instant mock transcript). Data mode chip: "FIXTURE MODE (mock transcript)" (gray). Operator clicks "Transcribe Audio" → returns mock transcript immediately: `"This is a test transcription from fixture audio"`.

- **Interfaces needed**: `transcribeAudio(audioBlob, options?)` (fixture mode: returns mock transcript immediately, live mode: sends real HTTP to Groq), `validateKey(apiKey)` (sends real HTTP to Groq to verify key works).

- **Error simulation buttons (fixture mode only)**: "Simulate Network Failure", "Simulate Rate Limit", "Simulate Invalid Audio". When clicked, transcription-client returns corresponding error without sending HTTP request. Operator validates error handling without needing real network failures.

- **Live mode (optional)**: Operator toggles "Enable Live Mode" ON → data mode chip: "LIVE MODE (real Groq API)" (cyan). API key input enabled. Operator enters key, clicks "Validate Key" → returns `{valid: true}` or `{valid: false, reason}`. If valid, "Transcribe Audio" button enabled. Operator clicks → sends real HTTP to Groq → returns real transcript.

- **Visual proof: Fixture mode flow**: Page loads → fixture mode → Transcribe Audio → mock transcript displayed → Simulate Network Failure → error displayed (red text) → Simulate Rate Limit → error displayed → Simulate Invalid Audio → error displayed.

- **Visual proof: Live mode flow**: Toggle ON → enter key → Validate Key → "Valid ✓" (green) → Transcribe Audio → spinner "Transcribing..." → real transcript displayed (white text), language badge "Language: en".

- **Invalid key flow**: Enter invalid key → Validate Key → "Invalid ✗" (red), reason → Transcribe Audio button disabled.

- **UI panels**: Top Chrome Panel (data mode chip, live mode toggle), Control Panel (API key input, Validate Key button, validation status, Transcribe Audio button, error simulation buttons, Reset button), Transcript Panel (white text for transcripts, red text for errors, language badge).

- **Performance expectations**: Fixture mode < 10ms. Live mode `validateKey` 1–5s. Live mode `transcribeAudio` 2–10s for fixture audio blob.

- **Error handling expectations**: Transcription-client MUST return error objects (NOT throw exceptions). Error codes: `invalid_api_key`, `network_failure`, `rate_limit`, `invalid_audio`, `groq_error`.

## Phase 05 Follow-Up

Phase 05 producer-response agent will write transcription-client's response in the same customer document, confirming how it will meet the Isolation Demo's request.
