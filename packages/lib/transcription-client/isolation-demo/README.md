# Transcription Client Isolation Demo

Package-local runnable demo for operating transcription-client independently without the production PWA.

## Purpose

Proves that transcription-client:
- Validates Groq API keys (valid → green "Valid", invalid → red "Invalid" with reason)
- Transcribes audio (fixture mode: mock transcript returned immediately; live mode: real HTTP request to Groq)
- Handles errors (network failure, rate limit, invalid key, invalid audio format)
- Supports retry logic (network failure → auto-retry with exponential backoff)

## Runtime

- **Platform**: Web app (local dev server, factory floor operating surface)
- **Viewport**: Desktop browser (wider factory floor, not phone-shaped)
- **Launch**: `cd packages/lib/transcription-client/isolation-demo && npm start` (or equivalent)

## Data Mode

**Fixture by default** (simulated snip with known transcription result: "This is a test transcription from fixture audio"). Optionally, **live mode with real Groq API** (user supplies API key, demo sends real HTTP request).

**Safe default**: Fixture mode (no Groq API key required, no network calls, instant mock transcript).

## Panel-Based Layout

**4 distinct regions:**

### 1. Top Chrome Panel (fixed header, spans full width)

- **Left**: "Transcription Client Isolation Demo" heading (bold)
- **Center**: Data mode chip: "FIXTURE MODE (mock transcript)" (default, gray border) or "LIVE MODE (real Groq API)" (cyan border, if live mode enabled)
- **Right**: "Enable Live Mode" toggle (checkbox or switch; when ON → API key input required, real Groq API used)

### 2. Control Panel (left third of viewport, below chrome)

**Components:**
- API key input field (text input, placeholder "Enter Groq API key", only enabled when "Enable Live Mode" ON)
- "Validate Key" button (cyan, full-width, only enabled when live mode ON and API key not empty)
- "Transcribe Audio" button (cyan, full-width, enabled when: fixture mode always, OR live mode + valid key)
- "Reset" button (gray, full-width, clears transcript + validation status; always enabled)
- Error simulation buttons (only visible in fixture mode, for testing error handling):
  - "Simulate Network Failure" (gray, triggers mock network error)
  - "Simulate Rate Limit" (gray, triggers mock 429 response)
  - "Simulate Invalid Audio" (gray, triggers mock "unsupported format" error)

**Behaviors:**
- When "Enable Live Mode" toggled ON → API key input enabled, "Validate Key" button enabled, error simulation buttons hidden
- When "Validate Key" clicked (live mode) → HTTP call to Groq test endpoint, validation result panel updates (green "Valid" or red "Invalid" with reason)
- When "Transcribe Audio" clicked (fixture mode) → mock transcript appears immediately in transcript panel ("This is a test transcription from fixture audio")
- When "Transcribe Audio" clicked (live mode) → HTTP call to Groq transcription endpoint, transcript panel shows "Transcribing..." spinner, then transcript text or error message
- When error simulation button clicked (fixture mode) → transcript panel shows simulated error (red text: "Network failure: fetch timeout" or "Rate limit: 429 Too Many Requests" or "Invalid audio format: unsupported encoding")
- When "Reset" clicked → transcript cleared, validation status cleared, API key input cleared (if live mode)

### 3. Validation Result Panel (top right quarter of viewport, below chrome)

**Components:**
- Heading: "API Key Validation" (small gray text)
- Status badge: "Not validated" (gray, default), "Valid ✓" (green, after successful validation), "Invalid ✗" (red, after failed validation)
- Reason text (only visible when invalid): "Invalid API key" or "Network error" or "Key format incorrect"

**Behaviors:**
- When "Validate Key" clicked (live mode) → status badge updates ("Validating..." gray spinner → "Valid ✓" green or "Invalid ✗" red)
- When "Reset" clicked → status badge resets to "Not validated" (gray), reason text hidden

### 4. Transcript Panel (bottom right two-thirds of viewport, below chrome, scrollable)

**Components:**
- Heading: "Transcript Output" (small gray text)
- Transcript text area (large, white text on dark background, scrollable, read-only):
  - Fixture mode: "This is a test transcription from fixture audio" (appears immediately after "Transcribe Audio" clicked)
  - Live mode: Real transcript text from Groq API (e.g., "Hello, this is a recording of my voice speaking into the microphone")
  - Error state: Red text with error message (e.g., "Error: Network failure: fetch timeout" or "Error: Rate limit: 429 Too Many Requests")
- Language badge (optional, only visible if Groq returns language): "Language: en" (small gray chip above transcript text)

**Behaviors:**
- When "Transcribe Audio" clicked (fixture mode) → transcript text appears immediately (no spinner)
- When "Transcribe Audio" clicked (live mode) → spinner appears ("Transcribing..."), then transcript text or error message
- When error simulation button clicked (fixture mode) → red error text appears in transcript area
- When "Reset" clicked → transcript text cleared, language badge hidden

## Before / After States

**Before state (page load, fixture mode, no transcription yet):**
- Top chrome: "FIXTURE MODE (mock transcript)" chip, "Enable Live Mode" toggle OFF
- Control panel: API key input disabled (gray), "Validate Key" button disabled, "Transcribe Audio" enabled (cyan), "Reset" enabled, error simulation buttons visible
- Validation result panel: Status badge "Not validated" (gray), no reason text
- Transcript panel: Empty, placeholder text "Click 'Transcribe Audio' to generate transcript"

**After state (fixture mode, after Transcribe Audio clicked):**
- Control panel: Same as before (buttons still enabled for re-transcription)
- Validation result panel: Status badge "Not validated" (fixture mode doesn't require key validation)
- Transcript panel: "This is a test transcription from fixture audio" (white text)

**After state (live mode, after Enable Live Mode → enter key → Validate Key → Transcribe Audio):**
- Top chrome: "LIVE MODE (real Groq API)" chip (cyan border), "Enable Live Mode" toggle ON
- Control panel: API key input filled (e.g., "gsk_..."), "Validate Key" button enabled, "Transcribe Audio" enabled, "Reset" enabled, error simulation buttons hidden
- Validation result panel: Status badge "Valid ✓" (green)
- Transcript panel: Real transcript from Groq (e.g., "Hello, this is a recording of my voice speaking into the microphone"), language badge "Language: en"

**After state (fixture mode, after Simulate Network Failure clicked):**
- Transcript panel: Red text "Error: Network failure: fetch timeout"

## What This Demo Does NOT Do

- Does not call session-store (transcripts are displayed in-demo only, not persisted)
- Does not decide which snips to transcribe (PWA decides that based on volume profile; this demo only exercises the transcription API)
- Does not capture or play audio (capture-engine and playback-engine do those)
- Transcription-client's public interface expects caller to provide audio blob and API key
- This demo exercises the CORE LOGIC (API key validation, HTTP request to Groq, error handling, retry logic) without the PWA orchestration or storage integration
- Storage integration is proven in session-store's Isolation Demo or the final PWA

## Implementation Notes

(To be filled by Phase 06 implementation agent)

- Fixture audio: Use a small pre-generated MP3 blob (e.g., 1s silent audio or known "test" speech)
- Fixture transcript: Hardcoded string "This is a test transcription from fixture audio"
- Live mode: Real HTTP POST to `https://api.groq.com/openai/v1/audio/transcriptions` with `Authorization: Bearer <apiKey>` header, `model: whisper-large-v3` (or similar), `file: <audioBlob>` multipart/form-data
- API key validation: Call Groq test endpoint (or send small audio test; check cost/latency trade-off)
- Retry logic: Exponential backoff (1s, 2s, 4s, 8s), max 3 retries, only for network failures and rate limits (not for invalid key or invalid audio)
- Error simulation: Mock `fetch` failures in fixture mode (reject promise with "Network error", return 429 status, return "unsupported format" error)
