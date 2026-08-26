Spec Status: resolved
Spec Type: product-spec
Created: 2026-08-26T15:20:37Z
Updated: 2026-08-26 (Phase 03 expansion, Phase 06 implementation)
Product: apps/web-whisper-pwa
Resolved: 2026-08-26 (Phase 06 first implementation)

# Web Whisper PWA — Product Spec

## Product Type and Data Ownership

**Product Type**: Progressive Web App (runnable application)

The PWA is an **app** under `apps/`, not a package. Apps are runnable products that deliver direct user value. The PWA owns:

- **Navigation**: Screen routing, modal overlays, back navigation
- **UI screens**: Home/session list, recording UI, session detail, settings, developer console
- **Platform permissions**: Microphone access via browser APIs
- **Settings persistence**: Stores user preferences in localStorage
- **Orchestration**: Coordinates lib packages and session-store to deliver complete user workflows

**Durable Data Ownership**: The PWA does NOT own any durable session/chunk/snip/transcript data. All session-related data is owned by `packages/datastore/session-store`. The PWA only owns:

- **Settings in localStorage**: `groq_api_key`, `storage_cap_mb`, `developer_mode_enabled`
- **UI state** (transient, not persisted): current screen, playback position, modal visibility

The PWA is the integration point and primary customer of all packages.

---

## Product Goals

1. **Make long-form recording on a phone trustworthy**: Start recording with one tap, persist audio as it captures (not at the end), stop and have a playable session
2. **Provide immediate playback**: Sessions, chunks (developer mode), and snips (developer mode) are playable as proof of durability
3. **Enable optional transcription**: With a Groq API key, snips can be transcribed; without a key, the app is still a working recorder
4. **Stay calm and honest**: No spinner as if transcription failed when the user never entered a key; recording should feel immediate and durable
5. **Gate diagnostics appropriately**: Developer tools (chunk counts, volume histograms, doctor JSON) behind developer mode, not on the default home screen

---

## Product Boundaries

### Owns

- UI screens and navigation
- Microphone permission requests (browser MediaDevices API)
- Settings persistence (localStorage: `groq_api_key`, `storage_cap_mb`, `developer_mode_enabled`)
- Orchestration of lib packages (calling capture-engine, volume-analyzer, transcription-client, playback-engine)
- Session-store integration (calling all session-store interfaces)
- User feedback (toasts, error messages, loading states)
- Developer mode gating (checkbox in Settings, 🐞 icon visibility)

### Does NOT Own

- Capture logic (capture-engine owns microphone → PCM → MP3 encoding)
- Volume analysis (volume-analyzer owns volume profile computation and snip proposal)
- Transcription logic (transcription-client owns Groq API key validation and transcription requests)
- Playback logic (playback-engine owns audio playback from chunks)
- Durable data authority (session-store owns all sessions, chunks, volume profiles, snips, transcripts)

---

## Target Runtime

- **Runtime**: Progressive Web App for iPhone
- **Device**: iPhone (12/13/14/15 size class, ~390px wide viewport, portrait orientation)
- **Platform**: iOS Safari PWA (Add to Home Screen, full-screen mode, no Safari chrome)
- **Launch command**: `npm start` (local dev server for testing)
- **Deployment**: Static build deployed to GitHub Pages or similar, user opens URL in iOS Safari → Share → Add to Home Screen → Launch from home screen icon

---

## Customer Assumptions

**The end user**: iPhone user who needs to record, play back, and transcribe audio.

**User jobs**:

1. **Start recording** a lecture, meeting, or dictation with one tap
2. **Trust the recording** is durable even if the page hiccups (chunks persist as they encode)
3. **Play back** the session to verify the recording exists
4. **Transcribe** useful parts into text (optional, requires Groq API key)
5. **Manage storage** by setting a cap so the phone doesn't fill forever
6. **Diagnose issues** (secondary, developer mode only) when capture or transcription behaves unexpectedly

**Assumptions**:

- User has an iPhone (primary target device)
- User will install the PWA to home screen (better permission retention, full-screen experience)
- User may or may not have a Groq API key (transcription is optional, recording works without it)
- User is willing to grant microphone permission (iOS will re-prompt PWAs after cold start; this is platform behavior, not a product failure)
- User expects playback as proof of durability (if you can't play it, you didn't record it)

---

## Screen-by-Screen UI Specification

### Visual Design Baseline

All screens preserve the visual identity from the live PWA at https://unlox775.github.io/web-whisper/:

- **Background**: Dark navy-black `#0a0f18`
- **Card background**: Lighter dark `#111a26`
- **Border radius**: 16–20px on all cards, buttons, inputs
- **Primary accent**: Cyan/teal `#22d3ee` (links, ENABLE chip, active states)
- **Text primary**: White or near-white
- **Text secondary**: Light gray (metadata, help text)
- **Gradient CTA**: Cyan-to-blue gradient on "Start recording" button
- **Typography**: System font (San Francisco on iOS), bold headings, regular body
- **Touch targets**: Minimum 44×44pt for all interactive elements

---

### Screen 1: Home / Session List

**What the user sees**:

**Header (fixed top)**:

- Left: Bold "Web Whisper" title (white text, ~20px, semibold)
- Center-right: DATA chip showing storage usage "0 B / 200 MB" (dark card background `#111a26`, light text, rounded, compact)
- Right of DATA chip: 🐞 bug icon button (ONLY visible when developer mode is enabled in Settings; taps to open Developer Console)
- Top-right: "Settings" button (text button, cyan `#22d3ee`, clickable)

**Main scroll area** (vertically scrollable):

1. **Onboarding card** (dismissible, shown on first use or until dismissed):
   - Dark card background `#111a26`, rounded corners 16–20px, subtle 1px bluish border
   - Top-right: "Dismiss" button (small, gray text, closes card)
   - Bold heading: "Transcription setup is insanely easy." (white, ~18px)
   - Body text: "Groq is a separate service (not this app). Their free account takes about a minute to set up, and this app auto-checks your key after you paste it."
   - Cyan-bordered callout box: "This uses one of the most amazing AI models. It is a crazy amount of value for free." (cyan `#22d3ee` border, darker background, white text)
   - Numbered steps (light gray, ~14px):
     - "1. Create a free Groq account at console.groq.com"
     - "2. Open Settings and paste your API key"
     - "3. We auto-check your key and enable transcription"
   - Bottom actions: "Open Settings" and "Get Groq API key" links (cyan `#22d3ee`, clickable)

2. **CAPTURE card**:
   - Dark card background `#111a26`, rounded corners 16–20px
   - Heading: "CAPTURE" (light gray, small, uppercase)
   - Full-width cyan-to-blue gradient button: "Start recording" (pill shape, bold white text, prominent, ~48px height)
   - Status line below button: "Recorder idle — tap start to begin a durable session." (light gray, ~13px, centered)

3. **Session list section**:
   - If no sessions: Empty card (dark card background `#111a26`, rounded corners, just an empty rounded container, no "No sessions yet" text in baseline)
   - If sessions exist: List of session cards (one per session, newest at top):
     - Each session card:
       - Dark card background `#111a26`, rounded corners 16–20px, subtle 1px bluish border
       - Top row: Session timestamp "Today at 3:45 PM" or "Jan 15, 2026 at 10:23 AM" (white, ~16px, bold)
       - Second row: Duration "2:15" (light gray, ~14px), transcription status "7 of 8 snips transcribed" (light gray, ~14px, if transcribed)
       - Bottom row: "Play" button (cyan text, inline), "Delete" button (red text, inline, right-aligned)
       - Tap anywhere on card (except buttons) → Navigate to Session Detail

**Layout**:

- Fixed header at top (always visible)
- Scrollable main area (onboarding card + CAPTURE card + session list)
- No FAB (floating action button); "Start recording" is inline in CAPTURE card
- Generous padding around cards (16px between cards, 16px from screen edges)

**Interactions**:

- Tap "Start recording" → Navigate to Recording UI (or show recording state in-place)
- Tap session card → Navigate to Session Detail
- Tap "Play" on session card → Navigate to Session Detail and auto-play
- Tap "Delete" on session card → Show confirmation modal ("Delete this session? This cannot be undone.") → If confirmed, call `session-store.deleteSession(sessionId)` → Remove card from list
- Tap "Settings" → Show Settings modal overlay
- Tap 🐞 (if developer mode enabled) → Show Developer Console modal overlay
- Tap "Dismiss" on onboarding card → Hide card (set `localStorage.onboarding_dismissed = "true"`)

**Question this screen answers**: "What sessions do I have? Can I start a new recording?"

**Main controls**:

- "Start recording" button (primary CTA)
- Session card "Play" and "Delete" buttons (per-session actions)
- "Settings" button (header, always accessible)
- 🐞 bug icon (header, conditional on developer mode)

**What changes after main action** (Tap "Start recording"):

- Navigate to Recording UI (full-screen or modal)
- CAPTURE card status line changes from "Recorder idle" to "Recording in progress" (or card is replaced by recording UI)

---

### Screen 2: Recording (Active)

**What the user sees**:

- Full-screen or near-full-screen recording UI (minimal chrome)
- Background: Same dark navy-black `#0a0f18`
- Center content (vertical stack):
  - Recording indicator: Pulsing cyan circle (animated, `#22d3ee`, ~16px diameter) + "Recording" label (white, ~14px, next to circle)
  - Duration counter: Large, prominent, live-updating (white, ~48px, bold, "0:00", "0:01", "0:02"..., "1:23", MM:SS format)
  - Stop button: Large, centered, red background `#ef4444`, white text "Stop Recording", rounded pill, ~56px height, ~80% screen width, easy to hit
  - Optional (if developer mode enabled): Chunk count display below duration counter (light gray, ~14px, "7 chunks", updates live as chunks encode every ~4s)
  - Optional (if developer mode enabled): Buffer size meter below chunk count (light gray, ~12px, "Buffer: 2048 samples", or small progress bar showing PCM buffer fill)

**Layout**:

- Centered vertical stack (duration counter is focal point, large and bold)
- Stop button is prominent, easy to reach with thumb (lower third of screen)
- Optional developer metrics are secondary (smaller, light gray, below primary controls)

**Interactions**:

- Tap "Stop Recording" → Call `capture-engine.stopCapture(handle)` → Navigate to Session Detail for new session (or back to Home with new session at top of list)
- Duration counter updates every ~100ms based on PWA's local timer (or event from capture-engine if available)
- Chunk count increments every ~4s as capture-engine emits `chunkEncoded` event
- No Cancel or Pause in Phase 01 (recording is start-to-stop, no interruption)

**Question this screen answers**: "Is my recording active? How long have I been recording?"

**Main controls**:

- "Stop Recording" button (only control)

**What changes after main action** (Tap "Stop Recording"):

- Recording stops
- Navigate to Session Detail for the new session (or back to Home with new session card at top of list)
- Session is ready to play (or honestly marked as "completed without playable audio" if watchdog timeout or no chunks)

**Error states**:

- **Microphone permission denied**: Show error modal "Microphone permission denied. Please allow microphone access in iOS Settings → Safari → Web Whisper → Microphone." with "OK" button → Navigate back to Home
- **Microphone ghost** (granted permission but no audio arrives): After 10s timeout, capture-engine stops itself and returns `{hasAudio: false}` → PWA navigates to Session Detail with status "Completed without playable audio" (no spinner, honest message)

---

### Screen 3: Session Detail

**What the user sees**:

**Header (fixed top)**:

- Left: Back button "← Sessions" (cyan `#22d3ee`, text button, navigates to Home)
- Center: Session timestamp as title "Today at 3:45 PM" (white, ~18px, bold)

**Main scroll area** (vertically scrollable):

1. **Metadata section**:
   - Dark card background `#111a26`, rounded corners 16–20px, padding 16px
   - Row 1: "Duration" label (light gray, ~13px) + "2:15" value (white, ~16px, bold)
   - Row 2: "Recorded" label (light gray, ~13px) + "Jan 15, 2026 at 10:23 AM" value (white, ~16px)
   - Row 3 (if session marked as no audio): "Status" label (light gray) + "Completed without playable audio" (red, ~14px, warning tone)

2. **Playback section**:
   - Dark card background `#111a26`, rounded corners 16–20px, padding 16px
   - Heading: "PLAYBACK" (light gray, small, uppercase)
   - If not playing:
     - "Play Session" button (cyan-to-blue gradient, full-width pill, bold white text, ~48px height)
   - If playing:
     - Playback controls:
       - Top: Seek bar (horizontal slider, cyan `#22d3ee` fill, gray track, ~8px height, thumb at current position)
       - Below seek bar: Current time / Total duration (light gray, ~13px, "0:45 / 2:15")
       - Bottom: Play/Pause button (cyan circle icon, ~48px, center), 15s backward button (gray icon, left), 15s forward button (gray icon, right)
   - If session has no audio (status = "Completed without playable audio"):
     - "Play Session" button is disabled (gray, not clickable) with help text "This session has no playable audio." (light gray, ~12px, below button)

3. **Transcription section** (conditional on transcription status):
   - Dark card background `#111a26`, rounded corners 16–20px, padding 16px
   - Heading: "TRANSCRIPTION" (light gray, small, uppercase)

   **Case A: Transcription disabled (no Groq key)**:
   - Message: "Transcription disabled. Add API key in Settings." (light gray, ~14px)
   - "Open Settings" link (cyan `#22d3ee`, clickable, navigates to Settings modal)

   **Case B: Transcription enabled, not yet transcribed**:
   - "Transcribe Session" button (cyan-to-blue gradient, full-width pill, bold white text, ~48px height)

   **Case C: Transcription in progress**:
   - Progress indicator:
     - Spinner (cyan `#22d3ee`, ~24px, animated) + status text "Analyzing volume..." or "Transcribing..." (light gray, ~14px, next to spinner)
     - Progress bar: "3 / 8 snips transcribed" (light gray, ~13px, below status text)
     - Horizontal progress bar (cyan fill, gray track, ~8px height, 3/8 = 37.5% filled)

   **Case D: Transcription complete**:
   - Full session transcript (white text, ~15px, line-height 1.5, scrollable if long, max-height 50vh):
     - Concatenated snip texts with optional timestamps (e.g., "[0:00] This is the first snip text. [0:12] This is the second snip text.")
     - Or: Organized by snip with headings (e.g., "Snip 1 (0:00 – 0:12): This is the first snip text.")
   - "Copy Transcript" button (cyan `#22d3ee` border, white text, rounded pill, ~44px height, full-width, below transcript text)
   - Optional: "Download Transcript" button (secondary, gray border, white text, below "Copy Transcript")

   **Case E: Transcription partially failed**:
   - Message: "7 of 8 snips transcribed. 1 failed." (orange `#f59e0b`, ~14px)
   - Transcript text for successful snips (same as Case D, but with note "[Snip 5 failed to transcribe]" inline where failure occurred)
   - "Retry Failed" button (cyan text, inline link, below message, retries only the failed snips)

4. **Actions section** (bottom of screen or in overflow menu):
   - "Delete Session" button (destructive, red `#ef4444` text, text button, bottom-left)
   - Optional: "Download Audio" button (cyan text, text button, bottom-right, downloads session MP3 concatenated from chunks)

**Developer Mode Additions** (conditional, only if developer mode enabled in Settings):

5. **Chunk List** (expandable disclosure):
   - Heading: "CHUNKS (Developer Mode)" (light gray, small, uppercase)
   - Disclosure toggle: "Show Chunks ▶" (light gray, clickable, expands to "Hide Chunks ▼")
   - When expanded:
     - Scrollable list of chunks (dark card background `#111a26`, each chunk is a row):
       - Column 1: Chunk ID (light gray, ~12px, e.g., "chunk_1234")
       - Column 2: Start time (white, ~13px, e.g., "0:00")
       - Column 3: Duration (white, ~13px, e.g., "4.12s")
       - Column 4: Byte size (light gray, ~12px, e.g., "32,768 bytes")
       - Column 5: "Play" button (cyan text, inline, calls `playback-engine.playChunk(chunkId)`)
     - If > 10 chunks, scrollable with max-height (e.g., max-height 40vh)

6. **Snip List** (expandable disclosure):
   - Heading: "SNIPS (Developer Mode)" (light gray, small, uppercase)
   - Disclosure toggle: "Show Snips ▶" (light gray, clickable, expands to "Hide Snips ▼")
   - When expanded:
     - Scrollable list of snips (dark card background `#111a26`, each snip is a row):
       - Column 1: Snip ID (light gray, ~12px, e.g., "snip_5678")
       - Column 2: Time range (white, ~13px, e.g., "0:00 – 0:12")
       - Column 3: Duration (white, ~13px, e.g., "12.5s")
       - Column 4: Transcript preview (light gray, ~12px, first 50 chars, e.g., "This is the first snip text and it continues...")
       - Column 5: "Play" button (cyan text, inline, calls `playback-engine.playSnip(snipId)`)
     - If > 10 snips, scrollable with max-height

7. **Volume Histogram** (expandable disclosure):
   - Heading: "VOLUME HISTOGRAM (Developer Mode)" (light gray, small, uppercase)
   - Disclosure toggle: "Show Histogram ▶" (light gray, clickable, expands to "Hide Histogram ▼")
   - When expanded:
     - Line graph or bar chart (dark card background `#111a26`, padding 16px, ~300px height):
       - X-axis: Time (session duration, e.g., 0s to 120s)
       - Y-axis: Volume (normalized 0.0 to 1.0 or dB scale)
       - Line: Volume over time (cyan `#22d3ee` line, 2px stroke)
       - Snip boundaries: Vertical lines (orange `#f59e0b` dashed lines, 1px stroke, labeled with snip number at top)
     - If volume profiles not computed: "Volume profiles not available. Run Doctor to diagnose." (light gray, ~13px)

8. **Doctor Panel** (expandable disclosure):
   - Heading: "DOCTOR (Developer Mode)" (light gray, small, uppercase)
   - Disclosure toggle: "Show Doctor ▶" (light gray, clickable, expands to "Hide Doctor ▼")
   - When expanded:
     - "Run Doctor" button (cyan border, white text, rounded pill, ~44px height, full-width in disclosure)
     - Below button (if not yet run): "Doctor performs diagnostic checks: coverage, range access, per-chunk decode, snip scan." (light gray, ~12px, help text)
     - Below button (if run): Doctor report (expandable JSON view or summary):
       - Summary: "Doctor completed in 2.5s. All checks passed." (green `#10b981`, ~14px) or "Doctor found 3 issues." (orange `#f59e0b`, ~14px)
       - Expandable JSON view: "Show Full Report ▶" (light gray, clickable, expands to JSON code block with dark background, cyan syntax highlighting)
       - Issues list (if any): "Chunk 5: decode failed", "Snip 3: out of range" (red `#ef4444`, ~13px, bulleted list)

**Layout**:

- Fixed header at top (always visible)
- Scrollable main area (metadata + playback + transcription + actions + developer disclosures)
- Generous padding around cards (16px between cards, 16px from screen edges)

**Interactions**:

- Tap "← Sessions" → Navigate back to Home
- Tap "Play Session" → Call `playback-engine.playSession(sessionId)` → Show playback controls, audio plays
- Tap Play/Pause in playback controls → Toggle playback
- Drag seek bar → Seek to position (call `playback-engine.seek(position)`)
- Tap "Transcribe Session" → Call transcription orchestration flow (see Orchestration Flows below)
- Tap "Copy Transcript" → Copy transcript text to clipboard → Show toast "Copied!" (green `#10b981`, ~13px, bottom of screen, fades after 2s)
- Tap "Delete Session" → Show confirmation modal → If confirmed, call `session-store.deleteSession(sessionId)` → Navigate back to Home
- Tap "Play" on chunk/snip (developer mode) → Call `playback-engine.playChunk(chunkId)` or `playback-engine.playSnip(snipId)` → Audio plays inline (no navigation)
- Tap "Run Doctor" → Call doctor diagnostic flow (see Orchestration Flows below) → Show report

**Question this screen answers**: "What is this session? Can I play it? Can I transcribe it? What happened if something went wrong?"

**Main controls**:

- "Play Session" button (primary CTA if not transcribed)
- "Transcribe Session" button (primary CTA if transcription enabled and not yet transcribed)
- Playback controls (play/pause, seek bar, 15s skip buttons)
- "Copy Transcript" button (primary CTA if transcribed)
- "Delete Session" button (destructive action)

**What changes after main action** (Tap "Play Session"):

- Playback controls appear inline
- Audio plays from device speakers/headphones
- Seek bar thumb moves as audio plays
- Current time updates every ~100ms

---

### Screen 4: Settings

**What the user sees** (modal overlay):

**Settings modal** (overlays Home screen):

- Dark card/modal background `#111a26`, rounded corners at top 16–20px, slides up from bottom or fades in
- Top bar:
  - Left: "Settings" heading (white, ~20px, bold)
  - Right: "Close" button (cyan `#22d3ee`, text button, clickable, closes modal)

**Main scroll area** (vertically scrollable):

1. **Transcription section**:
   - Section heading: "Transcription" (white, ~18px, bold, top of section)
   - Status chip (inline, right-aligned next to heading):
     - If key valid: "ENABLE" chip (cyan `#22d3ee` background, white text, rounded pill, ~24px height, clickable to disable)
     - If key missing or invalid: "DISABLED" chip (gray `#6b7280` background, white text, rounded pill, ~24px height, not clickable)
   - Help text: "Groq is a separate service (not this app). Their free account takes about a minute to set up, and this app auto-checks your key after you paste it. **It's easy to set up.**" (light gray, ~13px, link on "It's easy to set up" is cyan `#22d3ee`, clickable, opens external Groq docs)
   - Numbered steps (light gray, ~13px):
     - "1. Create a free Groq account at console.groq.com"
     - "2. Paste the key here"
     - "3. Transcription turns on after validation"
   - **Groq API key** input field:
     - Label: "Groq API key" (light gray, ~13px, above input)
     - Text input: Dark background `#0a0f18`, light text, rounded 8px, padding 12px, full-width, placeholder "SK-..." (light gray), type="password" (obscured)
     - Below input: "Key status: Missing" or "Key status: Valid" or "Key status: Invalid" (light gray, ~12px, left-aligned)
     - Right of status: "Recheck key" button (dark button `#374151`, white text, rounded pill, ~32px height, right-aligned, calls `transcription-client.validateKey(apiKey)`)
   - Help paragraph: "Need a key? **Create one in Groq Console**." (light gray, ~13px, link on "Create one in Groq Console" is cyan `#22d3ee`, clickable, opens external Groq console) "Groq is a separate service with its own pricing. **See Groq pricing**." (link on "See Groq pricing" is cyan `#22d3ee`, clickable, opens external Groq pricing page)

2. **App section**:
   - Section heading: "App" (white, ~18px, bold, top of section)
   - Checkbox: "Enable developer mode" (white checkbox on dark background, ~20px, label "Enable developer mode" white ~15px, next to checkbox)
     - When checked: 🐞 bug icon appears in Home header (can access Developer Console)
     - When unchecked: 🐞 bug icon hidden, developer mode panels hidden in Session Detail
   - **Storage cap (MB)** input field:
     - Label: "Storage cap (MB)" (light gray, ~13px, above input)
     - Number input: Dark background `#0a0f18`, light text, rounded 8px, padding 12px, width ~120px, default value "200" (editable)
     - Help text below input: "Maximum storage for session data. Old sessions will be deleted when this limit is reached." (light gray, ~12px)

**Layout**:

- Modal overlay slides up from bottom (or fades in)
- Fixed top bar (Settings heading + Close button, always visible)
- Scrollable main area (Transcription section + App section)
- Generous padding (16px around sections, 24px between sections)

**Interactions**:

- Tap "Close" → Close Settings modal, return to Home
- Paste or type into Groq API key input → On blur, call `transcription-client.validateKey(apiKey)` automatically → Update "Key status" and status chip
- Tap "Recheck key" → Call `transcription-client.validateKey(apiKey)` → Update "Key status" and status chip
- Tap "ENABLE" chip (if already enabled) → Set key to empty string → Update status chip to "DISABLED"
- Check/uncheck "Enable developer mode" → Save to localStorage `developer_mode_enabled` → Toggle 🐞 icon visibility in Home header
- Edit "Storage cap (MB)" input → On blur, save to localStorage `storage_cap_mb` → Update DATA chip in Home header
- Tap external links → Open in new browser tab (or in-app browser on iOS)

**Question this screen answers**: "How do I enable transcription? How do I manage storage? How do I enable developer tools?"

**Main controls**:

- Groq API key input (primary CTA for transcription setup)
- "Recheck key" button
- "Enable developer mode" checkbox
- "Storage cap (MB)" input
- "Close" button (top-right, always accessible)

**What changes after main action** (Paste Groq API key → Key validates):

- "Key status" changes from "Missing" to "Valid" (or "Invalid" if key is bad)
- Status chip changes from "DISABLED" (gray) to "ENABLE" (cyan)
- Transcription section in Session Detail now shows "Transcribe Session" button instead of "Transcription disabled"

---

### Screen 5: Developer Console (Conditional)

**What the user sees** (modal overlay, ONLY accessible when developer mode enabled):

**Access**: Tap 🐞 bug icon in Home header → Developer Console modal opens

**Console modal** (overlays Home screen):

- Dark card/modal background `#111a26`, rounded corners at top 16–20px, slides up from bottom or fades in, taller than Settings (near full-screen height)
- Top bar:
  - Left: "Developer Console" heading (white, ~20px, bold)
  - Right: "Close" button (cyan `#22d3ee`, text button, clickable, closes modal)

**Tab navigation** (horizontal tabs below top bar):

- "IndexedDB" tab (white text ~15px, cyan `#22d3ee` underline when active)
- "Logs" tab (white text ~15px, cyan underline when active)

**IndexedDB Tab**:

1. **Table selector**:
   - Dropdown or tab pills: "Sessions", "Chunks", "Volume Profiles", "Snips", "Transcripts" (white text, cyan background when active, ~14px)
   - Selected table displayed as list/table below

2. **Table view** (scrollable):
   - Dark card background `#111a26`, rounded corners 16–20px, padding 16px, max-height 60vh, scrollable
   - List of records (one per row):
     - Each row: ID (light gray, ~12px, e.g., "session_1234"), key fields (timestamp, duration, status, white ~13px), "View Details" button (cyan text, inline, expands JSON below row when clicked)
     - When "View Details" clicked: Expandable JSON view (dark background `#0a0f18`, cyan syntax highlighting, scrollable, max-height 20vh, "Hide Details ▲" button to collapse)
   - Record count at top: "127 chunks across 12 sessions" (light gray, ~13px, above list)

3. **Actions** (bottom of tab):
   - "Export Table as JSON" button (cyan border, white text, rounded pill, ~44px height, left-aligned, downloads selected table as JSON file)
   - "Clear All Data" button (red `#ef4444` border, white text, rounded pill, ~44px height, right-aligned, shows confirmation modal before clearing)

**Logs Tab** (placeholder for future implementation):

1. **Session selector**:
   - Dropdown: "Select session..." (white text, dark background `#0a0f18`, rounded 8px, padding 12px, full-width)
   - Options: List of session IDs + timestamps (e.g., "session_1234 (Jan 15, 2026 at 10:23 AM)")

2. **Log entries** (scrollable, if implemented):
   - List of log entries (dark card background `#111a26`, each entry is a row):
     - Timestamp (light gray, ~12px, e.g., "10:23:45.123")
     - Level (color-coded, ~13px, e.g., "INFO" green `#10b981`, "WARN" orange `#f59e0b`, "ERROR" red `#ef4444`)
     - Message (white, ~13px, e.g., "Chunk encoded: chunk_1234")
     - JSON details (collapsible, gray text, ~12px, "Show Details ▶" button expands JSON block)
   - If logging not yet implemented: "Logging not yet implemented. This tab is a placeholder for structured per-session logs." (light gray, ~14px, centered)

**Storage Inspector** (disclosure at bottom of IndexedDB tab or separate tab, optional):

- Heading: "STORAGE" (light gray, small, uppercase)
- Disclosure toggle: "Show Storage Inspector ▶" (light gray, clickable, expands to "Hide Storage Inspector ▼")
- When expanded:
  - Storage quota: "Using 127 MB of 500 MB device storage" (white, ~14px, matches DATA chip on Home)
  - Breakdown by table:
    - Sessions: 45 MB (light gray, ~13px)
    - Chunks: 75 MB
    - Transcripts: 7 MB
    - Volume Profiles: <1 MB
    - Snips: <1 MB
  - Orphaned data detector: "3 orphaned chunks, 1 orphaned transcript" (orange `#f59e0b`, ~13px, with "Clean Up" button cyan text, inline, calls cleanup routine)

**Layout**:

- Modal overlay, near full-screen height
- Fixed top bar + tab navigation
- Scrollable main area (table view + actions)
- Generous padding (16px around content)

**Interactions**:

- Tap "Close" → Close Developer Console modal, return to Home
- Switch tabs → Show corresponding tab content
- Select table in dropdown → Load and display table records
- Tap "View Details" on record → Expand JSON view inline
- Tap "Export Table as JSON" → Download JSON file (filename: `web-whisper-[table-name]-[timestamp].json`)
- Tap "Clear All Data" → Show confirmation modal "Delete all session data? This cannot be undone." → If confirmed, call `session-store.clearAll()` → Reload table view (empty)
- Tap "Clean Up" in Storage Inspector → Call cleanup routine to remove orphaned records → Update storage breakdown

**Question this screen answers**: "What session data is stored? How much storage is used? Are there orphaned records or corrupted data?"

**Main controls**:

- Table selector (dropdown or tab pills)
- "View Details" per record (expand JSON)
- "Export Table as JSON" button
- "Clear All Data" button (destructive)
- "Close" button (top-right, always accessible)

**What changes after main action** (Select "Chunks" table):

- Table view updates to show all chunk records (ID, sessionId, startTime, duration, byteSize)
- Record count updates to "127 chunks"

---

## Interface Inventory

How the PWA calls each lib package and session-store. For each integration point, state the caller (PWA), the called interface, input, output, and how the PWA uses the result.

### capture-engine

**Caller**: PWA app, recording flow

**Interface 1**: `startCapture(sessionId)`

- **Input**: `sessionId` (string, new session ID from `session-store.createSession()`)
- **Output**: Capture handle `{stop: () => Promise<CompletionSummary>}`
- **How PWA uses result**: Store handle in component state, call `handle.stop()` when user taps "Stop Recording"

**Interface 2**: `stopCapture(handle)` or `handle.stop()`

- **Input**: Capture handle from `startCapture`
- **Output**: `{chunksWritten: number, totalDuration: number, hasAudio: boolean}`
- **How PWA uses result**: Navigate to Session Detail, show playback controls if `hasAudio === true`, show "Completed without playable audio" message if `hasAudio === false`

**Events emitted**:

- `chunkEncoded(sessionId, chunkId, duration)`: PWA listens, updates chunk count in Recording UI (developer mode)
- `captureError(sessionId, reason)`: PWA listens, shows error message, stops recording

### volume-analyzer

**Caller**: PWA app, post-recording flow (after recording stops, before transcription)

**Interface 1**: `analyzeChunk(chunkBlob)`

- **Input**: `chunkBlob` (Blob, MP3 chunk from session-store)
- **Output**: `{chunkId, volumeSamples: Float32Array, maxVolume, avgVolume}`
- **How PWA uses result**: Call for each chunk in session (batch or sequential), writes volume profile to session-store via `session-store.writeVolumeProfile(sessionId, chunkId, volumeSamples)`
- **Note**: May be called by PWA or by capture-engine directly; if capture-engine writes volume profiles automatically, PWA skips this step

**Interface 2**: `proposeSnips(sessionId)`

- **Input**: `sessionId` (string)
- **Output**: Array of snip proposals `[{startTime, endTime, chunkRefs, confidence}]`
- **How PWA uses result**: Iterate proposals, write snips to session-store via `session-store.writeSnip(sessionId, snipData)`, then proceed to transcription (if enabled)

### transcription-client

**Caller**: PWA app, Settings (key validation) and Session Detail (transcription)

**Interface 1**: `validateKey(apiKey)`

- **Input**: `apiKey` (string, Groq API key from Settings input)
- **Output**: `{valid: boolean, message?: string}` (e.g., `{valid: true}` or `{valid: false, message: "Invalid API key format"}`)
- **How PWA uses result**: Update Settings UI "Key status" text and status chip ("ENABLE" or "DISABLED"), save key to localStorage if valid

**Interface 2**: `transcribeAudio(audioBlob, apiKey)`

- **Input**: `audioBlob` (Blob, MP3 audio for snip, concatenated from chunks if snip spans multiple chunks), `apiKey` (string)
- **Output**: `{text: string}` or throws error if transcription fails
- **How PWA uses result**: Call for each snip, write transcript to session-store via `session-store.writeTranscript(sessionId, snipId, transcriptText)`, update progress bar in Session Detail, show final transcript text when all snips complete

### playback-engine

**Caller**: PWA app, Session Detail (playback)

**Interface 1**: `playSession(sessionId)`

- **Input**: `sessionId` (string)
- **Output**: Playback controller `{play(), pause(), seek(position), onTimeUpdate(callback), onEnded(callback)}`
- **How PWA uses result**: Store controller in component state, call methods on user interaction (play/pause button, seek bar drag), listen to `onTimeUpdate` to update seek bar and current time display, listen to `onEnded` to reset playback controls when audio finishes

**Interface 2**: `playChunk(chunkId)` (developer mode only)

- **Input**: `chunkId` (string)
- **Output**: Playback controller (same as `playSession`)
- **How PWA uses result**: Play individual chunk when user taps "Play" in Chunk List (developer mode)

**Interface 3**: `playSnip(snipId)` (developer mode only)

- **Input**: `snipId` (string)
- **Output**: Playback controller (same as `playSession`)
- **How PWA uses result**: Play individual snip when user taps "Play" in Snip List (developer mode)

### session-store

**Caller**: PWA app, all flows

**Interface 1**: `createSession()`

- **Input**: None (or optional initial metadata)
- **Output**: `{sessionId: string}` (new session ID)
- **How PWA uses result**: Pass `sessionId` to `capture-engine.startCapture(sessionId)`, store in component state for later use

**Interface 2**: `getSession(sessionId)`

- **Input**: `sessionId` (string)
- **Output**: Session object `{sessionId, timestamp, duration, status, chunkCount, hasAudio}`
- **How PWA uses result**: Display session metadata in Session Detail screen

**Interface 3**: `listSessions()`

- **Input**: None (or optional filter/sort params)
- **Output**: Array of session objects (ordered by timestamp descending)
- **How PWA uses result**: Render session list on Home screen

**Interface 4**: `deleteSession(sessionId)`

- **Input**: `sessionId` (string)
- **Output**: `{deleted: boolean}` (or void)
- **How PWA uses result**: Remove session card from Home screen list, navigate back to Home if on Session Detail

**Interface 5**: `getChunksForSession(sessionId)`

- **Input**: `sessionId` (string)
- **Output**: Array of chunk objects `[{chunkId, sessionId, startTime, duration, byteSize, blob}]`
- **How PWA uses result**: Pass chunks to playback-engine for session playback, display chunk list in Session Detail (developer mode)

**Interface 6**: `writeVolumeProfile(sessionId, chunkId, volumeSamples)`

- **Input**: `sessionId` (string), `chunkId` (string), `volumeSamples` (Float32Array)
- **Output**: `{written: boolean}` (or void)
- **How PWA uses result**: Write volume profiles after `volume-analyzer.analyzeChunk()` returns

**Interface 7**: `writeSnip(sessionId, snipData)`

- **Input**: `sessionId` (string), `snipData` `{startTime, endTime, chunkRefs, confidence}`
- **Output**: `{snipId: string}` (new snip ID)
- **How PWA uses result**: Write snips after `volume-analyzer.proposeSnips()` returns, store snip IDs for transcription

**Interface 8**: `writeTranscript(sessionId, snipId, transcriptText)`

- **Input**: `sessionId` (string), `snipId` (string), `transcriptText` (string)
- **Output**: `{written: boolean}` (or void)
- **How PWA uses result**: Write transcripts after `transcription-client.transcribeAudio()` returns, update transcript display in Session Detail

**Interface 9**: `enforceRetentionPolicy()`

- **Input**: None (reads storage cap from internal config or passed as param)
- **Output**: `{deletedSessions: string[]}` (array of deleted session IDs)
- **How PWA uses result**: Call periodically (e.g., on app launch, after each session completes), remove deleted session cards from Home screen list if currently visible

**Interface 10**: `getStorageUsage()`

- **Input**: None
- **Output**: `{usedBytes: number, capBytes: number}`
- **How PWA uses result**: Display in DATA chip on Home header ("127 MB / 200 MB")

---

## Orchestration Flows

### Recording Flow

**Goal**: Start recording, persist chunks as they encode, stop recording, have a playable session.

**Steps**:

1. **User taps "Start recording" on Home**:
   - PWA calls `session-store.createSession()` → receives `{sessionId}`
   - PWA calls `capture-engine.startCapture(sessionId)` → receives capture handle
   - PWA navigates to Recording UI (or shows recording state in-place on Home)
   - PWA listens to `capture-engine` events: `chunkEncoded`, `captureError`

2. **While recording (live updates)**:
   - PWA updates duration counter every ~100ms (or listens to event from capture-engine if available)
   - PWA updates chunk count (developer mode) when `chunkEncoded` event fires
   - PWA updates buffer size meter (developer mode) if capture-engine provides buffer state
   - capture-engine encodes chunks every ~4s and writes to session-store automatically

3. **User taps "Stop Recording"**:
   - PWA calls `handle.stop()` → waits for `{chunksWritten, totalDuration, hasAudio}`
   - If `hasAudio === false` (watchdog timeout, no chunks):
     - PWA marks session status as "Completed without playable audio" (or session-store does this automatically)
     - PWA navigates to Session Detail with warning message, "Play Session" button disabled
   - If `hasAudio === true`:
     - PWA navigates to Session Detail with playback controls enabled

4. **Post-recording (volume analysis and snip proposal)**:
   - PWA calls `volume-analyzer.proposeSnips(sessionId)` (or starts volume analysis for each chunk first if not done automatically)
   - volume-analyzer reads chunks from session-store, computes volume profiles, proposes snips, writes snips to session-store
   - PWA receives snip array, stores snip IDs in local state for transcription (if enabled)

**Error handling**:

- **Microphone permission denied**: PWA catches error from `capture-engine.startCapture()`, shows error modal, navigates back to Home
- **Microphone ghost (no audio)**: capture-engine stops itself after 10s timeout, returns `{hasAudio: false}`, PWA shows honest message "Completed without playable audio"
- **Chunk encoding failure**: capture-engine emits `captureError` event, PWA shows error toast, stops recording, navigates back to Home or Session Detail with error message

---

### Transcription Flow

**Goal**: Validate Groq API key (Settings), transcribe snips (Session Detail), show transcript text, allow copy.

**Steps**:

1. **First-time setup (Settings)**:
   - User opens Settings, pastes Groq API key into input field
   - On blur or "Recheck key" tap: PWA calls `transcription-client.validateKey(apiKey)` → receives `{valid: boolean, message?: string}`
   - If `valid === true`: PWA saves key to localStorage, updates "Key status: Valid", updates status chip to "ENABLE" (cyan)
   - If `valid === false`: PWA shows "Key status: Invalid", status chip stays "DISABLED" (gray), help message displayed below input (e.g., "Invalid API key format. Please check your key.")

2. **Per-session transcription (Session Detail)**:
   - User opens Session Detail, transcription section shows "Transcribe Session" button (if key valid and not yet transcribed)
   - User taps "Transcribe Session":
     - PWA reads snip IDs for session from session-store (or from local state after volume analysis)
     - PWA iterates snips, for each snip:
       - PWA reads chunk blobs for snip from session-store (via `getChunksForSession` or `getSnip`)
       - PWA concatenates chunk blobs into snip audio blob (or session-store provides concatenated blob)
       - PWA calls `transcription-client.transcribeAudio(snipAudioBlob, apiKey)` → receives `{text: string}` or catches error
       - If success: PWA calls `session-store.writeTranscript(sessionId, snipId, text)`, updates progress bar ("3 / 8 snips transcribed")
       - If error: PWA logs error, marks snip as failed, continues to next snip
     - After all snips: PWA reads all transcripts from session-store, concatenates texts, displays full transcript in Session Detail

3. **Copy transcript**:
   - User taps "Copy Transcript":
     - PWA reads transcript text from session-store (or from component state)
     - PWA calls `navigator.clipboard.writeText(transcriptText)` → copies to clipboard
     - PWA shows toast "Copied!" (green, bottom of screen, fades after 2s)

**Error handling**:

- **Invalid API key (Settings)**: PWA shows "Key status: Invalid", help message, status chip stays "DISABLED"
- **Transcription API failure (network error, quota exceeded)**: PWA catches error from `transcription-client.transcribeAudio()`, shows error toast "Transcription failed: [error message]", marks snip as failed, continues to next snip
- **Partial transcription failure**: PWA shows message "7 of 8 snips transcribed. 1 failed." (orange), displays successful transcripts, shows "Retry Failed" button
- **Retry failed snips**: User taps "Retry Failed" → PWA iterates only failed snips, retries transcription, updates display

---

### Playback Flow

**Goal**: Play a session, chunk, or snip with standard audio controls (play/pause, seek, skip).

**Steps**:

1. **User opens Session Detail, taps "Play Session"**:
   - PWA calls `playback-engine.playSession(sessionId)` → receives playback controller `{play(), pause(), seek(position), onTimeUpdate(callback), onEnded(callback)}`
   - PWA stores controller in component state
   - PWA calls `controller.play()` → audio starts playing
   - PWA listens to `controller.onTimeUpdate(currentTime => {...})` → updates seek bar position and current time display every ~100ms
   - PWA listens to `controller.onEnded(() => {...})` → resets playback controls when audio finishes (hide pause button, show play button, seek bar at end)

2. **User taps Pause button**:
   - PWA calls `controller.pause()` → audio pauses
   - PWA updates UI (hide pause button, show play button)

3. **User taps Play button (resume)**:
   - PWA calls `controller.play()` → audio resumes from current position
   - PWA updates UI (hide play button, show pause button)

4. **User drags seek bar**:
   - PWA calls `controller.seek(newPosition)` → audio seeks to new position
   - PWA updates current time display

5. **User taps 15s backward/forward buttons**:
   - PWA calculates new position (`currentPosition - 15` or `currentPosition + 15`, clamped to `[0, duration]`)
   - PWA calls `controller.seek(newPosition)`
   - PWA updates current time display

**Developer mode playback** (Chunk/Snip List):

6. **User opens Session Detail (developer mode enabled), expands Chunk List, taps "Play" on chunk**:
   - PWA calls `playback-engine.playChunk(chunkId)` → receives playback controller
   - PWA plays chunk inline (no navigation, audio plays in background, no seek bar)
   - Or: PWA shows mini-player controls below chunk row (play/pause, no seek bar)

7. **User taps "Play" on snip in Snip List**:
   - PWA calls `playback-engine.playSnip(snipId)` → receives playback controller
   - PWA plays snip inline (same as chunk playback)

**Error handling**:

- **Session has no audio**: PWA disables "Play Session" button, shows help text "This session has no playable audio."
- **Playback engine failure** (chunk missing, decode error): PWA catches error from `playback-engine.playSession()`, shows error toast "Playback failed: [error message]", disables playback controls
- **Chunk/snip playback failure** (developer mode): PWA catches error from `playback-engine.playChunk()`, shows error toast "Chunk playback failed: chunk may be corrupted or missing"

---

### Settings Persistence Flow

**Goal**: Save user settings (Groq API key, storage cap, developer mode toggle) to localStorage, load on app launch.

**Strategy**: Use localStorage (not IndexedDB) for settings. Settings are small (< 1 KB), non-relational, and need synchronous access on app launch.

**Keys**:

- `groq_api_key` (string, Groq API key, empty string if not set)
- `storage_cap_mb` (number, storage cap in MB, default 200)
- `developer_mode_enabled` (boolean, default false)
- `onboarding_dismissed` (boolean, default false, controls onboarding card visibility on Home)

**Steps**:

1. **App launch** (PWA component mount):
   - PWA reads localStorage `groq_api_key`, `storage_cap_mb`, `developer_mode_enabled`, `onboarding_dismissed`
   - If keys missing: PWA sets defaults (`groq_api_key = ""`, `storage_cap_mb = 200`, `developer_mode_enabled = false`, `onboarding_dismissed = false`)
   - PWA stores values in component state or global store (e.g., React Context, Zustand, Redux)
   - If `developer_mode_enabled === true`: PWA shows 🐞 bug icon in Home header
   - If `groq_api_key !== ""`: PWA calls `transcription-client.validateKey(groq_api_key)` in background, updates transcription status

2. **User changes settings (Settings modal)**:
   - User pastes Groq API key → PWA validates → PWA saves to localStorage `groq_api_key`
   - User edits storage cap → PWA saves to localStorage `storage_cap_mb` on blur
   - User toggles developer mode → PWA saves to localStorage `developer_mode_enabled`, shows/hides 🐞 icon

3. **User dismisses onboarding card**:
   - User taps "Dismiss" → PWA saves to localStorage `onboarding_dismissed = true`
   - Onboarding card hidden on next app launch

**Error handling**:

- **localStorage quota exceeded** (unlikely for settings): PWA catches error, shows error toast "Failed to save settings: storage quota exceeded"
- **localStorage not available** (private browsing mode on some browsers): PWA catches error, shows warning toast "Settings will not persist in private browsing mode"

---

### Developer Mode Gating

**Goal**: Hide developer tools (🐞 icon, developer mode panels in Session Detail, Developer Console) unless user explicitly enables developer mode in Settings.

**Implementation**:

1. **Settings checkbox**: "Enable developer mode" (unchecked by default)
2. **When checked**:
   - PWA saves `localStorage.developer_mode_enabled = true`
   - PWA shows 🐞 bug icon in Home header (between DATA chip and Settings button)
   - PWA shows developer mode panels in Session Detail (Chunk List, Snip List, Volume Histogram, Doctor Panel)
   - PWA shows chunk count and buffer size in Recording UI
3. **When unchecked**:
   - PWA saves `localStorage.developer_mode_enabled = false`
   - PWA hides 🐞 bug icon
   - PWA hides developer mode panels in Session Detail
   - PWA hides chunk count and buffer size in Recording UI

**Visual indicator**: 🐞 icon in Home header is the primary signal that developer mode is enabled. No other visual indicator on default screens (no "Developer Mode" badge or banner).

---

### Error Handling and User Feedback

**Goals**:

1. **Honest feedback**: No spinner as if transcription failed when the user never entered a Groq key
2. **Actionable errors**: Show clear error messages with next steps (e.g., "Microphone permission denied. Please allow microphone access in iOS Settings.")
3. **Graceful degradation**: Recording works without transcription; playback works without transcription; developer tools are optional

**Error types and handling**:

1. **Microphone permission denied**:
   - **When**: User taps "Start recording", browser denies permission (user tapped "Don't Allow" or permission is disabled in iOS Settings)
   - **Handling**: PWA catches error from `capture-engine.startCapture()`, shows error modal "Microphone permission denied. Please allow microphone access in iOS Settings → Safari → Web Whisper → Microphone." with "OK" button → Navigate back to Home
   - **Fallback**: None (recording requires microphone)

2. **Microphone ghost (granted permission but no audio)**:
   - **When**: User taps "Start recording", browser grants permission, but no audio callbacks arrive (known iOS issue)
   - **Handling**: capture-engine watchdog timeout (10s), stops automatically, returns `{hasAudio: false}` → PWA navigates to Session Detail with status "Completed without playable audio", "Play Session" button disabled, help text "This session has no playable audio. The microphone may not have delivered audio data."
   - **Fallback**: Developer mode shows logs and doctor JSON for diagnosis

3. **Chunk encoding failure**:
   - **When**: capture-engine fails to encode PCM to MP3 (e.g., encoder error, out-of-memory)
   - **Handling**: capture-engine emits `captureError` event with reason → PWA shows error toast "Recording failed: [error message]", stops recording, navigates back to Home or Session Detail
   - **Fallback**: None (session is marked as failed or partial)

4. **Transcription disabled (no Groq key)**:
   - **When**: User opens Session Detail, no Groq API key in localStorage
   - **Handling**: PWA shows message "Transcription disabled. Add API key in Settings." (light gray, ~14px, not an error tone), "Open Settings" link (cyan)
   - **Fallback**: Recording and playback work normally; transcription is optional

5. **Groq API key invalid**:
   - **When**: User enters key in Settings, `transcription-client.validateKey()` returns `{valid: false}`
   - **Handling**: PWA shows "Key status: Invalid", status chip stays "DISABLED" (gray), help message "Invalid API key format. Please check your key." (light gray, below input)
   - **Fallback**: Recording and playback work normally; transcription is disabled

6. **Transcription API failure** (network error, quota exceeded, Groq API down):
   - **When**: User taps "Transcribe Session", `transcription-client.transcribeAudio()` throws error
   - **Handling**: PWA catches error, shows error toast "Transcription failed: [error message]" (orange, bottom of screen, fades after 5s), marks snip as failed, continues to next snip
   - **Fallback**: Partial transcription (some snips succeed, some fail), "Retry Failed" button

7. **Playback failure** (chunk missing, decode error):
   - **When**: User taps "Play Session", `playback-engine.playSession()` throws error
   - **Handling**: PWA catches error, shows error toast "Playback failed: [error message]" (orange, bottom of screen, fades after 5s), disables playback controls
   - **Fallback**: Developer mode shows chunk list and doctor JSON for diagnosis

8. **Session-store quota exceeded**:
   - **When**: session-store writes chunk, IndexedDB quota exceeded (device storage full or cap reached)
   - **Handling**: session-store enforces retention policy (deletes oldest sessions), retries write → If still fails, emits error event → PWA shows error toast "Storage quota exceeded. Old sessions were deleted to make space."
   - **Fallback**: Recording may fail if no space can be freed; user must increase storage cap or delete sessions manually

9. **Settings save failure** (localStorage quota exceeded, private browsing mode):
   - **When**: User changes settings, localStorage.setItem() throws error
   - **Handling**: PWA catches error, shows error toast "Failed to save settings: [error message]" (orange, bottom of screen)
   - **Fallback**: Settings do not persist; user must re-enter on next app launch

**User feedback mechanisms**:

- **Toasts**: Temporary messages (bottom of screen, fade after 2–5s) for success ("Copied!"), warnings ("Transcription failed"), errors ("Playback failed")
- **Modals**: Persistent messages requiring user action (e.g., "Delete this session? This cannot be undone." with "Cancel" and "Delete" buttons)
- **Inline messages**: Contextual messages in UI sections (e.g., "Transcription disabled. Add API key in Settings." in Session Detail transcription section)
- **Status indicators**: Colored chips, icons, or text (e.g., "ENABLE" cyan chip, "DISABLED" gray chip, "Key status: Valid" green text)

---

## Visual Design Implementation Notes

**Reference**: `docs/VISUAL-BASELINE.md` (exact colors, layout, interaction patterns)

**Key implementation points**:

1. **Color variables** (CSS custom properties or JS constants):
   - `--bg-primary: #0a0f18` (dark navy-black background)
   - `--bg-card: #111a26` (lighter dark card background)
   - `--accent-primary: #22d3ee` (cyan/teal accent)
   - `--text-primary: #ffffff` (white text)
   - `--text-secondary: #9ca3af` (light gray metadata)
   - `--error: #ef4444` (red for errors, destructive actions)
   - `--success: #10b981` (green for success messages)
   - `--warning: #f59e0b` (orange for warnings, partial failures)

2. **Typography** (system font stack):
   - `font-family: -apple-system, BlinkMacSystemFont, "San Francisco", "Roboto", system-ui, sans-serif`
   - Heading: `font-size: 18–20px`, `font-weight: 600` (bold)
   - Body: `font-size: 15–16px`, `font-weight: 400` (regular)
   - Metadata: `font-size: 13–14px`, `font-weight: 400`, `color: var(--text-secondary)`

3. **Border radius**: `border-radius: 16px` (cards), `border-radius: 24px` (buttons, pills), `border-radius: 8px` (inputs)

4. **Touch targets**: `min-height: 44px`, `min-width: 44px` for all interactive elements (buttons, links, checkboxes)

5. **Spacing** (padding/margin scale):
   - `4px`, `8px`, `12px`, `16px`, `24px`, `32px` (use consistent scale)
   - Cards: `padding: 16px`, `margin-bottom: 16px`
   - Screen edges: `padding: 16px` (left/right)

6. **Gradient CTA button**:
   - `background: linear-gradient(90deg, #22d3ee 0%, #3b82f6 100%)` (cyan to blue)
   - `border-radius: 24px` (pill shape)
   - `padding: 14px 24px`
   - `font-size: 16px`, `font-weight: 600`, `color: #ffffff`

7. **Cards**:
   - `background-color: var(--bg-card)`
   - `border-radius: 16px`
   - `border: 1px solid rgba(34, 211, 238, 0.1)` (subtle bluish border)
   - `padding: 16px`

8. **Modal overlays**:
   - `background-color: rgba(0, 0, 0, 0.5)` (dark overlay behind modal)
   - Modal card: `background-color: var(--bg-card)`, `border-radius: 16px 16px 0 0` (rounded top corners, square bottom for bottom sheet)

9. **Animations**:
   - Page transitions: `transition: transform 300ms ease-out` (slide in/out)
   - Button hover: `transition: opacity 200ms ease` (fade opacity on hover/active)
   - Recording indicator: Pulsing animation `@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`, `animation: pulse 2s ease-in-out infinite`

10. **iOS safe area insets**:
    - Top: `padding-top: env(safe-area-inset-top)` (header extends into notch area)
    - Bottom: `padding-bottom: env(safe-area-inset-bottom)` (bottom controls clear home indicator)

---

## Validation Plan

**Goal**: Manually walkthrough the PWA to verify all screens, flows, and integrations work as specified.

**Validation steps** (manual walkthrough checklist):

### Home / Session List

- [ ] Home screen loads, shows "Web Whisper" header, DATA chip "0 B / 200 MB", Settings button
- [ ] Onboarding card visible on first launch, "Dismiss" button works, card stays hidden after dismissal
- [ ] CAPTURE card visible, "Start recording" button enabled, status line "Recorder idle — tap start to begin a durable session."
- [ ] Session list empty (empty card visible, no "No sessions yet" text)
- [ ] 🐞 bug icon NOT visible (developer mode disabled by default)

### Recording Flow

- [ ] Tap "Start recording" → Navigate to Recording UI
- [ ] Microphone permission prompt appears (if first time or after PWA cold start)
- [ ] Grant permission → Recording starts, duration counter updates every ~1s ("0:00", "0:01", "0:02"...)
- [ ] Recording indicator pulsing cyan circle visible, "Recording" label visible
- [ ] Wait ~4s → Chunk count increments (developer mode only; skip if developer mode disabled)
- [ ] Tap "Stop Recording" → Recording stops, navigate to Session Detail for new session
- [ ] Session Detail shows playable session (duration > 0, "Play Session" button enabled)

### Playback Flow

- [ ] Session Detail → Tap "Play Session" → Audio plays from device speakers/headphones
- [ ] Playback controls appear (play/pause button, seek bar, current time / total duration)
- [ ] Seek bar thumb moves as audio plays, current time updates every ~100ms
- [ ] Tap Pause → Audio pauses
- [ ] Tap Play → Audio resumes
- [ ] Drag seek bar → Audio seeks to new position
- [ ] Tap 15s backward → Audio jumps back 15s
- [ ] Tap 15s forward → Audio jumps forward 15s
- [ ] Audio ends → Playback controls reset (play button visible, seek bar at end)

### Settings Flow

- [ ] Home → Tap "Settings" → Settings modal opens
- [ ] Transcription section visible, status chip "DISABLED" (no key yet)
- [ ] Paste Groq API key into input field, tab/blur → Key auto-validates
- [ ] If key valid: "Key status: Valid", status chip changes to "ENABLE" (cyan)
- [ ] If key invalid: "Key status: Invalid", status chip stays "DISABLED" (gray)
- [ ] Check "Enable developer mode" checkbox → Save to localStorage
- [ ] Close Settings → 🐞 bug icon now visible in Home header
- [ ] Tap 🐞 icon → Developer Console modal opens

### Transcription Flow

- [ ] Session Detail (with valid Groq key) → Transcription section shows "Transcribe Session" button
- [ ] Tap "Transcribe Session" → Progress indicator appears ("Analyzing volume...", "Transcribing...")
- [ ] Progress bar updates ("3 / 8 snips transcribed")
- [ ] Wait for transcription to complete → Full transcript text appears
- [ ] Tap "Copy Transcript" → Clipboard confirmation toast "Copied!" appears, transcript copied to clipboard

### Developer Mode

- [ ] Settings → Check "Enable developer mode" → Close Settings → 🐞 icon visible in Home header
- [ ] Session Detail → Chunk List disclosure visible, "Show Chunks ▶" link
- [ ] Tap "Show Chunks ▶" → Chunk list expands, shows all chunks with IDs, times, byte sizes, "Play" buttons
- [ ] Tap "Play" on chunk → Chunk audio plays inline
- [ ] Snip List disclosure visible, "Show Snips ▶" link
- [ ] Tap "Show Snips ▶" → Snip list expands, shows all snips with IDs, time ranges, transcript previews, "Play" buttons
- [ ] Volume Histogram disclosure visible, "Show Histogram ▶" link
- [ ] Tap "Show Histogram ▶" → Volume histogram chart visible with snip boundaries
- [ ] Doctor Panel disclosure visible, "Show Doctor ▶" link
- [ ] Tap "Show Doctor ▶" → "Run Doctor" button visible
- [ ] Tap "Run Doctor" → Doctor runs, report visible (summary + JSON)

### Error Handling

- [ ] Deny microphone permission → Error modal appears "Microphone permission denied. Please allow microphone access in iOS Settings."
- [ ] Recording with no audio (mic ghost) → After 10s timeout, session marked as "Completed without playable audio", "Play Session" button disabled
- [ ] Session Detail (no Groq key) → Transcription section shows "Transcription disabled. Add API key in Settings." (not an error, informational)
- [ ] Transcription API failure → Error toast "Transcription failed: [error message]", partial transcription with "Retry Failed" button

### Storage and Retention

- [ ] DATA chip shows current storage usage "127 MB / 200 MB" (updates after each session)
- [ ] Settings → Change storage cap to "50" MB → Save → DATA chip updates to "127 MB / 50 MB"
- [ ] Record sessions until storage cap exceeded → Oldest sessions auto-deleted, error toast "Storage quota exceeded. Old sessions were deleted to make space."
- [ ] Developer Console → IndexedDB tab → Select "Sessions" table → Record count matches session list on Home
- [ ] Developer Console → "Clear All Data" button → Confirmation modal → Confirm → All sessions deleted, session list empty on Home

---

## First Implementation Checklist

**Goal**: Provide a concrete checklist for Phase 06 implementation.

**Phase 06 implementation tasks**:

1. **Project setup**:
   - [ ] Create `apps/web-whisper-pwa/` directory structure: `src/`, `public/`, `package.json`, `README.md`
   - [ ] Install dependencies: React (or framework of choice), CSS-in-JS or Tailwind CSS, build tools (Vite or Create React App)
   - [ ] Configure PWA manifest: `public/manifest.json` (app name, icons, display mode, theme color)
   - [ ] Add PWA service worker (optional for Phase 01, backlog for offline support)

2. **Visual design tokens**:
   - [ ] Create `src/styles/theme.ts` or `design-tokens.css` with color palette, typography scale, spacing scale from visual baseline
   - [ ] Implement dark theme: background `#0a0f18`, card background `#111a26`, accent `#22d3ee`, text primary white, text secondary light gray

3. **Settings persistence**:
   - [ ] Implement localStorage wrapper: `getSettings()`, `setSetting(key, value)`, `getSetting(key, defaultValue)`
   - [ ] Load settings on app launch: `groq_api_key`, `storage_cap_mb`, `developer_mode_enabled`, `onboarding_dismissed`
   - [ ] Save settings on change: Groq key (on blur), storage cap (on blur), developer mode (on toggle), onboarding dismissal (on tap)

4. **Home / Session List screen**:
   - [ ] Implement fixed header: "Web Whisper" title, DATA chip, 🐞 icon (conditional), Settings button
   - [ ] Implement onboarding card (dismissible): heading, body text, callout box, numbered steps, "Open Settings" and "Get Groq API key" links, "Dismiss" button
   - [ ] Implement CAPTURE card: "Start recording" gradient button, status line "Recorder idle"
   - [ ] Implement session list: Load sessions from session-store (`listSessions()`), render session cards (timestamp, duration, transcription status, "Play" and "Delete" buttons)
   - [ ] Implement session card interactions: Tap card → navigate to Session Detail, Tap "Play" → navigate to Session Detail and auto-play, Tap "Delete" → confirmation modal → delete session

5. **Recording UI**:
   - [ ] Implement Recording screen: Pulsing cyan circle, duration counter (live-updating every ~100ms), "Stop Recording" button
   - [ ] Implement recording flow: Tap "Start recording" → `session-store.createSession()` → `capture-engine.startCapture(sessionId)` → Navigate to Recording UI
   - [ ] Listen to `capture-engine` events: `chunkEncoded` (update chunk count if developer mode), `captureError` (show error toast, stop recording)
   - [ ] Implement stop flow: Tap "Stop Recording" → `handle.stop()` → Navigate to Session Detail
   - [ ] Handle errors: Microphone permission denied (error modal), microphone ghost (no audio, show honest message)

6. **Session Detail screen**:
   - [ ] Implement header: Back button "← Sessions", session timestamp title
   - [ ] Implement metadata section: Duration, recorded timestamp, status (if no audio)
   - [ ] Implement playback section: "Play Session" button, playback controls (play/pause, seek bar, current time / total duration, 15s skip buttons)
   - [ ] Implement playback flow: Tap "Play Session" → `playback-engine.playSession(sessionId)` → Audio plays, controls update
   - [ ] Implement transcription section: "Transcribe Session" button (if key valid), progress indicator, transcript text, "Copy Transcript" button
   - [ ] Implement transcription flow: Tap "Transcribe Session" → Iterate snips → `transcription-client.transcribeAudio()` → Write transcripts → Display transcript text
   - [ ] Implement actions: "Delete Session" button (confirmation modal)

7. **Settings modal**:
   - [ ] Implement Settings modal: Top bar (heading + Close button), scrollable main area (Transcription section + App section)
   - [ ] Implement Transcription section: Status chip (ENABLE/DISABLED), Groq API key input, key status text, "Recheck key" button, help text and links
   - [ ] Implement key validation: On blur or "Recheck key" tap → `transcription-client.validateKey()` → Update status chip and key status text
   - [ ] Implement App section: "Enable developer mode" checkbox, "Storage cap (MB)" input
   - [ ] Implement settings save: Save to localStorage on change

8. **Developer Console modal** (conditional):
   - [ ] Implement Developer Console modal: Top bar (heading + Close button), tab navigation (IndexedDB + Logs)
   - [ ] Implement IndexedDB tab: Table selector (dropdown), table view (record list), "View Details" per record (expandable JSON), "Export Table as JSON" button, "Clear All Data" button
   - [ ] Implement Logs tab: Placeholder "Logging not yet implemented" message
   - [ ] Implement Storage Inspector (optional): Storage quota, breakdown by table, orphaned data detector, "Clean Up" button

9. **Developer mode panels in Session Detail** (conditional):
   - [ ] Implement Chunk List disclosure: "Show Chunks ▶" toggle, scrollable chunk list (ID, start time, duration, byte size, "Play" button)
   - [ ] Implement Snip List disclosure: "Show Snips ▶" toggle, scrollable snip list (ID, time range, duration, transcript preview, "Play" button)
   - [ ] Implement Volume Histogram disclosure: "Show Histogram ▶" toggle, line graph or bar chart (volume over time, snip boundaries)
   - [ ] Implement Doctor Panel disclosure: "Show Doctor ▶" toggle, "Run Doctor" button, doctor report (summary + expandable JSON)

10. **Integration with lib packages**:
    - [ ] Import and call `capture-engine.startCapture()`, `stopCapture()`
    - [ ] Import and call `volume-analyzer.proposeSnips()`
    - [ ] Import and call `transcription-client.validateKey()`, `transcribeAudio()`
    - [ ] Import and call `playback-engine.playSession()`, `playChunk()`, `playSnip()`
    - [ ] Import and call all `session-store` interfaces: `createSession()`, `getSession()`, `listSessions()`, `deleteSession()`, `getChunksForSession()`, `writeVolumeProfile()`, `writeSnip()`, `writeTranscript()`, `enforceRetentionPolicy()`, `getStorageUsage()`

11. **Testing and validation**:
    - [ ] Manual walkthrough checklist (see Validation Plan above)
    - [ ] Test on iPhone (12/13/14/15 size class) in iOS Safari PWA mode
    - [ ] Test microphone permission flow (grant, deny, re-prompt after cold start)
    - [ ] Test recording flow (start, stop, chunks encode, playback)
    - [ ] Test transcription flow (key validation, transcribe snips, copy transcript)
    - [ ] Test developer mode (enable, 🐞 icon, developer panels, Developer Console)
    - [ ] Test error handling (mic denied, mic ghost, transcription failure, playback failure)
    - [ ] Test storage and retention (enforce retention policy, DATA chip updates, delete sessions)

---

## Customer Relationships

The PWA is a customer of:

- `packages/lib/capture-engine` (see capture-engine/customers/web-whisper-pwa.md)
- `packages/lib/volume-analyzer` (see volume-analyzer/customers/web-whisper-pwa.md)
- `packages/lib/transcription-client` (see transcription-client/customers/web-whisper-pwa.md)
- `packages/lib/playback-engine` (see playback-engine/customers/web-whisper-pwa.md)
- `packages/datastore/session-store` (see session-store/customers/web-whisper-pwa.md)

Customer request sections will be filled by Phase 04 customer-request agents.
