Spec Status: resolved
Spec Type: feedback
Created: 2026-09-08T14:40:00Z
Resolved: 2026-09-08T15:15:00Z
Product: apps/web-whisper-pwa

# Feedback: Import / Export session zip is developer-mode only

## User Feedback

Dave: Import is currently front-and-center on Home LIBRARY — wrong. It’s a debugging operation. Same for export/download zip.

Import session zip and Export / download session zip must not appear in the normal product path. They stay in the app; they are just not everyday Library / Session Detail chrome.

## Requested Outcome

Gate visibility (and the actions) on the existing `developerModeEnabled` setting. Do **not** remove the feature.

1. **Developer mode off:** hide Import session zip (Home and Settings) and any Export / Download session zip controls.
2. **Developer mode on:** show them. Settings is the preferred primary place for import. Remove the Home LIBRARY import card if Settings-only is cleaner.
3. Session Detail **Export Session** / download session zip stays on the Debug tab, but only when developer mode is on.

### Copy

User-facing helper text should say these are developer debugging tools (not a Library product action). Keep slim-vs-debug and new-id import policy.

## Notes For Phase 07

- Keep product UI in `apps/web-whisper-pwa`. Consume existing session-store archive APIs.
- Cursor Cloud Agent only — never Codex.
- iPhone DevTools (~390px) screenshots: developer mode off → no import/export zip; on → visible in Settings (and Home only if still gated).
- Run `make build` so `docs/` PWA artifacts refresh.

## Out of scope

- Transcription
- Volume-analyzer / Isolation Demo zoom
- Changing zip format, import ID policy, or slim-vs-debug completeness
- Removing the archive feature

## Resolution Criteria

Mark this spec resolved when:

- [x] Developer mode off: Home, Settings, and Session Detail show no Import / Export session zip
- [x] Developer mode on: Settings shows Import session zip; Session Detail Debug shows Export session zip
- [x] Home LIBRARY no longer fronts import (Settings-only, or Home still gated)
- [x] Actions no-op / stay hidden when developer mode is off
- [x] iPhone DevTools screenshots + `make build` + Resolution section

## Resolution

**Resolved:** 2026-09-08T15:15:00Z on branch `cursor/dev-mode-session-zip-fdc7` (draft PR).

### What shipped

Session zip import / export stay in the PWA. They are gated on `developerModeEnabled` (`sessionArchiveToolsVisible`).

- **Home:** LIBRARY import card removed. Sessions still list as before. No import control even when developer mode is on.
- **Settings → App:** **Import session zip** lives under the developer-mode block (with Isolation Demos). Hidden when the checkbox is off. Copy: “Debugging only…” / “Developer debugging only…”
- **Session Detail Debug:** **Export session zip** + include-debug checkbox show only when developer mode is on. `downloadSessionArchive` no-ops if the flag is off.
- Per-snip / per-chunk ↓ downloads are unchanged (not session-zip).

### Proof (iPhone 12 Pro, 390×844 CSS px)

- `documentation/qa/pwa-session-zip-dev-off-home.png` — Home, no import / LIBRARY
- `documentation/qa/pwa-session-zip-dev-off-settings.png` — Settings, developer mode off
- `documentation/qa/pwa-session-zip-dev-off-debug.png` — Debug tab, no export zip
- `documentation/qa/pwa-session-zip-dev-on-settings.png` — Settings import visible
- `documentation/qa/pwa-session-zip-dev-on-debug.png` — Export session zip visible
- `documentation/qa/pwa-session-zip-dev-on-home.png` — Home still has no import (ladybug only)
- Notes: `documentation/qa/pwa-session-zip-developer-mode.md`

### Automated proof

`npm test --prefix apps/web-whisper-pwa`

### Publish

`make build` refreshed `docs/` PWA artifacts only.
