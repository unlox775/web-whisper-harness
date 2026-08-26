# Web Whisper Visual Baseline

This document establishes the visual design and UI architecture baseline for the Web Whisper rebuild. The existing live PWA at [https://unlox775.github.io/web-whisper/](https://unlox775.github.io/web-whisper/) is the **visual source of truth**.

## Critical Principle

**This is an architecture replacement, not a redesign.**

Preserve the theme, visual identity, and overall look of the current Web Whisper. The rebuild changes the internal package structure, data flow, and code organization. It does NOT change the user-facing visual design, color palette, typography, layout density, or interaction patterns.

Isolation Demos for packages may look different (they are founder/developer operating surfaces, not production UI). The **final PWA app** should still look like Web Whisper.

---

## Target Device and Platform

**Primary target**: iPhone, used as a Progressive Web App (Add to Home Screen).

- Viewport: Mobile portrait (iPhone 12/13/14/15 size class, ~390px wide)
- Orientation: Portrait-first (landscape is not a priority for Phase 01)
- Platform: iOS Safari PWA (installed to home screen, not browser tab)
- Secondary: Desktop/web browser support is backlog, not the default. Do not optimize for desktop layout in Phase 01.

**PWA installation flow**:

1. User opens https://[deployed-url] in iOS Safari
2. Tap Share button → "Add to Home Screen"
3. PWA appears as app icon on home screen with Web Whisper branding
4. Launch from home screen (not Safari tab) for full-screen experience, no browser chrome

---

## Visual Identity (Preserve from Original)

Based on the live Web Whisper PWA at https://unlox775.github.io/web-whisper/ (inspected in Chrome DevTools iPhone 430×932):

### Color Palette

**Exact colors from live PWA:**

- **Background**: Dark navy-black `#0a0f18` (or very close to this)
- **Card background**: Lighter dark `#111a26` (or very close), distinct from main background
- **Card borders**: 1px bluish borders (subtle, low-contrast against dark cards)
- **Border radius**: 16–20px on all cards and buttons (generous, modern feel)
- **Primary accent**: Cyan/teal `#22d3ee` (used for links, ENABLE chip, active states)
- **Text primary**: White or near-white (high contrast on dark background)
- **Text secondary**: Light gray (for metadata, help text, status lines)
- **Gradient CTA**: Cyan-to-blue gradient on "Start recording" button (cyan `#22d3ee` fading to deeper blue, full-width pill)
- **Success/enabled**: Cyan `#22d3ee` ENABLE chip (rounded, filled)
- **Disabled**: Gray "DISABLED" chip (neutral, non-interactive)
- **Recording active**: Cyan (recording indicator, playback controls; NOT red in this design)
- **Storage chip**: Dark card background with light text "0 B / 200 MB" (DATA label above)

### Typography

(To be confirmed by inspecting live PWA; placeholder guidelines below)

- **System font stack**: San Francisco (iOS default), Roboto (Android fallback), system-ui
- **Headings**: Bold weight, clear hierarchy (session detail title, settings section headers)
- **Body text**: Regular weight, comfortable reading size (~16px base)
- **Metadata**: Slightly smaller, medium gray (timestamps, durations, chunk counts)
- **Buttons**: Medium or semibold weight for emphasis

### Layout Density

- **Compact but not cramped**: iPhone screen space is limited; use it efficiently without making controls tiny
- **Touch-friendly targets**: Minimum 44×44pt tap targets (iOS HIG standard)
- **Generous padding around primary actions**: "Start Recording" FAB should be prominent and easy to hit
- **Card-based layout**: Sessions appear as cards in a scrollable list, not a dense table

---

## Screen Layouts (Preserve Structure)

### Home / Session List

**What the user sees (from live PWA screenshots):**

**Header (fixed top):**
- Left: Bold "Web Whisper" title (white text, prominent weight)
- Center-right: DATA chip/badge showing storage usage "0 B / 200 MB" (dark card background, light text, rounded, compact)
- Top-right: "Settings" button (text button, clickable)
- Optional: 🐞 bug icon button (between DATA chip and Settings button, ONLY visible when developer mode is enabled)

**Main scroll area:**

1. **Onboarding card** (dismissible, shown on first use or until dismissed):
   - Dark card background (#111a26), rounded corners (16–20px), subtle bluish border
   - Bold heading: "Transcription setup is insanely easy."
   - Body text explaining Groq is separate service, free accounts, no credit card, recording works out of the box
   - Highlighted callout: Cyan-bordered box with "This uses one of the most amazing AI models. It is a crazy amount of value for free."
   - Numbered steps: "1. Create a free Groq account...", "2. Open Settings...", "3. We auto-check..."
   - Bottom actions: "Open Settings" and "Get Groq API key" buttons (cyan text links)
   - Top-right: "Dismiss" button (closes card)

2. **CAPTURE card:**
   - Dark card background, rounded corners, CAPTURE label/heading
   - Full-width cyan-to-blue gradient button: "Start recording" (pill shape, bold text, prominent)
   - Status line below button: "Recorder idle — tap start to begin a durable session." (light gray, small)

3. **Session list card** (empty state when no sessions):
   - Dark card background, rounded corners
   - Empty/blank panel (no "No sessions yet" text in baseline; just an empty rounded container)
   - When sessions exist: scrollable list of session cards (structure TBD, not shown in baseline screenshots)

**No FAB.** The "Start recording" button is inline in the CAPTURE card, not floating.

---

### Recording (Active)

**What the user sees**:

- Full-screen or near-full-screen recording UI (no distracting navigation chrome)
- Recording indicator: Red dot or pulsing circle (top-left or top-center), "Recording" label
- Duration counter: Large, prominent, live-updating (e.g., "0:00", "0:01", "0:02"..., "1:23")
- Stop button: Large, centered, red, easy to hit ("Stop Recording" or just "Stop")
- Optional (if developer mode enabled): Chunk count display (small, secondary, e.g., "7 chunks" below duration)
- Optional (if developer mode enabled): Buffer size meter (small, secondary, e.g., progress bar or numeric "Buffer: 2048 samples")

**Interaction**:

- Tap "Stop" → recording stops immediately, navigate to session detail (or back to session list with new session card at top)

---

### Session Detail

**What the user sees**:

- Top: Navigation bar with back button (← Session List), session timestamp as title (or "Session" + timestamp)
- Metadata section:
  - Timestamp: "Today at 3:45 PM" or "Jan 15, 2026 at 10:23 AM"
  - Duration: "2:15" (MM:SS or HH:MM:SS)
  - Optional: Recording date, device info (only if current PWA shows this)
- Playback section:
  - "Play Session" button (large, primary color) if not currently playing
  - Playback controls (play/pause, seek bar, current time / total duration) if playing
  - Audio plays from device speakers/headphones
- Transcription section (conditional):
  - If transcription enabled (Groq key valid) and session not yet transcribed: "Transcribe" button (prominent, secondary color)
  - If transcription in progress: Progress indicator ("Analyzing volume...", "Transcribing...", "3 / 8 snips transcribed")
  - If transcription complete: Full session transcript (concatenated snip texts, or organized by snip with timestamps), "Copy Transcript" button
  - If transcription disabled (no Groq key): "Transcription disabled. Add API key in Settings." (informational, not an error)
  - If transcription failed partially: "7 of 8 snips transcribed. 1 failed. Retry?" (with "Retry Failed" button)
- Actions:
  - "Delete Session" button (destructive action, bottom or in overflow menu)

**Developer mode additions** (conditional, only if developer mode enabled in Settings):

- **Chunk List** (disclosure or tab): Expandable section showing all chunks for session (ID, startTime, duration, byteSize, "Play Chunk" button for each)
- **Snip List** (disclosure or tab): Expandable section showing all snips (ID, startTime, endTime, duration, "Play Snip" button, transcript preview if available)
- **Volume Histogram** (disclosure or tab): Visualization of volume profiles across session timeline, with snip boundaries overlaid (e.g., line graph or bar chart, x-axis = time, y-axis = volume)
- **Doctor Panel** (disclosure or button): "Run Doctor" button → performs diagnostic checks (coverage, range access, per-chunk decode, snip scan), shows JSON report or summary in expandable section

---

### Settings

**What the user sees (from live PWA screenshots):**

**Settings sheet/modal** (overlays main screen):

- Top bar: "Settings" heading (left, bold), "Close" button (right, cyan text)
- Dark card/modal background (#111a26 or similar), rounded corners at top

**Transcription section:**

- Section heading: "Transcription" (bold, white)
- Status chips (inline, right-aligned): "DISABLED" (gray, rounded pill) or "ENABLE" (cyan #22d3ee, rounded pill, clickable)
- Help text: "Groq is a separate service (not this app). Their free account takes about a minute to set up, and this app auto-checks your key after you paste it. **It's easy to set up.**" (link on "It's easy to set up", cyan)
- Numbered steps: "1. Create a free Groq account...", "2. Paste the key here...", "3. Transcription turns on..."
- **Groq API key** input field:
  - Label: "Groq API key"
  - Text input: placeholder "SK-..." (dark background, light text, rounded)
  - Below input: "Key status: Missing" (light gray text) and "Recheck key" button (dark button, right-aligned)
- Help paragraph: "Need a key? **Create one in Groq Console**." (link cyan) "Groq is a separate service... See **Groq pricing**." (link cyan)

**App section:**

- Section heading: "App" (bold, white)
- Checkbox: "Enable developer mode" (unchecked by default, white checkbox on dark background)
- **Storage cap (MB)** input field:
  - Label: "Storage cap (MB)"
  - Number input: "200" (editable, dark background, light text, rounded)
  - No slider in baseline; just a text/number input

**No "Clear Old Sessions" button in baseline screenshots.** May be manual or automatic retention.

**No "About" section in baseline screenshots.** Settings are minimal: Transcription + App only.

---

### Developer Mode Console (Conditional)

**What the user sees** (only if developer mode enabled, based on founder vision; not visible in baseline screenshots because developer mode was off):

**Access:** 🐞 bug icon button appears in header (between DATA chip and Settings) when developer mode is enabled. Tap to open Console.

**Console screen/modal** (structure inferred from founder vision + harness patterns; exact layout TBD in Phase 02):

- Tabs: **IndexedDB** and **Logs** (horizontal tabs, cyan underline for active tab)

**IndexedDB tab:**

- Table selector: "Sessions", "Chunks", "Volume Profiles", "Snips", "Transcripts" (dropdown or tab pills)
- Selected table displayed as list/table (dark card background, scrollable)
- Each row: ID, key fields (timestamp, duration, status), "View Details" button (expands JSON)
- Record count: "127 chunks across 12 sessions" (top of list, light gray text)
- Actions (bottom or top): "Export Table as JSON", "Clear All Data" (destructive, with confirmation modal)

**Logs tab:**

- Per-session structured logs (if implemented; may be Phase 02 or later)
- Session selector: dropdown or list
- Log entries: timestamp, level (info/warn/error with color coding), message, JSON details (collapsible)
- Or: "Logging not yet implemented" placeholder

**Storage Inspector** (may be part of IndexedDB tab or separate disclosure):

- Storage quota: "Using 127 MB of 500 MB device storage" (matches DATA chip on home)
- Breakdown by table: Sessions (45 MB), Chunks (75 MB), Transcripts (7 MB), etc.
- Orphaned data detector: "3 orphaned chunks, 1 orphaned transcript" with "Clean Up" button

**Visual consistency:** Dark theme (#0a0f18 background, #111a26 cards), cyan accents, 16–20px radius, same as main app. Console is a developer surface but stays visually cohesive.

---

## Interaction Patterns (Preserve from Original)

### Navigation

- **Bottom navigation or tab bar**: NOT used (single-page app with overlay modals/sheets)
- **Modal/sheet overlays**: Settings opens as overlay sheet (slides up or fades in), can be closed with "Close" button (top-right)
- **Home screen is persistent**: "Web Whisper" header always visible, Settings and DATA chip always accessible
- **No FAB (Floating Action Button)**: "Start recording" button is inline in CAPTURE card, not floating over content
- **Developer console access**: 🐞 bug icon button in header (only when developer mode enabled) opens Console overlay

### Recording Flow

1. Home → Tap "Start recording" button (inline in CAPTURE card, full-width gradient pill) → Recording UI appears (in-place state change or modal)
2. Recording active → Tap "Stop" button → Recording stops, session saved, new session appears in session list (or navigates to session detail)
3. No "Cancel" or "Pause" in Phase 01 (recording is start-to-stop, no interruption)
4. Microphone permission prompt may appear on first start (iOS PWA re-prompts after cold start; expected platform behavior)

### Playback Flow

1. Home (session list) → Tap session card → Session Detail
2. Session Detail → Tap "Play Session" → Playback controls appear inline, audio plays
3. Or: Home (session list) → Tap play button on session card → Inline playback starts (mini-player or opens session detail)

### Transcription Flow

1. **First-time setup**: Home → Tap "Open Settings" or Settings button → Enter Groq API key → Key auto-validates → Transcription status changes to "ENABLE" (cyan chip)
2. **Per-session transcription** (structure inferred; not shown in baseline screenshots because no sessions exist):
   - Session Detail → Tap "Transcribe" button → Progress indicator ("Analyzing volume...", "Transcribing...")
   - Wait 5-30 seconds (depending on session length)
   - Transcript text appears, "Copy Transcript" button (or transcript is auto-copied; TBD)
   - Tap "Copy Transcript" → Clipboard confirmation (toast or inline feedback)
3. **Disabled state**: If no Groq key, transcription controls are hidden or show "Add API key in Settings" (not an error; recording still works)

### Settings Flow

1. Home → Tap "Settings" button (top-right header) → Settings sheet opens (overlay modal)
2. Settings → Transcription section → Enter Groq API key in text field → Key auto-validates on blur or after typing → "Key status: Missing" changes to "Key status: Valid" (or similar), "DISABLED" chip changes to "ENABLE" (cyan)
3. Settings → Transcription section → Tap "ENABLE" chip (if already enabled) to disable transcription (toggles between DISABLED/ENABLE)
4. Settings → App section → Edit storage cap number input (e.g., change "200" to "500") → Value saves on blur or change
5. Settings → App section → Check "Enable developer mode" checkbox → Close Settings → 🐞 bug icon now appears in header (can access Console)
6. Settings → Tap "Close" button (top-right) → Settings sheet closes, returns to home

---

## Visual Design Constraints

### Do NOT Change

- **Dark theme**: Navy-black background (#0a0f18), lighter cards (#111a26), subtle bluish borders
- **Cyan accent** (#22d3ee): links, ENABLE chip, gradient CTA button (cyan→blue)
- **Border radius**: 16–20px on all cards, buttons, inputs (generous, modern feel)
- **Typography**: System font (San Francisco on iOS), bold "Web Whisper" heading, regular body text, light gray help text
- **Layout structure**: Fixed header (Web Whisper + DATA + Settings), scrollable main area (onboarding card + CAPTURE card + session list), inline "Start recording" button (NOT floating FAB)
- **Settings as overlay sheet**: Modal/sheet that overlays home, closes with "Close" button
- **Developer mode gating**: 🐞 bug icon ONLY appears when developer mode is enabled, Console is not on default home chrome
- **Touch target sizes**: Minimum 44×44pt for all interactive elements (iOS standard)

### DO Change (Internal Only)

- Code structure (from monolithic to package-based)
- Data flow (from direct IndexedDB writes to store interfaces)
- Component organization (from single codebase to apps/ + packages/)
- Build process (from original build to new harness-based build)

### MAY Change (With Justification)

- Exact text wording (if current wording is confusing or inaccurate, improve it)
- Error messages (if current errors are unhelpful, make them clearer)
- Empty states (if current empty state is missing, add friendly illustration and text)
- Loading states (if current loading indicators are unclear, improve them with progress or messages)
- Accessibility (ARIA labels, screen reader support, contrast ratios: improve as needed)

---

## Isolation Demo Visual Design

**Isolation Demos are NOT production UI.** They are founder/developer operating surfaces for testing packages in isolation.

Isolation Demos MAY use:

- Different color schemes (e.g., developer gray/blue theme instead of production brand colors)
- Grid/table layouts (for displaying chunk lists, volume profile data, JSON inspectors)
- Technical terminology (e.g., "chunk ID", "volume profile array", "IndexedDB transaction timing")
- Multiple panels, tabs, or sections (fixture selector, input controls, output display, event feed, telemetry log)
- Raw data displays (JSON views, hex dumps, timing charts)

Isolation Demos MUST:

- Be clearly labeled as demos (e.g., "Capture Engine Isolation Demo" heading, "Developer Surface" badge)
- Make data mode explicit (fixture, generated, real read-only, real write, sandbox) with visual indicator (badge, toggle, or section heading)
- Not be mistaken for production UI (use different chrome, add "DEMO" or "DEVELOPER" watermark, or use distinct layout)

**Example Isolation Demo layout**:

```
+---------------------------------------------------+
| [Package Name] Isolation Demo            [DEMO]  |
+---------------------------------------------------+
| Data Mode: [Fixture ▼] [Use Real Data Toggle]   |
+---------------------------------------------------+
| Inputs                | Outputs                   |
| - Fixture selector    | - Result display          |
| - Control buttons     | - Event feed              |
| - Parameter sliders   | - Telemetry log           |
+---------------------------------------------------+
| Internal State        | Raw Data Inspector        |
| - Current mode        | - JSON view               |
| - Queue depth         | - Timing chart            |
+---------------------------------------------------+
```

This layout is fine for Isolation Demos. It is NOT acceptable for production PWA screens.

---

## Responsive Behavior (iPhone Only for Phase 01)

**Target viewport**: iPhone portrait (~390px wide, ~844px tall for iPhone 12/13/14 size class)

- Layouts should be fluid (use percentages, flexbox, CSS Grid), not fixed-width
- Test on iPhone 12, 13, 14, 15 (standard size), and iPhone 12 Mini, 13 Mini (smaller size)
- Do NOT test on iPad or desktop browsers in Phase 01 (backlog)
- Do NOT implement landscape orientation optimizations in Phase 01 (portrait-first; landscape is acceptable but not optimized)

**Safe areas**:

- Respect iOS safe area insets (top notch, bottom home indicator)
- Use `env(safe-area-inset-top)`, `env(safe-area-inset-bottom)` in CSS
- FAB should be positioned above bottom safe area (not obscured by home indicator)
- Navigation bar should extend into top safe area (background color fills notch area)

---

## Accessibility (Maintain or Improve from Original)

### Minimum Requirements

- Color contrast: WCAG AA (4.5:1 for body text, 3:1 for large text and UI controls)
- Touch targets: 44×44pt minimum (iOS HIG)
- Focus indicators: Visible focus outline for keyboard navigation (rare on mobile, but required for accessibility)
- ARIA labels: Buttons and controls have accessible labels (e.g., "Start Recording", "Play Session", "Stop Recording")
- Screen reader support: VoiceOver (iOS) can navigate and operate the app (session list, playback controls, settings)

### Do NOT Rely On Color Alone

- Transcription status: Use icon + text ("Enabled" with green checkmark), not just green color
- Recording indicator: Use pulsing animation + text ("Recording"), not just red dot
- Error states: Use icon + text ("Invalid API key" with red X), not just red color

---

## Animation and Motion (Preserve Calm Feel)

The founder vision says: "Calm, immediate, durable. A tape recorder that happens to live in the browser."

### Do Use

- Subtle transitions: Page navigation (slide or fade, ~300ms)
- Progress indicators: Smooth progress bars for transcription, loading states
- Recording indicator: Pulsing or breathing animation on red dot (to show active state)
- Success feedback: Brief toast or checkmark animation on "Copied!" confirmation

### Do NOT Use

- Excessive animations: No gratuitous parallax, 3D transforms, particle effects
- Slow animations: Keep transitions fast (~200-300ms); do not delay user actions with slow animations
- Distracting motion: Recording screen should be calm (no bouncing, spinning, or flashing elements)

---

## Platform Integration (PWA on iOS)

### PWA Manifest

- App name: "Web Whisper" (or current name from original PWA)
- Short name: "Web Whisper"
- Start URL: `/` (home screen)
- Display mode: `standalone` (full-screen, no Safari chrome)
- Orientation: `portrait` (preferred)
- Background color: Match app background (white or light gray)
- Theme color: Match navigation bar color (primary brand color or white)
- Icons: Multiple sizes (192×192, 512×512) for home screen icon and splash screen

### iOS-Specific Behavior

- Microphone permission: iOS re-prompts PWAs for microphone permission after cold start (this is expected platform behavior; do not treat as product failure)
- Playback: Use standard HTML5 `<audio>` element (iOS Safari supports MP3 playback natively)
- Storage: Use IndexedDB (supported on iOS Safari PWA); localStorage for settings (small data only)
- No background audio: iOS PWAs cannot play audio when app is backgrounded (not a bug, platform limitation; document as known issue)

---

## Summary: Visual Design Philosophy

**Preserve calm, immediate, durable feeling with dark, modern aesthetic.**

- **Dark theme with cyan accents**: Navy-black background, lighter card panels, cyan (#22d3ee) for interactive elements and CTAs
- **Uncluttered layouts**: Fixed header, card-based main area, generous spacing, no chrome overload
- **Prominent primary action**: "Start recording" gradient button (cyan→blue, full-width pill) in CAPTURE card
- **Clear information hierarchy**: Storage usage and settings are accessible but not dominant; recording is the hero action
- **Honest feedback**: Onboarding card explains transcription setup honestly ("insanely easy", free, separate service); idle state says "tap start to begin"; no spinner or error when Groq key is missing (just disabled transcription)
- **Developer tools stay gated**: Checkbox in Settings enables developer mode → 🐞 bug icon appears → Console is accessible but not on default home

**Exact theme values from live PWA** (inspected Chrome DevTools iPhone 430×932):

- Background: `#0a0f18` (dark navy-black)
- Cards: `#111a26` (lighter dark, distinct from background)
- Borders: 1px bluish, subtle, low-contrast
- Border radius: 16–20px (generous, modern)
- Accent: `#22d3ee` (cyan/teal, for links, chips, gradient CTA)
- Text: White primary, light gray secondary
- Typography: System font (SF on iOS), bold headers, regular body
- Spacing: Generous padding in cards, comfortable touch targets (44×44pt minimum)

**Icon style** (inferred from baseline):

- Simple, possibly emoji or simple SVG icons (🐞 for developer mode)
- Minimal iconography overall; text-heavy UI (buttons use text labels, not icon-only)

**Do NOT redesign.** This is an architecture rebuild. The dark theme, cyan accents, generous radius, and calm layout are already proven and trusted. Keep them exactly.

---

## Next Steps

After Phase 02 (slice-up selection and scaffold):

1. Create a living style guide or design tokens file (e.g., `design-tokens.css` or `theme.ts`) with color palette, typography scale, spacing scale extracted from the original PWA
2. Reference this visual baseline in package specs (especially `apps/web-whisper-pwa` spec and any UI package specs)
3. During Phase 06 implementation, compare final PWA screens to original PWA screenshots side-by-side to ensure visual fidelity
4. In Phase 07 feedback, call out any visual regressions (color mismatch, layout shift, font size change) as bugs, not features
