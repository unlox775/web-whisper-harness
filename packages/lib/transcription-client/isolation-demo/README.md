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

Phase 06 implementation agent will build this demo. Key requirements:

### Fixture Audio

Use a small pre-generated MP3 blob for the fixture audio. Options:

1. **Silent audio**: Generate 1–2s of silent MP3 (simplest; Groq accepts silent audio and returns empty or minimal transcript)
2. **Synthetic speech**: Generate 1–2s of synthetic "test" speech if tooling is available
3. **Pre-recorded snippet**: Include a tiny MP3 file (e.g., 10KB) in `isolation-demo/fixtures/test-audio.mp3` with known content

Fixture transcript (hardcoded, returned immediately when "Transcribe Audio" clicked in fixture mode):

```
"This is a test transcription from fixture audio"
```

### Live Mode HTTP Request

When "Enable Live Mode" is ON and user clicks "Transcribe Audio", send real HTTP request to Groq:

**Endpoint:** `https://api.groq.com/openai/v1/audio/transcriptions`

**Method:** `POST`

**Headers:**
- `Authorization: Bearer <apiKey>` (user-supplied key from input field)
- `Content-Type: multipart/form-data`

**Body (multipart/form-data):**
- `file`: fixture audio blob (same blob used in fixture mode, but sent to real Groq API in live mode)
- `model`: `whisper-large-v3` (or current Groq-recommended Whisper model; verify exact model name from Groq API docs)
- `response_format`: `json` (default)

**Response parsing:**
- Success (HTTP 200): Parse JSON `{text: string, language?: string}`, display `text` in transcript panel, show language badge if `language` present
- Error (HTTP 400): Display "Error: Invalid audio format: unsupported encoding"
- Error (HTTP 401/403): Display "Error: Invalid API key"
- Error (HTTP 429): Display "Error: Rate limit: 429 Too Many Requests"
- Error (HTTP 5xx): Display "Error: Groq service unavailable"
- Error (network timeout or fetch failure): Display "Error: Network failure: fetch timeout"

### API Key Validation

When "Validate Key" clicked (live mode), test the API key before transcription:

**Strategy options** (Phase 06 will choose based on Groq API documentation):

1. **Preferred: Test endpoint** (if Groq provides a zero-cost key validation endpoint, use it)
2. **Fallback: Small audio test** (send the fixture audio blob to transcription endpoint; if HTTP 200, key is valid; if HTTP 401/403, key is invalid)

**Validation result:**
- Valid key → HTTP 200 from test endpoint or transcription endpoint → display "Valid ✓" (green badge) in validation result panel
- Invalid key → HTTP 401/403 → display "Invalid ✗" (red badge) with reason "Invalid API key"
- Network error → timeout or fetch failure → display "Invalid ✗" with reason "Network error"
- Service unavailable → HTTP 5xx → display "Invalid ✗" with reason "Groq service unavailable" (or treat as temporary and show "Valid?" uncertain state; Phase 06 will decide)

### Retry Logic

**Retryable errors:**
- Network timeout or fetch failure
- HTTP 429 (rate limit)
- HTTP 5xx (server error)

**Non-retryable errors:**
- HTTP 400 (invalid audio format)
- HTTP 401/403 (invalid API key)

**Backoff schedule:**
- Attempt 1: Immediate (no delay)
- Attempt 2: Wait 1s, retry
- Attempt 3: Wait 2s, retry
- Attempt 4: Wait 4s, retry
- If all 4 attempts fail (1 initial + 3 retries), return final error

**Total max attempts:** 4 (1 initial + 3 retries)

**Timeout per request:** 30s (Groq Whisper typically responds in 1–5s; 30s is a safe upper bound)

**UI feedback during retries** (optional; enhances demo experience):
- Show spinner in transcript panel with text "Transcribing... (attempt 2/4)"
- Or show "Retrying in 2s..." countdown
- If retries succeed, show transcript normally
- If retries exhausted, show final error

### Error Simulation (Fixture Mode Only)

When error simulation buttons are clicked in fixture mode, mock the corresponding error without sending a real HTTP request:

1. **"Simulate Network Failure"**: Reject fetch promise with `new Error("Network failure: fetch timeout")` → transcript panel shows "Error: Network failure: fetch timeout"

2. **"Simulate Rate Limit"**: Return mock response `{status: 429, statusText: "Too Many Requests"}` → transcript panel shows "Error: Rate limit: 429 Too Many Requests"

3. **"Simulate Invalid Audio"**: Return mock response `{status: 400, body: {error: "Invalid audio format: unsupported encoding"}}` → transcript panel shows "Error: Invalid audio format: unsupported encoding"

Error simulation buttons should be **hidden in live mode** (only visible when "Enable Live Mode" toggle is OFF). In live mode, errors come from real Groq API responses.

### Data Mode Indicator

Top chrome panel must clearly show which mode is active:

- **Fixture mode** (default): Chip displays "FIXTURE MODE (mock transcript)" with gray border, white text on dark background
- **Live mode** (when "Enable Live Mode" toggle ON): Chip displays "LIVE MODE (real Groq API)" with cyan border, white text on dark background

Data mode chip is always visible (fixed header, center of top chrome panel). The chip color/text must make the current mode visually unmistakable.

### Reset Behavior

When "Reset" button clicked:

- Clear transcript panel (remove all text, hide language badge)
- Clear validation result panel (reset status badge to "Not validated", hide reason text)
- Clear API key input field (if live mode ON)
- Do NOT toggle live mode (leave "Enable Live Mode" toggle in its current state)
- Enable "Transcribe Audio" button (if it was disabled due to invalid key, reset to enabled state based on current mode)

Reset allows the user to start a fresh transcription/validation cycle without reloading the page.

### Browser Compatibility

Target modern desktop browsers (Chrome, Firefox, Safari, Edge). The isolation demo does not need to support mobile browsers or IE11. Use standard fetch API, FormData for multipart/form-data, Blob API for audio.

### Styling

Prefer clean, minimal styling:

- Dark background (e.g., `#1e1e1e`) with light text (white or `#e0e0e0`)
- Buttons: Cyan for primary actions ("Transcribe Audio", "Validate Key"), red for stop actions (none in this demo), gray for secondary actions ("Reset", error simulation buttons)
- Panels: Subtle borders (e.g., `1px solid #444`), padding for readability
- Status badges: Green for valid (`#00cc00`), red for invalid/error (`#cc0000`), gray for neutral (`#888888`)
- Data mode chip: Cyan border for live mode (`#00cccc`), gray border for fixture mode
- Transcript panel: Scrollable, monospace font or clean sans-serif, white text on dark background, red text for errors

Styling is secondary to functionality. Phase 06 can use a simple CSS file or inline styles; no CSS framework required unless already established in the monorepo.
