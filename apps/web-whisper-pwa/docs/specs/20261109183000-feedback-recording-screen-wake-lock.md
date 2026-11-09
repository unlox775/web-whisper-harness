Spec Status: resolved
Spec Type: feedback
Created: 2026-11-09T18:30:00Z
Resolved: 2026-11-09T18:45:00Z
Product: apps/web-whisper-pwa

# Feedback: Reliable screen wake lock while recording (iPhone PWA)

## User Feedback

Dave (iPhone, PWA): during a recording he looked down and the phone screen had gone dark/slept. A PWA cannot record in the background on iOS, so the screen MUST stay awake for the entire time a recording is active.

Phase 07 already shipped `src/wakeLock.ts` (Screen Wake Lock API + `visibilitychange` reacquire, `console.debug`). That is not enough on iOS Safari / standalone PWA: `navigator.wakeLock` is missing or is auto-released when the page is hidden, and the current acquire happens *after* `await startCapture()`, so any user-gesture-gated fallback misses the Record tap.

## Investigation (do not duplicate)

- Original `unlox775/web-whisper` `src/modules/capture/wake-lock.ts` is Screen Wake Lock only (no NoSleep video). It logs via `logInfo` / `logWarn`. Acquire is fired from the Record click (`recording-start-click`) *before* getUserMedia.
- Harness `apps/web-whisper-pwa/src/wakeLock.ts` is that port, but logging was downgraded to `console.debug` and acquire was moved after `startCapture`.
- Neither repo ever had a muted looping video fallback. Add it to the existing PWA module; do not create a second keeper or put this in capture-engine.

## Requested Outcome

One job: reliable screen wake lock while recording.

1. `navigator.wakeLock.request('screen')` when recording starts; `release()` on stop / abort / unmount / start-failed.
2. Re-acquire on `visibilitychange` → `visible` **and** `pageshow` while still recording (iOS releases the sentinel when hidden).
3. Fallback for iOS Safari / standalone PWA (API missing *or* unreliable even when present): a muted, `playsinline`, looping tiny **video-only** MP4 (NoSleep.js-style), started from the user's Record tap gesture, stopped on stop. No audio track — must not steal the iOS audio session from capture.
4. Must not interfere with audio capture or the durable capture/persist queue. Captured audio is never discarded because of wake-lock work.
5. Log acquire / release / failure through session-store `log('web-whisper-pwa', …)` (existing per-package durable logging). Lazy payloads. Never throw into capture.
6. Package boundary: PWA-owned. No capture-engine / session-store API change. Update PWA customer docs for the end-user guarantee.
7. Unit tests for acquire, release, visibility/pageshow reacquire, missing API, iOS video fallback from the same turn as the tap, stop, and logging.
8. Small recording-screen status line (proof only; do not change Stop button flow).
9. iPhone viewport screenshots of that status on the recording screen.

## Out of scope

- Stop button flow / navigation after Stop (separate agent)
- No-audio pulse / beep
- capture-engine, playback-engine, session-store schema
- Old-iOS `location.href` keep-awake hack (would interrupt capture)

## Resolution Criteria

Mark resolved when:

- [x] Wake lock acquired from the Record gesture, released on stop/fail
- [x] Reacquired on visibility visible and pageshow
- [x] iOS / missing-API path plays muted looping `playsinline` video; video has no audio track
- [x] Durable logs for acquire / release / failure
- [x] Unit tests pass
- [x] iPhone DevTools screenshot of the status line
- [x] `make build`
- [x] Spec Resolution section

## Resolution

**Resolved:** 2026-11-09T18:45:00Z on branch `cursor/recording-screen-wake-lock-03fc`.

### Investigation

Original `unlox775/web-whisper` `src/modules/capture/wake-lock.ts` is Screen Wake Lock only (durable `logInfo`/`logWarn`). Acquire is fired from the Record click (`recording-start-click`) before getUserMedia. The harness port (`src/wakeLock.ts`) kept the API but moved acquire until *after* `await startCapture()` (gesture lost) and logged with `console.debug`. Neither repo had a NoSleep-style video fallback.

### What shipped (PWA only)

1. **`src/wakeLock.ts`** — `navigator.wakeLock.request('screen')` from the Record tap; release on stop / abort / unmount / start-failed. Re-acquire on `visibilitychange` → visible **and** `pageshow`.
2. **iOS / missing-API fallback** — muted, `playsinline`, looping 16×16 **video-only** MP4 (no audio track) started in the same turn as the tap. iOS uses video *even when* the Wake Lock API exists, because iOS auto-releases it. Chrome/desktop with a working API does not play the clip unless the request fails.
3. **Durable logs** — `sessionStore.log('web-whisper-pwa', …)` for acquire / release / unavailable / request failed / video failed. Lazy payloads; never throws into capture.
4. **Does not touch capture/persist** — no MediaStream, no AudioContext, no `stop()` / drop. Video is muted, volume 0, no audio track.
5. **Status line** on the recording HUD: `Screen awake · wake lock`, `… · video`, `… · wake lock + video`, or `Screen may sleep`. Stop button untouched.
6. Customer docs: `apps/web-whisper-pwa/README.md`, `customers/README.md`. No capture-engine / session-store API change.

### Tests

`npm test` in `apps/web-whisper-pwa`: 134 pass (11 wake-lock cases).

### Proof shots (iPhone 12 Pro, 390×844 CSS → 1170×2532)

- `documentation/qa/recording-wake-lock-iphone.png`
- `documentation/qa/recording-wake-lock-iphone-live.png` (live `?simulate=1`, iPhone UA: **Screen awake · wake lock + video**)
- `documentation/qa/recording-wake-lock-iphone-status.png`
- Notes: `documentation/qa/recording-wake-lock.md`

