# Web Whisper PWA

User-facing Progressive Web App for iPhone. Owns navigation, UI screens (home, session list, session detail, settings, developer mode), platform permissions (microphone), settings persistence, and orchestration of the lib packages and session-store.

## Target Device

iPhone, used as a Progressive Web App (Add to Home Screen). Desktop/web can work later; it is backlog, not the default.

## Visual Design

Preserves the theme, visual identity, and overall look from the live PWA at https://unlox775.github.io/web-whisper/. See `docs/VISUAL-BASELINE.md` for exact colors, layout, and interaction patterns. This is an architecture replacement, not a redesign.

## How to Run

### Development Mode

```bash
npm install
npm start
```

This starts the Vite development server on http://localhost:5173. Open in a browser to test.

**For iPhone testing:**
1. Build and deploy to a public URL (see Production Build below)
2. Open the URL in iOS Safari
3. Tap Share → "Add to Home Screen"
4. Launch from home screen icon for full PWA experience

### Production Build

```bash
npm run build
```

This creates a production build in `dist/` folder with:
- Minified JavaScript and CSS
- Service worker for offline support
- PWA manifest for installability

**Deploy options:**
- **GitHub Pages**: Deploy `dist/` folder to GitHub Pages (see instructions below)
- **Static hosting**: Upload `dist/` folder to any static host (Netlify, Vercel, etc.)

### GitHub Pages Deployment

If this project will use GitHub Pages:

1. Build the app:
   ```bash
   npm run build
   ```

2. Deploy to `gh-pages` branch (if using `gh-pages` package):
   ```bash
   npm install -D gh-pages
   npx gh-pages -d dist
   ```

3. Enable GitHub Pages in repository settings (Settings → Pages → Source: `gh-pages` branch)

4. Access at: `https://[username].github.io/[repo-name]/`

## Architecture

### Tech Stack

- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite 5
- **PWA Plugin**: vite-plugin-pwa (workbox service worker)
- **Styling**: Inline styles with theme tokens (no CSS-in-JS library)
- **Storage**: IndexedDB (via custom wrapper in `sessionStore`)
- **Settings**: localStorage

### Project Structure

```
apps/web-whisper-pwa/
├── src/
│   ├── App.tsx                      # Main app component with routing
│   ├── main.tsx                     # React entry point
│   ├── theme.ts                     # Design tokens (colors, spacing, typography)
│   ├── screens/
│   │   ├── Home.tsx                 # Session list + capture card + onboarding
│   │   ├── Recording.tsx            # Active recording UI
│   │   └── SessionDetail.tsx        # Playback, transcription, developer tools
│   ├── components/
│   │   ├── SettingsModal.tsx        # Settings modal overlay
│   │   └── DeveloperConsole.tsx     # Developer console (IndexedDB inspector)
│   ├── packages/                    # Stub implementations of lib packages
│   │   ├── types.ts                 # TypeScript interfaces for all packages
│   │   ├── sessionStore.ts          # IndexedDB wrapper for session/chunk/snip/transcript data
│   │   ├── captureEngine.ts         # Microphone → MediaRecorder → chunks
│   │   ├── volumeAnalyzer.ts        # Volume analysis and snip proposal
│   │   ├── transcriptionClient.ts   # Groq API key validation and transcription
│   │   └── playbackEngine.ts        # Audio playback controller
│   └── utils/
│       ├── settings.ts              # localStorage wrapper for settings
│       └── format.ts                # Format helpers (duration, timestamp, bytes)
├── public/
│   ├── icon-192.png                 # PWA icon (192x192)
│   └── icon-512.png                 # PWA icon (512x512)
├── index.html                       # HTML entry point
├── vite.config.ts                   # Vite + PWA configuration
├── package.json                     # Dependencies and scripts
└── README.md                        # This file
```

### Package Integrations

The PWA integrates with five lib packages and one datastore package. **Note:** The current implementation uses stub interfaces in `src/packages/` because the actual packages are not yet implemented. When the packages are ready, replace these stubs with actual imports from `packages/lib/*` and `packages/datastore/session-store`.

- **capture-engine**: Microphone permission, PCM capture, MP3 encoding, chunk writing
- **volume-analyzer**: Volume profile computation, snip proposal based on quiet regions
- **transcription-client**: Groq API key validation, Whisper transcription via Groq API
- **playback-engine**: Audio playback controller for sessions/chunks/snips
- **session-store**: IndexedDB authority for sessions, chunks, volume profiles, snips, transcripts

### Core Flows

#### 1. Recording Flow
- User taps "Start recording" on Home
- PWA calls `sessionStore.createSession()` → receives `sessionId`
- PWA calls `captureEngine.startCapture(sessionId)` → receives capture handle
- PWA navigates to Recording UI (duration counter, chunk count in developer mode)
- User taps "Stop Recording" → PWA calls `handle.stop()`
- PWA navigates to Session Detail with new session

#### 2. Playback Flow
- User taps session card on Home → navigates to Session Detail
- User taps "Play Session" → PWA calls `playbackEngine.playSession(sessionId, chunks)`
- Audio plays, seek bar updates, playback controls work (play/pause, 15s skip)

#### 3. Transcription Flow
- User opens Settings, enters Groq API key → PWA validates via `transcriptionClient.validateKey()`
- User opens Session Detail, taps "Transcribe Session"
- PWA calls `volumeAnalyzer.proposeSnips()` if not already done
- PWA iterates snips, calls `transcriptionClient.transcribeAudio()` for each
- PWA writes transcripts to session-store, displays concatenated text

#### 4. Settings Persistence
- PWA loads settings from localStorage on app launch
- User changes settings in Settings modal → PWA saves to localStorage immediately
- Settings: `groq_api_key`, `storage_cap_mb`, `developer_mode_enabled`, `onboarding_dismissed`

#### 5. Developer Mode
- User enables "Developer mode" in Settings
- PWA shows 🐞 bug icon in Home header
- Session Detail shows developer panels: Chunk List, Snip List, Volume Histogram (placeholder), Doctor (placeholder)
- Developer Console (🐞 icon) shows IndexedDB inspector (Sessions, Chunks, Volume Profiles, Snips, Transcripts tables)

## Visual Design

### Color Palette

- **Background**: Dark navy-black `#0a0f18`
- **Card background**: Lighter dark `#111a26`
- **Border radius**: 16–20px on all cards, buttons, inputs
- **Primary accent**: Cyan/teal `#22d3ee` (links, ENABLE chip, active states)
- **Text primary**: White `#ffffff`
- **Text secondary**: Light gray `#9ca3af` (metadata, help text)
- **Gradient CTA**: Cyan-to-blue gradient on "Start recording" button
- **Error**: Red `#ef4444`
- **Success**: Green `#10b981`
- **Warning**: Orange `#f59e0b`

### Typography

- **Font family**: San Francisco (iOS), Roboto (Android fallback), system-ui
- **Headings**: Bold weight (600), clear hierarchy
- **Body text**: Regular weight (400), 15–16px base
- **Metadata**: Light gray, 13–14px, secondary color
- **Touch targets**: Minimum 44×44pt (iOS HIG standard)

### Layout

- **Fixed header**: "Web Whisper" title + DATA chip + Settings button + 🐞 icon (developer mode)
- **Scrollable main area**: Onboarding card + CAPTURE card + session list
- **Cards**: Dark `#111a26` background, 16–20px radius, subtle bluish border
- **Modals**: Slide up from bottom (Settings, Developer Console)

## Known Limitations (Phase 06)

1. **Package stubs**: The five lib packages are stubbed in `src/packages/`. When the actual packages are implemented, replace stubs with real imports.

2. **Icons**: Placeholder icon files are in `public/`. Replace with actual PNG icons (192×192 and 512×512) for production.

3. **Microphone capture**: Uses browser `MediaRecorder` API with `audio/webm;codecs=opus` format. For MP3 output, would need to integrate lamejs or similar encoder. Current implementation stores WebM chunks.

4. **Volume analysis**: Stub implementation generates synthetic volume data. Real implementation would decode audio and compute actual volume samples.

5. **Transcription**: Stub implementation returns placeholder text. Real implementation would call Groq Whisper API with actual API key validation.

6. **iOS limitations**: PWAs on iOS cannot play audio when backgrounded (platform limitation). Microphone permission re-prompts after cold start (expected iOS behavior).

7. **Desktop layout**: Not optimized for desktop browsers in Phase 06. Portrait iPhone viewport is the primary target.

## Testing Checklist

### Manual Testing (iPhone Device Mode in Chrome)

- [ ] Home screen loads with "Web Whisper" header, DATA chip, Settings button
- [ ] Onboarding card visible on first launch, "Dismiss" button works
- [ ] CAPTURE card visible, "Start recording" button enabled
- [ ] Tap "Start recording" → Recording UI appears, duration counter updates
- [ ] Tap "Stop Recording" → Navigate to Session Detail
- [ ] Session Detail shows playback controls, "Play Session" button works
- [ ] Settings modal opens, Groq API key input validates
- [ ] Enable developer mode → 🐞 icon appears in header
- [ ] Developer Console opens, IndexedDB tables visible
- [ ] Session list shows recorded sessions, "Delete" button works
- [ ] Transcription flow (with valid Groq key): "Transcribe Session" → Progress bar → Transcript text
- [ ] Developer mode panels in Session Detail (Chunk List, Snip List) work

### Browser Compatibility

- **Primary target**: iOS Safari PWA (Add to Home Screen)
- **Testing**: Chrome iPhone device mode (F12 → Device toolbar → iPhone 12 Pro or similar)
- **Known good**: Chrome 120+, Safari iOS 16+
- **Known issues**: MediaRecorder format support varies (WebM/Opus on Chrome, may differ on Safari)

## Deployment Instructions

### For Local Testing

1. Install dependencies: `npm install`
2. Start dev server: `npm start`
3. Open http://localhost:5173 in Chrome
4. Open DevTools → Device toolbar (Ctrl+Shift+M or Cmd+Shift+M)
5. Select "iPhone 12 Pro" or similar device
6. Test all flows (recording, playback, transcription, settings, developer mode)

### For iPhone Testing

1. Build: `npm run build`
2. Deploy `dist/` folder to a public HTTPS URL (required for PWA + microphone permission)
3. Open URL in iOS Safari
4. Tap Share → "Add to Home Screen"
5. Launch from home screen icon
6. Test microphone permission, recording, playback

### For GitHub Pages

1. Build: `npm run build`
2. Deploy: `npx gh-pages -d dist` (or manual upload to `gh-pages` branch)
3. Enable GitHub Pages in repo settings
4. Access at: `https://[username].github.io/[repo-name]/`

## Next Steps (Phase 07 and Beyond)

1. **Replace package stubs**: When `packages/lib/*` are implemented, replace stub implementations in `src/packages/` with actual imports.

2. **Add actual icons**: Replace placeholder icons in `public/` with 192×192 and 512×512 PNG icons.

3. **Real transcription**: Integrate with Groq Whisper API (requires API key and HTTPS).

4. **Real volume analysis**: Decode audio chunks and compute actual volume samples (use Web Audio API or OfflineAudioContext).

5. **Improved MP3 encoding**: Replace MediaRecorder WebM output with lamejs MP3 encoding for better compatibility.

6. **Desktop layout**: Optimize for desktop browsers (responsive breakpoints, larger viewport).

7. **Offline support**: Service worker already installed, but test offline playback and session caching.

8. **Accessibility**: Add ARIA labels, improve keyboard navigation, test with VoiceOver (iOS screen reader).

9. **Performance**: Optimize IndexedDB queries, add pagination for large session lists.

10. **Error handling**: Improve error messages, add retry logic for API calls, handle edge cases (no microphone, storage quota exceeded).

## License

See root repository LICENSE file.
