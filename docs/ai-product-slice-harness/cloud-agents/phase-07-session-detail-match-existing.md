# Phase 07: Session Detail Visual Match Implementation

**Package**: apps/web-whisper-pwa  
**Spec**: apps/web-whisper-pwa/docs/specs/20260827044510-feedback-session-detail-match-existing.md  
**Status**: unresolved  
**Depends on**: playback-engine volume control (spec 20260827044500) must be merged first

## Task Summary

Match existing Web Whisper session-detail screen (iPhone shots 01-06) in the harness PWA. Focus: visual layout, volume control, transcription retry, Chunks/Snips as user feature, rate-limit error display, delete modal copy.

## Critical Design Requirements

**Read this first:**
1. **SNIPS LIST IS THE MAIN PRODUCT FEATURE** - Not a developer-mode leftover
   - Primary purpose: per-snip RETRY for debugging failed transcriptions
   - Must show actual error text on failed snips (readable, not truncated)
   - **DO NOT copy the cramped tiny bottom panel from existing app** (shots show bad UX)
   - Spec a proper scrollable iPhone-friendly list with generous touch targets
2. **DO NOT add histogram/doctor/ladybug to PWA** - These are Isolation Demo visual references
3. **Home/Recording layouts are open** - Do NOT spec or redesign without more shots

## What to Change

### 1. SessionDetailScreen Layout (src/screens/SessionDetailScreen.tsx)

**From:** Full-page with "← Sessions" back button, definition list, big "Play Session" CTA

**To:** RECORDED SESSION card with:
- Close button (top-right, closes overlay/modal or navigates back)
- Trash icon (top-right, next to Close, triggers delete modal)
- Hero section:
  - Duration (large): "17m 11s"
  - Captured range: "Jun 24 09:00 AM → 09:17 AM" (compute from `session.createdAt + session.duration`)
  - Size: "7.865 MB"
  - Format + Chunks: "audio/mpeg · Chunks: 256"
- Playback controls:
  - Round play/pause button
  - Thin progress bar (seekable)
  - Time display: "0:12 / 0:56"
  - **Volume slider** (horizontal range input, calls `handle.setVolume(value)`) - NEW
  - Remove −15s/+15s skip buttons (not in existing app)

**Styling:**
- Dark card background with teal border accent
- Rounded corners (16-20px)
- Match visual baseline colors/typography
- iPhone-first (~390px viewport)

### 2. Transcription Section

**Additions:**
- **RETRY TX button** (global, retries all failed snips) - NEW
- **"Transcribed N of N snips" status line** (below transcript or below progress) - NEW
- **Error summary line** (if any snip failed): "37 snip transcription errors recorded. See the snip list for details." (red text) - NEW
- Transcript box with teal snip highlights (already exists, verify styling matches)

**Behavior:**
- RETRY TX button: calls transcription orchestration for all failed snips, shows progress
- Error summary: links to Snips tab or auto-scrolls to snip list

### 3. SNIPS LIST - Proper Scrollable Product UI (PRIMARY FEATURE)

**From:** Developer-mode-only disclosures (Show Chunks ▶ / Show Snips ▶)

**To:** Proper iPhone-friendly scrollable snips list:

**CRITICAL - Read Before Implementing:**
- **DO NOT copy the cramped tiny bottom panel from existing app** (shots 02/03 show bad UX)
- Spec a proper scrollable list that works on iPhone (~390px viewport)
- **Main purpose:** Per-snip RETRY for debugging failed transcriptions
- Show actual error text on failed snips (primary reason this UI exists in product)

**Snips List Layout:**
- Prominent section in session detail (NOT hidden, NOT tiny, NOT cramped)
- Header: "Snips (66)" or similar (show count)
- **Scrollable vertical list** (proper scroll, generous touch targets 44px min)
- Per-snip row:
  - Snip number and time range: "#1 20.6s 0:00 → 0:21"
  - **Transcribed badge** (teal, when successful) - NEW
  - **RETRY button** (per-snip, if failed) - NEW, PRIMARY FEATURE
  - Download icon (optional, secondary)
- **Inline error display** (red text, full message visible or expandable):
  - Example: "Rate limit reached for model 'whisper-large-v3-turbo' in organization..."
  - Must be readable (NOT truncated to uselessness)
  - This is the main debugging interface for transcription failures
  - Use transcription-client ERROR_CODES.RATE_LIMIT (already exists)

**Chunks List (Secondary, Optional):**
- Lower priority than snips list
- If implemented: "#1 4.03s 31.5 KB" with play icon
- Can be separate disclosure or omitted if space constrained

**What NOT to Include (Isolation Demo Features, NOT PWA UI):**
- **Histogram** (volume graph from shot-02): This is volume-analyzer Isolation Demo visual reference, NOT PWA UI
- **Doctor/stethoscope icon**: Keep in developer mode if exists, do NOT add to product UI
- **Ladybug icon**: Do NOT add to product UI
- **Graph icon**: Do NOT add to product UI

### 4. Delete Modal Copy

**From:** "Delete this session? This cannot be undone."

**To:** Match existing app:
- Heading: "Delete recording?"
- Body: "Delete Recording MM:SS? This cannot be undone." (use session duration in MM:SS format, e.g., "09:00")
- Buttons: "Keep" (left, secondary) | "Delete" (right, destructive red)
- Blurred backdrop (dark overlay, 50% opacity)

### 5. Volume Control Integration

**Requires:** playback-engine setVolume (spec 20260827044500) implemented and merged

**Implementation:**
- Add volume slider to playback controls section
- Horizontal range input: `<input type="range" min="0" max="1" step="0.01" defaultValue="1" />`
- Call `handle.setVolume(value)` on input event
- Position: to right of progress bar or below time display
- Styling: match existing app visual baseline (teal accent, dark background)

## What NOT to Change

**DO NOT redesign or spec these (open questions, wait for more shots):**
- Home/Sessions list layout (record button placement is open question)
- Live recording overlay (Phase 7.1b placeholder, screenshot incoming)
- Settings modal (not in scope)

**DO NOT add these to PWA (Isolation Demo visual references only):**
- Histogram (volume graph) - This is volume-analyzer Isolation Demo input, NOT PWA UI
- Doctor/stethoscope icon - Keep in developer mode if exists, do NOT add to product UI
- Ladybug icon - Do NOT add to product UI
- Graph icon - Do NOT add to product UI

**DO NOT invent new package features:**
- Do NOT add new capture-engine features (not requested)
- Do NOT add new session-store fields (compute captured-until from createdAt+duration)
- Do NOT add new transcription-client features (ERROR_CODES.RATE_LIMIT exists)

**DO NOT commit:**
- node_modules, dist, or lockfile changes

## Implementation Order

1. **Wait for upstream:** Confirm playback-engine volume control merged (spec 20260827044500)
2. Update SessionDetailScreen layout (hero section, Close/trash buttons)
3. Add volume slider to playback controls (using playback-engine setVolume)
4. Add RETRY TX button and "Transcribed N of N" status line
5. Move Chunks/Snips to always-visible segmented control (remove developer-mode gate)
6. Add per-snip RETRY button and Transcribed badge
7. Add inline rate-limit error display on snip rows
8. Update delete modal copy ("Delete Recording MM:SS?")
9. Test on iPhone Safari PWA (screenshot proof required)
10. Run `make build` to rebuild docs/ folder for GitHub Pages
11. Update spec with Resolution section and screenshot proof

## Stop Conditions

Mark spec resolved when:
1. RECORDED SESSION card layout matches iPhone shots
2. Close and trash buttons functional
3. Volume slider present and working (playback-engine setVolume)
4. RETRY TX button and per-snip RETRY buttons functional
5. "Transcribed N of N snips" status line displayed
6. Chunks/Snips as user feature (segmented control, not developer-only)
7. Rate-limit error displayed inline on snip rows
8. Delete modal copy matches: "Delete Recording MM:SS?"
9. iPhone screenshot proof provided (before/after comparison)
10. `make build` completed, docs/ folder updated
11. Spec updated with Resolution section documenting what shipped

## Implementation Prompt

```
Implement session-detail visual match per feedback spec 20260827044510-feedback-session-detail-match-existing.md.

Prerequisites:
- Confirm playback-engine volume control merged (spec 20260827044500)
- Read iPhone screenshots in /workspace/uploads/existing-app/full/shot-*.png

CRITICAL - Read Before Starting:
1. SNIPS LIST IS THE MAIN PRODUCT FEATURE (not debug leftover)
   - Primary purpose: per-snip RETRY with visible error messages
   - DO NOT copy the cramped tiny bottom panel from existing app
   - Spec a proper scrollable iPhone-friendly list
2. DO NOT add histogram/doctor/ladybug to PWA (Isolation Demo visual references only)
3. DO NOT redesign Home/Recording without more shots (open questions remain)

Requirements:
1. Update SessionDetailScreen layout to RECORDED SESSION card:
   - Close button (top-right)
   - Trash icon (top-right, triggers delete modal)
   - Hero: duration (large), captured range (createdAt → createdAt+duration), size, format+chunks
   - Playback: round play/pause, thin progress bar, time display, volume slider
   - Remove −15s/+15s skip buttons
2. Add volume slider:
   - Range input: min=0 max=1 step=0.01 default=1
   - Calls handle.setVolume(value) from playback-engine
   - Position: to right of progress or below time display
3. Transcription section:
   - Add RETRY TX button (global, retries all failed snips)
   - Add "Transcribed N of N snips" status line
   - Add error summary line (if any failed): "N snip transcription errors recorded. See the snip list for details."
4. SNIPS LIST - Proper scrollable product UI (PRIMARY FEATURE):
   - DO NOT copy cramped bottom panel from existing app
   - Header: "Snips (N)"
   - Scrollable vertical list (generous touch targets, NOT tiny)
   - Per-snip: "#1 20.6s 0:00 → 0:21" with Transcribed badge, RETRY button
   - Inline error display (full message, readable): "Rate limit reached for model..."
   - Use transcription-client ERROR_CODES.RATE_LIMIT (already exists)
   - Main purpose: per-snip RETRY for debugging failed transcriptions
   - Chunks list is secondary/optional
5. Delete modal copy:
   - Heading: "Delete recording?"
   - Body: "Delete Recording MM:SS? This cannot be undone."
   - Buttons: "Keep" | "Delete"
   - Blurred backdrop
6. Test on iPhone Safari PWA (screenshot proof required)
7. Run `make build` to rebuild docs/ folder
8. Update spec with Resolution section and screenshot proof

Do NOT:
- Redesign Home/Record/Settings (open questions, wait for shots)
- Add histogram/doctor/ladybug to PWA (Isolation Demo visual refs only)
- Copy cramped bottom panel layout from existing app
- Add new session-store fields (use createdAt+duration)
- Commit node_modules, dist, or lockfiles

Stop when spec is resolved with Resolution section and iPhone screenshot proof.
```
