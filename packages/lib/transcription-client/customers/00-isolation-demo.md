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

(To be filled by Phase 04 customer-request agent for isolation-demo → transcription-client)

The isolation-demo customer will write its request here: what interfaces it needs from transcription-client (`validateKey`, `transcribeAudio`), what inputs it will provide (fixture audio blob or real audio, API key for live mode), what outputs it expects (transcript text, error messages), and what validation it needs to see to trust the package.

## Producer Response

(To be filled by Phase 05 producer-response agent for transcription-client)

Transcription-client will respond here: how it will meet the isolation-demo's request, what interfaces it will expose for demo use, what data modes it supports (fixture by default, optionally live with real Groq API), and how the demo proves the package works independently.
