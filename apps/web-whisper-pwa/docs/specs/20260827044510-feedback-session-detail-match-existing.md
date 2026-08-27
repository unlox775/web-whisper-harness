Spec Status: unresolved
Spec Type: feedback
Created: 2026-08-27T04:45:10Z
Product: apps/web-whisper-pwa

# Session Detail Visual Match Feedback Spec

## User Feedback

From iPhone screenshots of existing production app (https://unlox775.github.io):

### shot-01: Base Session Detail Card
- RECORDED SESSION card (rounded, dark background, teal border accent)
- Hero duration: "17m 11s" (large, prominent)
- Captured timestamp: "Jun 24 09:00 AM → 09:17 AM" (start → end range)
- Size: "7.865 MB"
- Transcription section with transcript text in scrollable box
- Teal snip highlights in transcript text (clickable/tappable regions)
- "Transcribed 66 of 66 snips." status line
- Top-right: trash icon (delete), Close button
- Clean, card-based layout (not full-page "← Sessions" navigation)

### shot-02: Chunks Tab (Visual Reference)
- Same session, now showing debug icons (ignore these for PWA: graph, stethoscope, ladybug)
- "Format: audio/mpeg · Chunks: 256" metadata line
- Round play button + thin progress bar + time display (0:00 / 17:10)
- **Note:** Existing app has cramped tiny bottom panel for chunks/snips. **Do NOT copy that cramped layout.**
- **Key insight:** Histogram shown in debug icons is Isolation Demo visual reference (volume-analyzer), NOT PWA UI

### shot-03: Snips List (PRODUCT UI - Main Feature)
- Same session, "Snips" selected
- Snip list: "#1 20.6s 0:00 → 0:21"
- Per-snip badges: "Transcribed" (teal badge)
- Per-snip actions: download icon, RETRY button
- **SNIPS LIST IS THE PRIMARY REQUIREMENT** (not a developer-mode leftover)
  - Main purpose: per-snip RETRY for failed transcriptions
  - Must show actual error text on failed snips (see shot-04)
  - Proper scrollable iPhone-friendly list (NOT cramped bottom panel)
  - Chunks toggle is secondary; snips-for-retry is core

### shot-04: Rate-Limit Error Display
- Scrolled snip view
- Red error message on snip row: "Rate limit reached for model 'whisper-large-v3-turbo' in organization..."
- Error is inline with the snip item, not a global toast
- User can see which specific snip failed and why

### shot-05: Delete Confirmation Modal
- Blurred backdrop (dark overlay)
- Modal card centered: "Delete recording?"
- Body text: "Delete Recording 09:00? This cannot be undone."
- Two buttons: "Keep" (left, secondary) "Delete" (right, destructive red)
- Clean, focused modal (no extra chrome)

### shot-06: Playback with Volume Control
- Different session (0m 56s)
- Playing: pause button visible, progress bar at 0:12 / 0:56
- **Volume slider visible** (horizontal slider to right of progress bar)
- "Transcribed 4 of 4 snips." status line below progress

## Current Harness Gaps (Verified on main)

1. **Layout:** SessionDetailScreen is full-page with "← Sessions" back button
   - Existing app uses RECORDED SESSION card overlay (not full-page navigation)
   - Harness has duration/recorded as definition list rows
   - Harness has big "Play Session" CTA button

2. **Playback Controls:**
   - Harness has −15s/+15s skip buttons (existing app does not show these)
   - **Harness missing volume slider** (shot-06 shows volume control while playing)
   - Progress bar and time display exist but layout differs

3. **Chunks/Snips:**
   - Harness has Chunks/Snips in developer-mode-only disclosures
   - Existing app treats Chunks/Snips as first-class user features with segmented control
   - Existing app shows format + count in header ("audio/mpeg · Chunks: 256")

4. **Transcription:**
   - Harness has "Copy Transcript" button
   - **Harness missing RETRY TX button** (global retry for failed transcriptions)
   - **Harness missing per-snip RETRY button** (shot-03 shows RETRY on each snip)
   - **Harness missing "Transcribed N of N snips" status line** (shot-01, shot-06)
   - **Harness missing inline rate-limit error display** (shot-04 shows error on snip row)

5. **Delete Modal:**
   - Harness has confirmation modal but copy may differ
   - Existing app: "Delete Recording HH:MM? This cannot be undone." + Keep/Delete
   - Harness may say "Delete this session?" (different copy)

6. **Card vs Page:**
   - Harness: full-page screen with back button
   - Existing app: RECORDED SESSION card with Close button (overlay or slide-up)

## Requested Outcome

### Visual Match Goals (iPhone-First)

Match the existing app's session-detail card from shots 01-06:

#### 1. RECORDED SESSION Card Layout
- **Card container** (not full-page):
  - Dark background with subtle teal border
  - Rounded corners (16-20px)
  - Close button top-right (text or icon)
  - Trash icon top-right (next to Close)
  
- **Hero section:**
  - Duration: large, prominent (e.g., "17m 11s")
  - Captured timestamp range: "Jun 24 09:00 AM → 09:17 AM"
  - Size: "7.865 MB"
  - Format + Chunks count: "audio/mpeg · Chunks: 256" (when available)

- **Playback controls:**
  - Round play/pause button (centered or left)
  - Thin progress bar (seekable)
  - Current time / duration display (e.g., "0:12 / 0:56")
  - **Volume slider** (horizontal, to right of progress or below) - **requires playback-engine setVolume from spec 20260827044500**
  - Remove −15s/+15s skip buttons (not in existing app)

#### 2. Transcription Section
- **Header:** "Transcription" with RETRY TX button (global retry)
- **Transcript box:**
  - Scrollable container (max-height, border)
  - Transcript text with teal snip highlights
  - Highlights are clickable/tappable (jump to snip or play snip)
- **Status line:** "Transcribed N of N snips." (below transcript or below progress)
- **Error summary:** If any snip failed, show red error line: "37 snip transcription errors recorded. See the snip list for details." (shot-01)

#### 3. Chunks/Snips Segmented Control (User Feature, Not Developer-Only)
- **Header:** "Chunks (256) · audio/mpeg" or "ips (66) · audio/mpeg" (count + format)
- **Segmented control:** Two tabs: "Chunks | Snips"
- **Chunks list** (when Chunks selected):
  - Per-row: "#1 4.03s 31.5 KB"
  - Play icon (inline, plays chunk)
  - Download icon (optional)
- **Snips list** (when Snips selected):
  - Per-row: "#1 20.6s 0:00 → 0:21"
  - Transcribed badge (teal, when transcribed)
  - Download icon
  - RETRY button (per-snip, if transcription failed)
  - **Inline error display** (red text below snip row if rate-limit or other error)

#### 4. Delete Confirmation Modal
- **Trigger:** Tap trash icon
- **Modal:**
  - Blurred backdrop (dark overlay, 50% opacity)
  - Centered card
  - Heading: "Delete recording?"
  - Body: "Delete Recording HH:MM? This cannot be undone." (use session duration in HH:MM format)
  - Buttons: "Keep" (left, secondary) | "Delete" (right, destructive red)

### Behavioral Match Goals

- **Volume control:** Use `PlaybackHandle.setVolume(level)` from playback-engine (spec 20260827044500)
- **Transcription retry:**
  - RETRY TX button (global): retries all failed snips
  - Per-snip RETRY button: retries only that snip
  - Show progress while retrying
- **Rate-limit error:** Display error inline on snip row (not just a toast)
  - Use `transcription-client` ERROR_CODES.RATE_LIMIT (already exists in client)
  - Show full error message (or truncated with "See details" disclosure)
- **Captured-until timestamp:** Compute from `session.createdAt + session.duration` (do NOT add new session-store field)
- **Chunks/Snips visibility:** Always visible (first-class user feature), NOT gated by developer mode

### What NOT to Port (Debug-Only in Screenshots)

Ignore these features visible in shot-02 (developer mode only):
- Graph icon (histogram in modal)
- Stethoscope/Doctor icon
- Ladybug icon (bug report)
- Green overlay squares (touch target debug visualization)
- Browser chrome (address bar, system status bar)

These remain in developer mode or are removed entirely.

## Notes for Phase 07 Implementation

### Scope
- Only session-detail screen
- **DO NOT redesign Home/Record/Settings** - Open questions remain, wait for more shots
- iPhone-first (~390px viewport width)
- **DO NOT copy the cramped panel layout from existing app** - Spec proper scrollable lists

### Critical Design Focus
1. **SNIPS LIST is the main product feature** (not a debug leftover)
   - Proper scrollable iPhone-friendly list
   - Per-snip RETRY with visible error messages
   - This is the primary reason snips UI exists in product
2. **Volume slider** for playback control
3. **Transcription section** with RETRY TX and status

### Dependencies
- **Upstream:** Requires playback-engine setVolume (spec 20260827044500) to be implemented first
- **Existing:** transcription-client already has ERROR_CODES.RATE_LIMIT (do NOT reinvent)
- **Existing:** session-store already has duration, size, chunks, snips, transcripts

### Implementation Order
1. Wait for playback-engine setVolume to be merged (spec 20260827044500)
2. Implement session-detail visual match with proper scrollable snips list
3. Test on iPhone Safari PWA (screenshot proof required)
4. Run `make build` to rebuild docs/ folder for GitHub Pages
5. Mark spec resolved with screenshot proof

### Out of Scope (Do NOT Implement)
- **Home/Sessions layout** - Open question, wait for more shots
- **Live recording overlay** - Phase 7.1b placeholder, screenshot incoming
- **Settings modal** - Not in scope for this iteration
- **Histogram in PWA** - This is volume-analyzer Isolation Demo visual reference, NOT PWA UI
- **Doctor/stethoscope/ladybug in PWA** - Keep in developer mode if exists, do NOT add to product UI
- New capture-engine features (not requested)
- New volume-analyzer features (not requested)
- New transcription-client features (ERROR_CODES.RATE_LIMIT already exists)

### Isolation Demo Visual References (NOT PWA Scope)
- Histogram (shot-02): Visual inspiration for volume-analyzer Isolation Demo
- Optional: Add note in volume-analyzer isolation-demo README pointing to shot-02

## Resolution Criteria

Mark this spec resolved when:
- [ ] RECORDED SESSION card layout matches iPhone shots
- [ ] Close and trash buttons present and functional
- [ ] Hero section shows duration, captured range, size, format+chunks
- [ ] Playback controls include volume slider (using playback-engine setVolume)
- [ ] Transcription section includes RETRY TX button
- [ ] "Transcribed N of N snips" status line displayed
- [ ] Chunks/Snips segmented control as user feature (not developer-only)
- [ ] Per-snip RETRY button on failed snips
- [ ] Rate-limit error displayed inline on snip row
- [ ] Delete modal copy matches: "Delete Recording HH:MM?"
- [ ] iPhone screenshot proof provided (before/after comparison)
- [ ] `make build` completed, docs/ folder updated for GitHub Pages
- [ ] Spec updated with Resolution section documenting what shipped
