Spec Status: unresolved
Spec Type: feedback
Created: 2026-09-04T12:00:02Z
Product: apps/web-whisper-pwa

# Feedback: Recording durability UX — wake lock + no-audio pulse/beep

## User Feedback

Original `unlox775/web-whisper` has:

- `src/modules/capture/wake-lock.ts` — Screen Wake Lock API + reacquire on `visibilitychange` → `visible`
- No-audio alert: flash the recording UI and play a short beep pattern from `App.tsx`

Harness PWA currently has **no wake lock**. Dave’s iPhone screen slept mid-dictation and killed capture.

Also, on `captureError` reason `no_audio_received` today the PWA calls `finishCapture('home')` (`src/context.tsx`). Dave wants mid-stream (and start-of-recording “clock ticking, no PCM yet”) to **keep recording**, pulse the UI, and beep — not bounce him to Home.

Dave: “You don't actually have to stop the recording.”

## Depends on

Phase 07 spec 1 — `packages/lib/capture-engine/docs/specs/20260904120001-feedback-ongoing-audio-stream-stall-detection.md` (`audioStalled` / `audioResumed`). Implement spec 1 first (or confirm those events exist on main) before wiring this PWA spec.

## Requested Outcome

### 1. Screen wake lock while recording

Port the original pattern into the PWA (this package only):

- Acquire a screen wake lock when recording starts (`startRecording` / recording screen active)
- Release on stop and abort (`finishCapture`, unmount, or leaving the recording screen)
- On `document.visibilitychange` when `document.visibilityState === 'visible'`, re-request the lock if still recording
- Guard `navigator.wakeLock` missing (desktop / older Safari): no throw, optional quiet log
- Do not put wake-lock logic in capture-engine

### 2. Consume capture stall / resume events

Subscribe on the live `CaptureHandle`:

- `audioStalled` → enter no-audio alert state
- `audioResumed` → clear no-audio alert state

Also treat **start-of-recording with no audio yet** (clock ticking, `chunksEncoded === 0`, no PCM) as the same alert state. Do not wait only for mid-stream events.

### 3. Visual pulse / banner

While in no-audio alert state on the recording screen:

- Slow visual pulse (recording chrome or a dedicated banner)
- Copy such as **“No audio”**
- Clear the pulse / banner when `audioResumed` fires or when PCM / chunks start arriving

Keep the existing full-screen recording takeover + live overlay. This is an overlay/status on that screen, not a navigation change.

### 4. Beep pattern

If stalled (or start-of-recording with no audio) for ≥ ~5s, play a short **loud** 3-beep pattern. Repeat about every ~5s while still stalled.

Include the case: recording started, clock ticking, **no audio yet**.

Implementation notes (PWA-owned):

- Use Web Audio / `OscillatorNode` (or a tiny bundled beep) so it is audible on iPhone
- Respect that iOS may require the graph to start from a user gesture — `Start recording` is that gesture; create/resume `AudioContext` then
- Do not depend on playback-engine `setVolume` for this alert

### 5. Do not stop solely because of no-audio alert

- Mid-stream stall / no-audio pulse / beep must **not** call `finishCapture` or `stop()`
- If start watchdog still emits `no_audio_received`, **change the PWA** to alert (pulse + beep) instead of auto-stopping
- User can still stop manually; prefer alerts over auto-stop
- Document the choice in the Resolution section (Dave: keep recording)

If a much-longer “never any audio” timeout is kept at all, it must be far longer than 10s and called out in Resolution. Default preference: **no auto-stop** for `no_audio_received`.

`encoding_failed` may still stop (real hard failure). `store_write_failed` stays a toast, not this pulse.

### 6. iPhone-first proof

Screenshot the pulse / “No audio” state on iPhone (Safari DevTools device mode ~390px, or a real device). Required before marking resolved.

## Notes For Phase 07

- Keep changes scoped to `apps/web-whisper-pwa`.
- Consume capture-engine events only; do not reimplement stall detection inside the PWA (except the start-of-recording “no chunks yet” clock, which the PWA already can poll via `getStatus()`).
- session-store is unchanged.
- Update this spec with a Resolution or Blocked section when Phase 07 implementation runs.
- Do **not** mark this spec resolved from the specs-only PR.

## Out of scope

- capture-engine internals beyond consuming `audioStalled` / `audioResumed` / existing `captureError`
- Playback volume slider
- Snips list transcript text
- Histogram playhead
- session-store schema

## Resolution Criteria

Mark this spec resolved when:

- [ ] Screen wake lock acquired while recording, released on stop/abort, reacquired on visibility visible
- [ ] Recording screen pulses / shows “No audio” on stall or start-with-no-audio
- [ ] Alert clears on `audioResumed` / audio arriving
- [ ] 3-beep pattern plays at ~5s and repeats ~every 5s while stalled
- [ ] Mid-stream stall does **not** navigate Home or stop capture
- [ ] `no_audio_received` no longer auto-stops (alert instead); choice documented
- [ ] iPhone DevTools (or device) screenshot of the pulse state
- [ ] `make build` published `docs/` PWA artifacts
- [ ] Spec updated with a Resolution section documenting what shipped
