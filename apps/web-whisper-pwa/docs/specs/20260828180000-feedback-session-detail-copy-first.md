Spec Status: unresolved
Spec Type: feedback
Created: 2026-08-28T18:00:00Z
Product: apps/web-whisper-pwa

# Session Detail Copy-First Feedback Spec

## User Feedback (Dave, 2026-08-28)

Session detail is the most important screen and must serve the real workflow: **copy the transcript**. OK to innovate (does not need to mirror older screenshots).

### Requirements

1. **Copy is the product.** Transcription lives in a small scrolling text area that is **selectable**. On open, text should already be selected (or `user-select: all` so the first tap selects everything) so the iOS/PWA native copy popup appears. Clipboard API is unreliable in PWAs — native selection + Copy is required. Also add a **Copy** button for browsers that allow `navigator.clipboard.writeText`. Both paths.

2. **Play bar and volume control** must be visible on the card even when idle (not only after Play Session / only while playing).

3. The giant duration / captured range / size / format block is not the point. Make the screen functional: transcript first, playback controls present, less dead metadata. Date/seconds can stay quiet, not the hero.

4. Snips list, histogram, doctor, chunks — hide behind developer/debug (tab that swaps transcript vs debug extras, or a hamburger). Default view is copy-the-transcript.

## Implementation Notes

- Use a real `<textarea readOnly>` (or equivalent iOS treats as selectable text), not a div.
- On transcript load: `textarea.select()` / `setSelectionRange(0, length)`.
- CSS: `user-select: all; -webkit-user-select: all`; min-height for a “little scrolling text area”; overflow auto.
- Copy button uses clipboard API when allowed; do not remove native selection.
- Always show round play + seek bar + volume slider when session has audio.
- Keep Close/trash, RETRY TX, Transcribed N of N.
- Move snips/chunks/histogram/doctor off the default fold into Debug.
- iPhone-first (~390 CSS px / 1170×2532 shots).

## Out of Scope

- Recording-screen overlay work
- Snip-algorithm changes
- Isolation-demo deploy
- Durability work
- `node_modules` / scriptures repo

## QA Shots Required (1170×2532, `documentation/qa/`)

- [ ] `session-detail-copy.png` — transcript textarea with text selected, Copy button, play bar + volume visible at rest
- [ ] `session-detail-debug.png` — debug tab/hamburger showing snips (optional if debug exists)

## Resolution Criteria

Mark resolved when:

- [ ] Transcript is a selectable `<textarea>` with auto-select on open
- [ ] Copy button present; native selection path preserved
- [ ] Play + seek + volume always visible when session has audio (idle)
- [ ] Metadata quiet; transcript is the primary fold
- [ ] Snips/chunks/histogram/doctor behind Debug (not default)
- [ ] Close/trash, RETRY TX, Transcribed N of N retained
- [ ] `make build` completed; `docs/` GitHub Pages updated
- [ ] iPhone DevTools shots in `documentation/qa/` and linked in PR body
- [ ] Spec updated with Resolution section documenting what shipped
