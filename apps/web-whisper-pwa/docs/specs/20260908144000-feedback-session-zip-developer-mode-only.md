Spec Status: unresolved
Spec Type: feedback
Created: 2026-09-08T14:40:00Z
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

- [ ] Developer mode off: Home, Settings, and Session Detail show no Import / Export session zip
- [ ] Developer mode on: Settings shows Import session zip; Session Detail Debug shows Export session zip
- [ ] Home LIBRARY no longer fronts import (Settings-only, or Home still gated)
- [ ] Actions no-op / stay hidden when developer mode is off
- [ ] iPhone DevTools screenshots + `make build` + Resolution section
