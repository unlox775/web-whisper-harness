Spec Status: unresolved
Spec Type: initial-product-spec
Created: 2026-08-26T15:20:37Z
Product: packages/lib/transcription-client

# Transcription Client — Product Spec

## Product Type and Data Ownership

This product lives under `packages/lib/`. Lib packages own behavior, not durable data.

**Data ownership**: This package **owns no durable data**. Session-store owns all transcripts. This package provides the Groq API interface: validates keys, sends audio, returns text. The PWA writes the returned text to session-store after this client completes.

## Product Goal

Provide a Groq Whisper API client that validates API keys and transcribes audio snips. This package handles the network boundary with Groq: HTTP calls, retries, error handling, and response formatting. It does NOT capture audio, analyze volume, select snips, or store transcripts. Those are upstream (capture-engine, volume-analyzer) or downstream (session-store) responsibilities.

The product makes transcription available to the PWA when a valid Groq API key is present. When no key is available or the key is invalid, the product reports that clearly without throwing exceptions. The PWA remains a working recorder even when transcription is disabled.

## Boundary

**Owns:**

- **Groq API key validation**: HTTP call to test the key before transcription (see validation strategy below)
- **Audio transcription**: Sends MP3 audio blob to Groq Whisper endpoint `https://api.groq.com/openai/v1/audio/transcriptions`
- **Retry logic**: Network failures and rate limits handled with exponential backoff (see retry strategy below)
- **Transcript formatting**: Extracts plaintext from Groq JSON response; optionally returns detected language
- **Error handling**: Distinguishes recoverable errors (network failure, rate limit) from permanent errors (invalid key, invalid audio format) and returns structured error results

**Does NOT own:**

- **Audio capture**: capture-engine owns microphone-to-chunk pipeline
- **Volume analysis**: volume-analyzer owns snip proposal logic
- **Snip selection**: PWA decides which snips to transcribe based on volume profiles
- **Audio playback**: playback-engine owns session/chunk/snip playback
- **Storage authority**: session-store owns all durable data; PWA writes transcripts after this client returns text

## Main Callable Interfaces

All interfaces use planning names (not frozen TypeScript APIs). Phase 06 implementation agent will determine final function signatures, TypeScript types, and module export structure.

### `validateKey(apiKey)`

**Purpose**: Test whether a Groq API key is valid before attempting transcription.

**Input:**
- `apiKey` (string): Groq API key (format `gsk_...` for Groq keys)

**Output:**
- Success: `{valid: true}`
- Failure: `{valid: false, reason: string}`
  - Example reasons: `"Invalid API key"`, `"Network error"`, `"Key format incorrect"`, `"Groq service unavailable"`

**Caller:** PWA settings screen (when user inputs key or clicks "Validate" or "Save")

**Store read or changed:** None (validation is read-only; no IndexedDB interaction)

**Failure result:** Returns `{valid: false, reason: <string>}`. Does NOT throw exception. PWA displays red indicator with reason in Settings.

**Validation strategy:** Send a minimal validation request to Groq (either a test endpoint if Groq provides one, or a small "silent" audio test transcription with a tiny fixture MP3 blob). Check HTTP status: 200/201 → valid, 401/403 → invalid key, 5xx → service unavailable (treat as potentially temporary), timeout → network error. Phase 06 will determine the exact strategy based on Groq API documentation and cost/latency trade-offs. Prefer zero-cost validation if Groq provides a test endpoint; fallback to minimal audio test if required.

**Events emitted:** `keyValidationComplete(valid, reason?)` (telemetry only; see Events section below)

---

### `transcribeAudio(audioBlob, apiKey)`

**Purpose**: Send audio to Groq Whisper API and return transcription text.

**Input:**
- `audioBlob` (Blob): MP3 audio data (snip audio assembled from chunks; typically 4–60 seconds per snip)
- `apiKey` (string): Groq API key (already validated by caller, but this function must handle invalid keys gracefully if called with an expired or revoked key)

**Output:**
- Success: `{text: string, language?: string}`
  - `text`: Transcribed plaintext (UTF-8, no markdown formatting)
  - `language`: ISO 639-1 language code if Groq returns it (e.g., `"en"`, `"es"`); optional field
- Failure: `{error: string}`
  - Example errors: `"Network failure"`, `"Rate limit exceeded"`, `"Invalid API key"`, `"Invalid audio format"`, `"Groq service unavailable"`

**Caller:** PWA transcription flow (per snip; PWA loops over snips and calls `transcribeAudio` for each)

**Store changed:** None. This function only performs HTTP request and returns result. PWA is responsible for writing transcript to session-store via `session-store.writeTranscript(snipId, text)` after this function returns successfully.

**Failure result:** Returns `{error: <string>}`. Does NOT throw exception. PWA handles error by marking the snip's transcript as failed and continuing with the next snip. If the error is `"Invalid API key"` or `"Rate limit exceeded"`, PWA may choose to stop transcription for remaining snips and show a global error.

**HTTP request details:**
- Endpoint: `https://api.groq.com/openai/v1/audio/transcriptions`
- Method: `POST`
- Headers:
  - `Authorization: Bearer <apiKey>`
  - `Content-Type: multipart/form-data`
- Body (multipart/form-data):
  - `file`: audio blob (MP3)
  - `model`: `whisper-large-v3` (or current Groq-recommended Whisper model; Phase 06 will verify the exact model name)
  - `response_format`: `json` (default; returns `{text: "...", language: "..."}`)
  - Optional: `temperature`, `language` (if caller wants to hint the expected language; leave unspecified by default for auto-detection)

**Response parsing:**
- Success (HTTP 200): Parse JSON body `{text: string, language?: string}`, return `{text, language}`
- Error (HTTP 400): Invalid audio format or invalid request parameters → return `{error: "Invalid audio format"}`
- Error (HTTP 401/403): Invalid or expired API key → return `{error: "Invalid API key"}`
- Error (HTTP 429): Rate limit → retry with exponential backoff (see retry strategy below); if retries exhausted, return `{error: "Rate limit exceeded"}`
- Error (HTTP 5xx): Groq service error → retry with exponential backoff; if retries exhausted, return `{error: "Groq service unavailable"}`
- Error (network timeout or fetch failure): Network error → retry with exponential backoff; if retries exhausted, return `{error: "Network failure"}`

**Retry strategy:**
- **Retryable errors**: Network timeout, HTTP 429 (rate limit), HTTP 5xx (server error)
- **Non-retryable errors**: HTTP 400 (invalid audio), HTTP 401/403 (invalid key)
- **Backoff schedule**: 1s, 2s, 4s (exponential backoff; max 3 attempts total = 1 initial + 2 retries)
- **Timeout**: 30s per request (Groq Whisper typically responds in 1–5 seconds for short snips; 30s is a safe upper bound)

**Events emitted:** `transcriptionStarted(snipId, audioDuration)`, `transcriptionComplete(snipId, textLength, language)`, `transcriptionFailed(snipId, error, retryCount)` (telemetry only; see Events section below)

## Interface Inventory

| **Interface** | **Caller** | **Input** | **Output** | **Store Changed** | **Failure Result** |
|---------------|------------|-----------|------------|-------------------|--------------------|
| `validateKey(apiKey)` | PWA settings screen | API key string | `{valid: boolean, reason?: string}` | None | `{valid: false, reason: string}` |
| `transcribeAudio(audioBlob, apiKey)` | PWA transcription flow | Audio blob (MP3), API key | `{text: string, language?: string}` or `{error: string}` | None (PWA writes to session-store) | `{error: string}` |

## Events and Telemetry

This package emits events for telemetry and debugging. Events are NOT required for normal operation (the PWA does not block on event listeners; events are for developer-mode logging and future analytics).

**Event emitter pattern**: Phase 06 will determine the exact event mechanism (e.g., EventEmitter, callback registration, or async iterators). The key requirement is that events are optional: if no listener is registered, the package still works.

**Events:**

1. **`keyValidationComplete(valid, reason?)`**
   - Emitted when `validateKey` completes (success or failure)
   - Fields: `valid` (boolean), `reason` (string, only present when `valid: false`)
   - Use case: Developer-mode logging, Settings screen status indicator

2. **`transcriptionStarted(snipId, audioDuration)`**
   - Emitted when `transcribeAudio` begins HTTP request
   - Fields: `snipId` (string, caller-provided identifier), `audioDuration` (number, seconds)
   - Use case: Developer-mode progress indicator, analytics

3. **`transcriptionComplete(snipId, textLength, language)`**
   - Emitted when `transcribeAudio` succeeds
   - Fields: `snipId`, `textLength` (number, characters), `language` (string, ISO 639-1 code or null)
   - Use case: Developer-mode logging, analytics

4. **`transcriptionFailed(snipId, error, retryCount)`**
   - Emitted when `transcribeAudio` fails (after retries exhausted)
   - Fields: `snipId`, `error` (string), `retryCount` (number, how many retries attempted)
   - Use case: Developer-mode logging, error analytics

## Customer Assumptions

This package assumes its customers (PWA and Isolation Demo) will:

1. **Validate keys before transcription**: PWA should call `validateKey` in Settings before allowing the user to enable transcription. However, `transcribeAudio` must still handle invalid keys gracefully (in case a key expires or is revoked between validation and transcription).

2. **Assemble snip audio before calling**: PWA is responsible for assembling snip audio from chunks (via session-store.getChunksForSession with snip's chunk references). This package receives a single audio blob per snip, not individual chunks.

3. **Write transcripts after success**: PWA is responsible for calling `session-store.writeTranscript(snipId, text)` after `transcribeAudio` returns successfully. This package does not touch session-store.

4. **Handle per-snip failures gracefully**: If `transcribeAudio` returns `{error: string}` for one snip, PWA should mark that snip as failed and continue with the next snip (not abort the entire transcription flow).

5. **Respect rate limits**: If `transcribeAudio` returns `{error: "Rate limit exceeded"}`, PWA may choose to pause transcription for remaining snips and show a "retry later" message. Groq free-tier rate limits are generous (Dave has not hit them in production use), but the failure mode must be clear.

6. **Provide MP3 audio only**: This package expects MP3 blobs (Groq Whisper supports MP3, WAV, FLAC, and others; Web Whisper uses MP3 throughout). If a caller provides a different format, Groq will return HTTP 400, and this package will return `{error: "Invalid audio format"}`. Phase 06 may add format detection or conversion if needed, but initial implementation assumes MP3.

## Validation Steps

Phase 06 implementation agent must validate this package before marking the spec resolved. Validation checklist:

1. **Fixture mode validation** (Isolation Demo, no Groq API key required):
   - Load isolation-demo in browser (desktop viewport)
   - Verify default mode is "FIXTURE MODE (mock transcript)"
   - Click "Transcribe Audio" → verify mock transcript appears immediately: "This is a test transcription from fixture audio"
   - Click "Simulate Network Failure" → verify error appears: "Error: Network failure: fetch timeout"
   - Click "Simulate Rate Limit" → verify error appears: "Error: Rate limit: 429 Too Many Requests"
   - Click "Simulate Invalid Audio" → verify error appears: "Error: Invalid audio format: unsupported encoding"
   - Click "Reset" → verify transcript clears

2. **Live mode validation** (Isolation Demo, real Groq API key required):
   - Toggle "Enable Live Mode" ON
   - Enter valid Groq API key (from founder's account: `gsk_...`)
   - Click "Validate Key" → verify validation result panel shows "Valid ✓" (green)
   - Click "Transcribe Audio" → verify real transcript appears (not mock transcript; transcription of the fixture audio file)
   - Verify language badge appears (e.g., "Language: en")
   - Enter invalid Groq API key (e.g., `gsk_invalid123`)
   - Click "Validate Key" → verify validation result panel shows "Invalid ✗" (red) with reason
   - Click "Transcribe Audio" → verify error appears: "Error: Invalid API key"

3. **Retry logic validation** (manual network simulation or Groq rate limit testing):
   - In live mode, simulate network failure (e.g., disconnect network, or use browser DevTools to throttle/offline)
   - Click "Transcribe Audio" → verify error after retries: "Error: Network failure"
   - Verify retry count in event feed (if developer mode): `transcriptionFailed(snipId, error="Network failure", retryCount=2)`

4. **PWA integration validation** (after Phase 06 builds the PWA; not part of this package's isolated validation):
   - PWA Settings: Enter valid key, verify green "Valid ✓" indicator
   - PWA Settings: Enter invalid key, verify red "Invalid ✗" indicator with reason
   - PWA session detail: Record short session, click "Transcribe", verify transcripts appear
   - PWA session detail: Disconnect network, click "Transcribe", verify error message (not crash)

## First Implementation Checklist

Phase 06 implementation agent should follow this checklist:

- [ ] **Create package structure**: `src/`, `tests/`, `package.json`, `tsconfig.json` (or equivalent; see other packages for structure)
- [ ] **Implement `validateKey(apiKey)`**:
  - [ ] Send HTTP request to Groq validation endpoint (or small audio test)
  - [ ] Handle 200 → valid, 401/403 → invalid, 5xx → service unavailable, timeout → network error
  - [ ] Return `{valid: boolean, reason?: string}`
  - [ ] Emit `keyValidationComplete` event
- [ ] **Implement `transcribeAudio(audioBlob, apiKey)`**:
  - [ ] Send multipart/form-data POST to `https://api.groq.com/openai/v1/audio/transcriptions` with `Authorization: Bearer <apiKey>`, `file: <blob>`, `model: whisper-large-v3`
  - [ ] Parse JSON response `{text, language}`
  - [ ] Handle errors: 400 → invalid audio, 401/403 → invalid key, 429 → rate limit, 5xx → service error, timeout → network failure
  - [ ] Implement retry logic: exponential backoff (1s, 2s, 4s) for retryable errors (429, 5xx, network)
  - [ ] Return `{text, language}` or `{error}`
  - [ ] Emit `transcriptionStarted`, `transcriptionComplete`, `transcriptionFailed` events
- [ ] **Create fixture audio**: Small MP3 blob (1–2s silent audio or synthetic "test" speech) for Isolation Demo
- [ ] **Build Isolation Demo** (see `isolation-demo/README.md` for full panel layout):
  - [ ] Fixture mode (default): Mock transcript "This is a test transcription from fixture audio"
  - [ ] Live mode toggle: Enable real Groq API with user-supplied key
  - [ ] API key input and "Validate Key" button (live mode only)
  - [ ] "Transcribe Audio" button (fixture mode always enabled; live mode enabled when key valid)
  - [ ] Error simulation buttons (fixture mode only): "Simulate Network Failure", "Simulate Rate Limit", "Simulate Invalid Audio"
  - [ ] Validation result panel: "Not validated", "Valid ✓", "Invalid ✗" with reason
  - [ ] Transcript panel: Shows transcript text or error message
  - [ ] Language badge (optional, only when Groq returns language)
- [ ] **Write unit tests** (if test framework is established):
  - [ ] Test `validateKey` with mock fetch: valid key, invalid key, network error, service unavailable
  - [ ] Test `transcribeAudio` with mock fetch: success, invalid key, rate limit, network error, retry logic
  - [ ] Test retry backoff schedule (1s, 2s, 4s intervals)
  - [ ] Test response parsing: extract `text` and `language` from Groq JSON
- [ ] **Manual validation**: Run through validation checklist above (fixture mode, live mode, retry logic)
- [ ] **Mark spec resolved**: Update this spec's status to `Spec Status: resolved` and add Resolution section

## Isolation Demo

See `isolation-demo/README.md` for complete panel-based layout and implementation notes.

**Summary**: The Isolation Demo is a web app (desktop browser viewport, launched via `cd packages/lib/transcription-client/isolation-demo && npm start`). It operates in **fixture mode by default** (no Groq API key required, no network calls, instant mock transcript: "This is a test transcription from fixture audio"). Optionally, it can switch to **live mode** (user supplies Groq API key, real HTTP requests to Groq, real transcripts).

The demo proves:
- API key validation works (valid key → green "Valid", invalid key → red "Invalid" with reason)
- Transcription works (fixture mode → mock transcript; live mode → real transcript from Groq)
- Error handling works (fixture mode → simulate network failure, rate limit, invalid audio; live mode → real errors)
- Retry logic works (visible in event feed or transcript panel "Retrying..." indicator)

## Customer Relationships

Customers of transcription-client:

1. **`apps/web-whisper-pwa`** (primary customer; see `customers/web-whisper-pwa.md`):
   - PWA calls `validateKey` in Settings screen
   - PWA calls `transcribeAudio` per snip in session detail screen
   - PWA writes transcripts to session-store after transcribeAudio returns

2. **Isolation Demo** (standing human customer; see `customers/00-isolation-demo.md`):
   - Founder/developer operates transcription-client independently
   - Exercises API key validation and transcription in fixture mode (safe default) or live mode (real Groq API)
   - Proves package works without depending on PWA or session-store

Customer request sections will be filled by Phase 04 customer-request agents. Producer response sections will be filled by Phase 05 producer-response agent.
