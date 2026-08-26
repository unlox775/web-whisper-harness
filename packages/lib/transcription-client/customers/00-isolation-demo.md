# Customer: Isolation Demo (Standing Human Customer)

The Isolation Demo is a standing founder/developer customer that operates transcription-client by itself, without the production PWA.

## Producer's Understanding of This Customer

(To be filled by Phase 03 product-spec agent for transcription-client)

The Isolation Demo is the package factory floor. It needs to prove that transcription-client's core logic works (API key validation, HTTP request to Groq, error handling, retry logic) without depending on the PWA or session-store.

The demo operates with fixture audio by default (simulated snip with known transcription result). It allows the founder/developer to:
- Validate API keys (fixture mode: skip validation; live mode: call Groq test endpoint)
- Transcribe audio (fixture mode: mock transcript returned immediately; live mode: real HTTP request to Groq)
- Test error handling (fixture mode: simulate network failure, rate limit, invalid audio; live mode: real errors if key invalid or network down)
- See retry logic in action (network failure → auto-retry with exponential backoff, visible in transcript panel as "Retrying... (attempt 2/3)")

## Customer Request

(To be filled by Phase 04 customer-request agent for isolation-demo → transcription-client)

The isolation-demo customer will write its request here: what interfaces it needs from transcription-client (`validateKey`, `transcribeAudio`), what inputs it will provide (fixture audio blob or real audio, API key for live mode), what outputs it expects (transcript text, error messages), and what validation it needs to see to trust the package.

## Producer Response

(To be filled by Phase 05 producer-response agent for transcription-client)

Transcription-client will respond here: how it will meet the isolation-demo's request, what interfaces it will expose for demo use, what data modes it supports (fixture by default, optionally live with real Groq API), and how the demo proves the package works independently.
