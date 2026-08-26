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

Based on the existing Web Whisper PWA:

### Color Palette

(To be confirmed by inspecting live PWA styles; placeholder descriptions below)

- **Primary brand color**: Likely blue or teal (used for primary buttons, active states, recording indicator)
- **Background**: Light neutral (white or very light gray for main screens)
- **Card background**: White or subtle off-white with shadow/border
- **Text primary**: Dark gray or black (high contrast for readability)
- **Text secondary**: Medium gray (for metadata, timestamps, durations)
- **Success/enabled**: Green (for transcription enabled badge, validation success)
- **Error/disabled**: Red (for transcription disabled badge, validation errors, recording errors)
- **Recording active**: Red (for recording indicator dot, Stop button accent)
- **Secondary actions**: Neutral gray or subtle blue

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

**What the user sees**:

- Top: Navigation bar with "Web Whisper" title (or app name), Settings icon (top-right)
- Main: Scrollable list of session cards (newest first), or "No sessions yet" empty state
- Bottom: "Start Recording" FAB (floating action button, bottom-right, prominent, red or primary brand color)

**Session card structure**:

- Timestamp: "Just now", "2 minutes ago", "Today at 3:45 PM", "Yesterday", "Jan 15" (human-friendly)
- Duration: "0:42", "1:23", "12:45" (MM:SS or HH:MM:SS)
- Transcription badge (if applicable): "Transcribed" (green checkmark icon + text), or "Transcribe" button, or "3 / 8 snips" progress indicator
- Play button: Inline play affordance (tap to play session without navigating), or tap entire card to open session detail
- Optional: Waveform thumbnail or volume sparkline (if current PWA has this; otherwise skip for Phase 01)

**Empty state**:

- Illustration or icon (microphone icon, friendly graphic)
- Text: "No recordings yet" (heading), "Tap the button below to start your first recording" (subheading)
- "Start Recording" FAB remains visible and prominent

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

**What the user sees**:

- Top: Navigation bar with back button (← Session List), "Settings" title
- Sections (grouped, clear hierarchy):

**Transcription** (section heading):

- Groq API Key: Input field (masked, e.g., `••••••••••••abcd1234`), "Validate" button, validation status indicator (green "Enabled" checkmark or red "Disabled" / "Invalid" X)
- Transcription status: "Transcription Enabled" (green) or "Transcription Disabled" (gray), or "API key invalid" (red)
- Help text: "Add your Groq API key to enable transcription. Whisper via Groq is inexpensive; still, usage is your responsibility." (small, gray)

**Storage** (section heading):

- Storage cap: Slider (e.g., 100 MB to 2 GB, default 500 MB), current value displayed ("500 MB")
- Current usage: "Using 127 MB of 500 MB" (progress bar or text)
- "Clear Old Sessions" button: Manual retention enforcement (shows confirmation dialog: "Delete oldest sessions to free space?")

**Developer Mode** (section heading):

- "Developer Mode" toggle (off by default)
- Help text: "Show advanced debugging panels: chunk lists, snip lists, volume histogram, Doctor, Console." (small, gray)

**About** (section heading, optional):

- App version: "Web Whisper v2.0.0" (or version number)
- Link to GitHub repo, documentation, or help

---

### Developer Mode Console (Conditional)

**What the user sees** (only if developer mode enabled):

- Top: Navigation bar with back button (← Settings), "Console" title
- Tabs or sections:

**IndexedDB Tables** (tab):

- Table selector dropdown: "Sessions", "Chunks", "Volume Profiles", "Snips", "Transcripts"
- Selected table displayed as paginated list (ID, key fields, "View Details" button)
- Record count: "127 chunks across 12 sessions"
- Actions: "Export Table as JSON", "Clear All Data" (with confirmation)

**Logs** (tab, if logging implemented):

- Per-session structured logs (select session from dropdown, view log entries)
- Log entry: timestamp, level (info, warn, error), message, JSON details (expandable)

**Storage Inspector** (tab):

- Storage quota display: "Using 127 MB of 500 MB device storage"
- Breakdown by table: Sessions (45 MB), Chunks (75 MB), Transcripts (7 MB), etc.
- Orphaned data detector: "3 orphaned chunks (no parent session), 1 orphaned transcript (snip deleted)" (with "Clean Up" button)

---

## Interaction Patterns (Preserve from Original)

### Navigation

- **Bottom navigation or tab bar**: NOT used (single-page app with hierarchical navigation)
- **Hierarchical navigation**: Home (session list) → Session Detail, Home → Settings → Console, Home → Recording (modal or full-screen)
- **Back button**: Always present in navigation bar (top-left) when not on home screen, returns to previous screen
- **FAB (Floating Action Button)**: "Start Recording" button always visible on home screen, bottom-right, floats above session list

### Recording Flow

1. Home → Tap "Start Recording" FAB → Recording screen (full-screen or modal)
2. Recording screen → Tap "Stop" → Navigate to session detail (or back to home with new session at top)
3. No "Cancel" or "Pause" in Phase 01 (recording is start-to-stop, no interruption)

### Playback Flow

1. Home (session list) → Tap session card → Session Detail
2. Session Detail → Tap "Play Session" → Playback controls appear inline, audio plays
3. Or: Home (session list) → Tap play button on session card → Inline playback starts (mini-player or opens session detail)

### Transcription Flow

1. Session Detail → Tap "Transcribe" → Progress indicator appears ("Analyzing volume...", "Transcribing...")
2. Wait 5-30 seconds (depending on session length)
3. Transcript text appears below session metadata, "Copy Transcript" button
4. Tap "Copy Transcript" → Transcript copied to clipboard, confirmation toast ("Copied!")

### Settings Flow

1. Home → Tap Settings icon (top-right) → Settings screen
2. Settings → Enter Groq API key → Tap "Validate" → Status updates ("Enabled" or "Invalid")
3. Settings → Adjust storage cap slider → Value updates immediately
4. Settings → Toggle "Developer Mode" on → Navigate back to Session Detail → Developer panels now visible

---

## Visual Design Constraints

### Do NOT Change

- Overall color palette (primary brand color, success/error colors, recording indicator red)
- Typography (system font, weight hierarchy, size relationships)
- Layout structure (session cards on home, session detail sections, settings grouped sections)
- Touch target sizes (minimum 44×44pt)
- Navigation hierarchy (hierarchical, not tabbed)
- FAB prominence ("Start Recording" button is the primary action, always visible on home)

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

**Preserve calm, immediate, durable feeling.**

- Uncluttered layouts (no chrome overload)
- Prominent primary actions ("Start Recording", "Play", "Transcribe")
- Clear information hierarchy (duration, timestamp, status are secondary to actions)
- Honest feedback (playback is proof; empty sessions say "no playable audio", not spinner forever)
- Developer tools stay behind a door (Settings → Developer Mode; do not clutter default UI)

**Reference the original Web Whisper PWA** at [https://unlox775.github.io/web-whisper/](https://unlox775.github.io/web-whisper/) for:

- Exact color values (inspect with browser dev tools)
- Font sizes and weights (inspect with browser dev tools)
- Spacing and padding (inspect with browser dev tools)
- Card shadows and borders (inspect with browser dev tools)
- Icon style (simple, line-based, or solid fills)

**Do NOT redesign.** This is an architecture rebuild. The visual design is already proven and trusted. Keep it.

---

## Next Steps

After Phase 02 (slice-up selection and scaffold):

1. Create a living style guide or design tokens file (e.g., `design-tokens.css` or `theme.ts`) with color palette, typography scale, spacing scale extracted from the original PWA
2. Reference this visual baseline in package specs (especially `apps/web-whisper-pwa` spec and any UI package specs)
3. During Phase 06 implementation, compare final PWA screens to original PWA screenshots side-by-side to ensure visual fidelity
4. In Phase 07 feedback, call out any visual regressions (color mismatch, layout shift, font size change) as bugs, not features
