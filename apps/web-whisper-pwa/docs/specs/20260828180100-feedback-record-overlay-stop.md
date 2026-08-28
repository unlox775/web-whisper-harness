Spec Status: unresolved
Spec Type: feedback
Created: 2026-08-28T18:01:00Z
Product: apps/web-whisper-pwa

# Feedback: Record overlay must never cover Stop Recording

## User Feedback

Dave likes the new full-screen live recording screen. Two problems:

1. **Biggest usability bug in the app:** the live transcription overlay at the bottom grows until it covers the Stop Recording button. He cannot stop. The overlay must never cover Stop. Stop must stay fully tappable for a long recording with lots of live text.

2. **Stylistic:** do not show total sample count — meaningless. Duration in **seconds** (already the big timer) is the user-facing number. Do not show snip count in the default HUD. In **developer mode only**, you may show snip count gathered. Remove buffer-samples from the default recording HUD (currently shown in developerMode as “Buffer: N samples”). If a debug line is kept, prefer snips gathered, not samples.

## Requested Outcome

- Reserve a fixed bottom slot for Stop Recording (safe-area). Live overlay sits ABOVE that slot with a max-height and internal scroll. Overlay must not expand over the button. z-index: Stop on top if they overlap at all.
- Long transcript: overlay scrolls, Stop stays visible. Tall fake transcript via `?screenshot=record` (and `?screenshot=record-hud` for a HUD-focused preview).
- Default HUD: Recording + elapsed time only (and overlay). Developer mode: optional snip count, not samples.
- Do not change session-detail. Do not change snip algorithm. Do not mix parchment/theme.

## Notes For Phase 07

- Keep changes scoped to `apps/web-whisper-pwa` recording screen layout and HUD copy.
- QA proof: 1170x2532 iPhone shots in `documentation/qa/`:
  - `record-overlay-stop.png` — live overlay with enough transcript that it would have covered Stop before; Stop Recording fully visible and not overlapped
  - `record-hud-seconds.png` — HUD shows elapsed time, no sample count
- Update this spec with a Resolution section when complete.
