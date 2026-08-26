# Customer: Isolation Demo (Standing Human Customer)

The Isolation Demo is a standing founder/developer customer that operates transcription-client by itself, without the production PWA.

## Producer's Understanding of This Customer

The Isolation Demo is the package factory floor: a standalone web app that operates transcription-client independently, without depending on the PWA, session-store, capture-engine, volume-analyzer, or playback-engine. It is a permanent human customer that proves the package works in isolation.

### Purpose of the Isolation Demo

The Isolation Demo exists to answer these questions:

1. **Does API key validation work?** Can the package distinguish between valid and invalid Groq API keys, and return clear failure reasons?
2. **Does transcription work?** Can the package send audio to Groq Whisper API and return accurate transcript text?
3. **Does error handling work?** Does the package handle network failures, rate limits, invalid keys, and invalid audio gracefully (return structured errors, not throw exceptions)?
4. **Does retry logic work?** Does the package retry transient errors (network failure, rate limit, server error) with exponential backoff?
5. **Can a founder/developer operate the package without reading code?** Is the demo's UI clear enough that a non-technical user can validate a key and transcribe audio?

The demo operates in **fixture mode by default** (no Groq API key required, no network calls, instant mock transcript). This allows the founder/developer to exercise the package's logic without needing a Groq account or risking API costs. Optionally, the demo can switch to **live mode** (user supplies Groq API key, real HTTP requests to Groq, real transcripts).

### What the Isolation Demo needs from transcription-client

**1. Fixture mode support (default mode)**

Fixture mode must work without any Groq API key or network access. The demo needs:

- **Mock transcript**: When "Transcribe Audio" is clicked in fixture mode, transcription-client must return a hardcoded mock transcript immediately (no HTTP request, no delay). Mock transcript: `"This is a test transcription from fixture audio"`
- **Fixture audio blob**: The demo provides a small MP3 blob (1–2 seconds of silent or synthetic audio). Transcription-client must accept this blob in fixture mode and return the mock transcript
- **Error simulation**: In fixture mode, the demo has three error simulation buttons: "Simulate Network Failure", "Simulate Rate Limit", "Simulate Invalid Audio". When clicked, transcription-client must return the corresponding error without sending a real HTTP request:
  - Network failure → `{error: "Network failure: fetch timeout"}`
  - Rate limit → `{error: "Rate limit: 429 Too Many Requests"}`
  - Invalid audio → `{error: "Invalid audio format: unsupported encoding"}`
- **No validation in fixture mode**: The demo does not call `validateKey` in fixture mode (validation requires a real API key). The validation result panel remains "Not validated" (gray) in fixture mode

**2. Live mode support (optional mode)**

Live mode allows the founder/developer to test transcription-client with a real Groq API key and real network requests. The demo needs:

- **API key input**: The demo has a text input field for entering a Groq API key (e.g., `gsk_...`). The demo calls `validateKey(apiKey)` when the user clicks "Validate Key"
- **Key validation**: `validateKey` must send a real HTTP request to Groq (test endpoint or small audio test) and return `{valid: true}` or `{valid: false, reason: <string>}`. The demo displays the result in the validation result panel: "Valid ✓" (green) or "Invalid ✗" (red) with reason
- **Real transcription**: When "Transcribe Audio" is clicked in live mode (with a valid key), `transcribeAudio` must send a real HTTP request to Groq Whisper API with the fixture audio blob and return the real transcript (not the mock transcript). The demo displays the real transcript in the transcript panel
- **Real errors**: If the key is invalid, or the network is down, or Groq returns an error, `transcribeAudio` must return the real error. The demo displays the error in the transcript panel
- **Retry visibility**: If `transcribeAudio` retries due to network failure or rate limit, the demo may show a spinner with retry progress (e.g., "Transcribing... (attempt 2/4)"). This is optional; the demo can also just show a spinner with no retry count

**3. No storage integration**

The Isolation Demo does NOT call session-store. Transcripts are displayed in the demo's transcript panel only; they are not persisted to IndexedDB. When the user clicks "Reset" or reloads the page, all transcripts are discarded.

The demo operates entirely in-browser memory. No durable data, no IndexedDB, no localStorage (except optionally caching the API key for convenience across page reloads in live mode).

**4. Clear visual feedback**

The demo needs to make the current mode and state visually unmistakable:

- **Data mode chip** (top chrome panel): "FIXTURE MODE (mock transcript)" (gray border) or "LIVE MODE (real Groq API)" (cyan border)
- **Button states**: "Transcribe Audio" is always enabled in fixture mode; in live mode, it is only enabled when the key is valid
- **Validation status**: "Not validated" (gray), "Valid ✓" (green), "Invalid ✗" (red) with reason
- **Transcript panel**: White text for transcripts, red text for errors, language badge (optional) if Groq returns language

### How the Isolation Demo uses transcription-client

**Fixture mode flow** (default):

1. Page loads → data mode chip shows "FIXTURE MODE (mock transcript)" (gray border)
2. "Enable Live Mode" toggle is OFF
3. "Transcribe Audio" button is enabled (cyan)
4. User clicks "Transcribe Audio" → transcription-client returns mock transcript immediately: `"This is a test transcription from fixture audio"`
5. Transcript panel displays mock transcript (white text)
6. User clicks "Simulate Network Failure" → transcription-client returns `{error: "Network failure: fetch timeout"}`
7. Transcript panel displays error (red text): "Error: Network failure: fetch timeout"
8. User clicks "Reset" → transcript panel clears

**Live mode flow**:

1. User toggles "Enable Live Mode" ON → data mode chip changes to "LIVE MODE (real Groq API)" (cyan border)
2. API key input field is enabled
3. User enters Groq API key (e.g., `gsk_abc123...`)
4. User clicks "Validate Key" → transcription-client calls `validateKey(apiKey)` → returns `{valid: true}`
5. Validation result panel displays "Valid ✓" (green)
6. "Transcribe Audio" button is enabled (cyan)
7. User clicks "Transcribe Audio" → transcription-client calls `transcribeAudio(fixtureAudioBlob, apiKey)` → sends real HTTP request to Groq → returns `{text: "...", language: "en"}`
8. Transcript panel displays real transcript (white text), language badge shows "Language: en"
9. User enters invalid API key (e.g., `gsk_invalid123`)
10. User clicks "Validate Key" → transcription-client returns `{valid: false, reason: "Invalid API key"}`
11. Validation result panel displays "Invalid ✗" (red) with reason "Invalid API key"
12. "Transcribe Audio" button is disabled (gray)

**Error handling flow** (live mode, network failure):

1. User has valid key, live mode ON
2. User clicks "Transcribe Audio"
3. Network disconnects (or Groq is down)
4. Transcription-client retries with exponential backoff (1s, 2s, 4s)
5. All retries fail → transcription-client returns `{error: "Network failure"}`
6. Transcript panel displays error (red text): "Error: Network failure"

### Customer assumptions about transcription-client

The Isolation Demo assumes transcription-client will:

1. **Support fixture mode**: Transcription-client must have a way to return mock results without sending real HTTP requests. This may be a build-time flag (e.g., `FIXTURE_MODE=true`), a runtime option (e.g., `createClient({mode: 'fixture'})`), or a separate fixture module. Phase 06 will determine the exact mechanism. The key requirement is that fixture mode works without any network access.

2. **Accept a small audio blob**: The demo provides a tiny MP3 blob (1–2 seconds, 10–50KB). Transcription-client must accept blobs of any size (within Groq's limits; Groq Whisper API accepts files up to 25MB). The demo's fixture audio is intentionally small to keep page load fast.

3. **Return results quickly**: In fixture mode, mock results must return immediately (no artificial delay). In live mode, transcription-client should return within 5 seconds for the fixture audio blob (Groq Whisper is fast for short audio). The demo shows a spinner during transcription, but the user expects results quickly.

4. **Not require external dependencies at demo runtime**: The demo is a standalone HTML+JS web app (or a simple React/Vue/vanilla app, depending on the monorepo's tooling). Transcription-client must be a browser-compatible module (ESM or UMD). No Node.js runtime, no server-side logic. All HTTP requests are fetch-based (standard browser API).

5. **Emit events for telemetry (optional)**: If transcription-client emits events (`transcriptionStarted`, `transcriptionComplete`, `transcriptionFailed`), the demo may display them in an event feed panel (collapsible, bottom of viewport). This is optional; events are not required for the demo to work.

### What the Isolation Demo will NOT ask transcription-client to do

- **Provide UI components**: The demo builds its own UI (panels, buttons, input fields, status badges). Transcription-client is a headless library; it provides functions, not React components or HTML templates.
- **Store or retrieve data**: The demo does not call session-store or any other storage. Transcription-client must not depend on storage integration (no IndexedDB, no localStorage).
- **Capture or play audio**: The demo uses a pre-generated fixture audio blob. Capture-engine and playback-engine are not involved. Transcription-client receives a Blob and returns text; it does not interact with the microphone or audio playback.
- **Decide which audio to transcribe**: The demo always transcribes the same fixture audio blob. Volume-analyzer is not involved. Transcription-client transcribes whatever audio it receives; it does not propose snips or analyze silence.

### Success criteria from the Isolation Demo's perspective

The Isolation Demo considers transcription-client successful if:

1. **Fixture mode works without setup**: A founder/developer can open the demo in a browser, click "Transcribe Audio", and see the mock transcript immediately. No Groq API key required, no network access required, no configuration file.
2. **Live mode works with a valid key**: A founder/developer can toggle "Enable Live Mode" ON, enter their Groq API key, validate it, and transcribe audio. The real transcript appears in the transcript panel.
3. **Error simulation works in fixture mode**: Clicking "Simulate Network Failure" shows a clear error message. Same for rate limit and invalid audio.
4. **Key validation is fast and clear**: In live mode, clicking "Validate Key" completes in 1–5 seconds and shows "Valid ✓" or "Invalid ✗" with a reason.
5. **Errors are human-readable**: Error messages are clear and actionable (e.g., "Invalid API key" tells the user to check their key; "Network failure" tells the user to check their connection).
6. **The demo is self-explanatory**: A founder/developer who has never seen transcription-client can open the demo and understand what it does within 30 seconds. Labels, button names, and panel headings are clear. No need to read code or documentation to operate the demo.

### Visual identity of the Isolation Demo

The Isolation Demo is a **factory floor operating surface**, not a consumer app. It does not need to match the Web Whisper PWA's visual identity (parchment theme, mobile layout, etc.). The demo has its own identity:

- **Layout**: Desktop browser viewport (1200px+ width recommended). Wide horizontal layout with panels side-by-side. Not mobile-responsive (the demo is for founder/developer use, not end users).
- **Theme**: Dark mode (dark background, light text). Clean, minimal styling. No branding, no logo, no decorative elements. Focus is on clarity and functionality.
- **Typography**: Sans-serif font (e.g., system font stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`). Monospace font for transcript text (optional; improves readability).
- **Color palette**: Cyan for primary actions, red for errors, green for success, gray for neutral states. No parchment, no warm tones.

The demo's visual identity is distinct from the PWA's identity. This is intentional: the demo is not a preview of the final app; it is a package validation tool.

## Customer Request

I'm the Isolation Demo for transcription-client. I'm the package factory floor that proves API key validation and audio transcription work correctly, with clear error handling and fixture mode support. Here's what I need:

### Core Requirement: Fixture Mode First (Safe Default)

**Safe default**: Fixture mode (no Groq API key required, no network calls, instant mock transcript).

When demo launches, data mode chip shows "FIXTURE MODE (mock transcript)" (gray border). "Enable Live Mode" toggle is OFF.

In fixture mode:
- Operator clicks "Transcribe Audio" → transcription-client returns mock transcript immediately: `"This is a test transcription from fixture audio"`
- NO HTTP request to Groq
- NO API key required
- Instant result (< 10ms)

This is the safe default because:
- No Groq account required
- No API costs
- Immediate validation (operator can exercise package logic without external dependencies)
- Safe for screenshots/demos (no real API keys exposed)

### Interfaces I Need

**`transcribeAudio(audioBlob, options?)`** (transcribe audio to text)

When I call it: Operator clicks "Transcribe Audio" button

Input:
- `audioBlob: Blob` (fixture MP3 blob, 1–2 seconds, ~10–50 KB)
- `options?: {apiKey?: string, mode?: 'fixture' | 'live', language?: string}` (mode defaults to 'fixture')

Fixture mode output I expect:
```javascript
{
  text: "This is a test transcription from fixture audio",
  language: "en" // optional
}
```

Live mode output I expect (when API key provided + mode='live'):
```javascript
{
  text: "...", // real transcript from Groq
  language: "en" // detected language from Groq
}
```

Failure output I expect:
```javascript
{
  error: "Invalid API key" // or "Network failure" or "Rate limit" or "Invalid audio format"
}
```

How I use it:
- Fixture mode: I call `transcribeAudio(fixtureBlob, {mode: 'fixture'})` → returns mock transcript immediately → I display in transcript panel (white text)
- Live mode: I call `transcribeAudio(fixtureBlob, {mode: 'live', apiKey: userEnteredKey})` → sends real HTTP request to Groq → returns real transcript → I display in transcript panel

Error handling:
- If `error` field exists → I display error in transcript panel (red text): "Error: {error}"
- If `error` is 'Network failure' → I show tooltip: "Check your internet connection"
- If `error` is 'Invalid API key' → I show tooltip: "Check your Groq API key in settings"
- If `error` is 'Rate limit' → I show tooltip: "Groq rate limit exceeded. Wait and retry."

**`validateKey(apiKey)`** (validate Groq API key)

When I call it: Operator enters API key in input field, clicks "Validate Key" button

Input: `apiKey: string` (e.g., `"gsk_abc123..."`)

Output I expect:
```javascript
{
  valid: true
}
// OR
{
  valid: false,
  reason: "Invalid API key" // or "Network failure" or "API key format invalid"
}
```

How I use it:
- I call `validateKey(apiKey)` when operator clicks "Validate Key"
- If `valid: true` → I display validation status: "Valid ✓" (green badge)
- If `valid: false` → I display validation status: "Invalid ✗" (red badge) with reason: "{reason}"
- "Transcribe Audio" button enabled only when `valid: true`

Validation requirement: `validateKey` MUST send real HTTP request to Groq (test endpoint or small audio test) to verify key works. Do NOT just check format (e.g., starts with "gsk_"). Format check is NOT sufficient; key may be revoked or have insufficient permissions.

**Error Simulation Buttons** (fixture mode only):

I need 3 error simulation buttons visible in fixture mode:
- "Simulate Network Failure" button → I call `transcribeAudio(fixtureBlob, {mode: 'fixture', simulateError: 'network_failure'})` → returns `{error: "Network failure: fetch timeout"}`
- "Simulate Rate Limit" button → I call `transcribeAudio(fixtureBlob, {mode: 'fixture', simulateError: 'rate_limit'})` → returns `{error: "Rate limit: 429 Too Many Requests"}`
- "Simulate Invalid Audio" button → I call `transcribeAudio(fixtureBlob, {mode: 'fixture', simulateError: 'invalid_audio'})` → returns `{error: "Invalid audio format: unsupported encoding"}`

How transcription-client supports this:
- If `options.simulateError` is provided in fixture mode → return corresponding error without sending HTTP request
- This allows operator to validate error handling without needing real network failures or invalid audio

### Data Mode Requirements

**Fixture mode** (default):
- Data mode chip: "FIXTURE MODE (mock transcript)" (gray border)
- "Enable Live Mode" toggle OFF
- API key input disabled (grayed out)
- "Validate Key" button disabled
- "Transcribe Audio" button enabled (cyan)
- Error simulation buttons visible
- Validation status: "Not validated" (gray)

**Live mode** (optional):
- Data mode chip: "LIVE MODE (real Groq API)" (cyan border)
- "Enable Live Mode" toggle ON
- API key input enabled (white background)
- "Validate Key" button enabled (cyan)
- "Transcribe Audio" button enabled only after key validated (valid: true)
- Error simulation buttons hidden
- Validation status: "Valid ✓" (green) or "Invalid ✗" (red) or "Not validated" (gray)

### Visual Proof I Need to See

**Fixture mode flow** (operator walkthrough):
1. Page loads → data mode "FIXTURE MODE" (gray)
2. "Transcribe Audio" button enabled
3. Operator clicks "Transcribe Audio" → transcript panel displays: "This is a test transcription from fixture audio" (white text)
4. Operator clicks "Simulate Network Failure" → transcript panel displays: "Error: Network failure: fetch timeout" (red text)
5. Operator clicks "Simulate Rate Limit" → transcript panel displays: "Error: Rate limit: 429 Too Many Requests" (red text)
6. Operator clicks "Simulate Invalid Audio" → transcript panel displays: "Error: Invalid audio format: unsupported encoding" (red text)
7. Proves: fixture mode works, error simulation works, no external dependencies

**Live mode flow** (operator walkthrough):
1. Operator toggles "Enable Live Mode" ON → data mode "LIVE MODE" (cyan)
2. API key input enabled, operator enters key: `gsk_abc123...`
3. Operator clicks "Validate Key" → spinner shows "Validating..."
4. After 1–5s: validation status "Valid ✓" (green)
5. "Transcribe Audio" button enabled
6. Operator clicks "Transcribe Audio" → spinner shows "Transcribing..."
7. After 2–10s: transcript panel displays real transcript from Groq (white text)
8. Language badge shows "Language: en" (if Groq returns language)
9. Proves: live mode works, real Groq API integration works

**Invalid key flow** (live mode):
1. Operator enters invalid key: `gsk_invalid123`
2. Clicks "Validate Key" → spinner shows "Validating..."
3. After 1–5s: validation status "Invalid ✗" (red), reason: "Invalid API key"
4. "Transcribe Audio" button disabled (gray)
5. Proves: key validation catches invalid keys, transcribe button disabled until valid key

**Network failure flow** (live mode, real network error):
1. Operator has valid key, clicks "Transcribe Audio"
2. Network disconnects (or Groq is down)
3. Transcription-client retries with exponential backoff (optional: spinner shows "Retrying... (attempt 2/4)")
4. All retries fail → transcript panel displays: "Error: Network failure" (red text)
5. Proves: network error handling works, retry logic works

### Performance Expectations

- **Fixture mode**: `transcribeAudio` returns < 10ms (instant mock result)
- **Live mode `validateKey`**: 1–5 seconds (real HTTP request to Groq, acceptable latency)
- **Live mode `transcribeAudio`**: 2–10 seconds for fixture audio blob (Groq Whisper is fast for short audio)

If `validateKey` takes > 10 seconds, operator may think demo is frozen. Show spinner + "Validating..." message to indicate progress.

### UI Panels I Need

**Top Chrome Panel** (fixed header):
- Heading: "Transcription Client Isolation Demo"
- Data mode chip: "FIXTURE MODE (mock transcript)" (gray) or "LIVE MODE (real Groq API)" (cyan)
- "Enable Live Mode" toggle (checkbox or switch)

**Control Panel** (left third):
- API key input (text field, disabled in fixture mode, enabled in live mode)
- "Validate Key" button (disabled in fixture mode, enabled in live mode)
- Validation status: "Not validated" (gray) or "Valid ✓" (green) or "Invalid ✗" (red) with reason
- "Transcribe Audio" button (enabled in fixture mode, enabled in live mode only after valid key)
- Error simulation buttons (visible in fixture mode only):
  - "Simulate Network Failure" (gray)
  - "Simulate Rate Limit" (gray)
  - "Simulate Invalid Audio" (gray)
- "Reset" button (gray, always enabled, clears transcript panel)

**Transcript Panel** (right two-thirds):
- Heading: "Transcript"
- White text for transcripts
- Red text for errors
- Language badge (optional): "Language: en" (if Groq returns language)
- If empty: "No transcript yet. Click Transcribe Audio."

### Error Handling Expectations

Transcription-client MUST return error objects (NOT throw exceptions) so I can display error messages gracefully.

Error codes I need to handle:
- `'invalid_api_key'` → "Invalid API key. Check your Groq API key."
- `'network_failure'` → "Network failure. Check your internet connection."
- `'rate_limit'` → "Rate limit exceeded. Wait and retry."
- `'invalid_audio'` → "Invalid audio format. Unsupported encoding."
- `'groq_error'` → "Groq API error: {detail}" (catch-all for Groq-specific errors)

All errors include error code + optional detail. I display error in transcript panel (red text) + log to browser console for debugging.

### What I Do NOT Need

- I do NOT need session-store integration (I operate on fixture audio blob in memory)
- I do NOT need capture logic (capture-engine's job; I use pre-generated fixture blob)
- I do NOT need volume analysis (volume-analyzer's job)
- I do NOT need playback (playback-engine's job; I may display waveform, but playback not required)
- I do NOT need snip selection (PWA's job; I transcribe single fixture blob)

### Fixture Audio Blob

I provide a small fixture MP3 blob (1–2 seconds, ~10–50 KB). Options:
- Pre-recorded MP3 file bundled with demo (e.g., "Hello world" speech sample)
- OR silent MP3 blob generated at runtime (silent audio is acceptable; transcription may return empty text or "No speech detected")

Fixture blob MUST be valid MP3 format (Groq Whisper API accepts MP3). If blob is corrupt or unsupported format, `transcribeAudio` should return `{error: 'invalid_audio'}`.

### Optional: Retry Progress Display

If transcription-client implements retry logic with exponential backoff, I may display retry progress:
- Spinner text: "Transcribing..." (attempt 1)
- After first retry: "Retrying... (attempt 2/4)"
- After second retry: "Retrying... (attempt 3/4)"
- After third retry: "Retrying... (attempt 4/4)"
- After final retry fails: Error displayed

This is optional; spinner with "Transcribing..." (no retry count) is acceptable.

### Summary of Interfaces

| Interface | Input | Output | Failure Result |
|-----------|-------|--------|----------------|
| `transcribeAudio(audioBlob, options?)` | audioBlob (Blob), options ({apiKey?, mode?, language?, simulateError?}) | `{text: string, language?: string}` | `{error: string}` |
| `validateKey(apiKey)` | apiKey (string) | `{valid: boolean, reason?: string}` | N/A (validation result always returned, never throws) |

All errors returned as structured objects (NOT thrown exceptions). Fixture mode works without Groq API key or network access.

## Producer Response

(To be filled by Phase 05 producer-response agent for transcription-client)

Transcription-client will respond here: how it will meet the isolation-demo's request, what interfaces it will expose for demo use, what data modes it supports (fixture by default, optionally live with real Groq API), and how the demo proves the package works independently.
