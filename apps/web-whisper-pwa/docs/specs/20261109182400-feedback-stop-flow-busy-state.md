Spec Status: unresolved
Spec Type: feedback
Created: 2026-11-09T18:24:00Z
Product: apps/web-whisper-pwa

# Feedback: Stop flow — instant busy state, wait for persist + last transcription, 5s UI cap

## User Feedback (Dave, iPhone PWA)

When he taps Stop, nothing visibly happens for a moment (the app is flushing / waiting for events), so it looks like the tap was ignored. Then it jumps straight back to the list page, which briefly shows “all transcribed except one”, and a second or two later flips to fully recorded/transcribed.

## Requested Outcome

One job only — the Stop flow. Do not touch wake-lock / screen-sleep code.

1. **Instant busy state (same frame as the tap).** Switch the recording button/screen to a clear busy state, e.g. **Finishing recording…** / **Saving recording…**. Disable the control so it cannot be double-tapped.
2. **Stay on the recording screen** in that state until the final chunk is persisted **and** its transcription finishes, within reason. Cap the wait at about **5 seconds** (named constant). Then go to the list.
3. **If the wait times out**, go to the list anyway. Existing partial / coverage status handles the rest.
4. **Never drop or abandon audio.** The wait is UI only. The flush / persist queue keeps retrying regardless. Use the existing `flushPending` path. Absolute durability rules apply (`docs/DURABILITY-CONTRACT.md`).

## Package boundaries

- **This spec is PWA-only** (`apps/web-whisper-pwa`).
- Capture-engine interface is unchanged. After Stop the PWA already calls `handle.stop()` then `flushPending()`. That work must continue even if the UI timeout fires.
- Transcription-client interface is unchanged. Last-snip transcription already runs through `ingestGrowingSession` / `transcribeSession`. Do not cancel those promises on timeout.
- Wake-lock / `src/wakeLock.ts` is owned by a separate agent. Do not edit it.

## Customer contracts

If Stop-flow wiring of `flushPending` / last-snip transcription changes how the PWA uses those packages, update both sides:

- `packages/lib/capture-engine/customers/web-whisper-pwa.md`
- `packages/lib/transcription-client/customers/web-whisper-pwa.md`
- `apps/web-whisper-pwa/customers/README.md` and the PWA README orchestration section

No new producer APIs.

## Design

### Instant UI

On Stop tap, before any `await`:

- Recording HUD label → `Finishing recording…`
- Stop button label → `Saving recording…`
- Button `disabled` (and ignore further taps)
- Remain on the recording screen (`screen === 'recording'`)

Named copy lives next to the timeout constant so tests and UI cannot drift.

### UI wait (not durability)

`STOP_FINISH_WAIT_MS = 5000`.

The PWA races:

1. Final-chunk persist (`handle.stop()` already waits persist-idle; then existing `flushPending()`)
2. Trailing snip commit + its transcription (`ingestGrowingSession({ includeTrailing: true })` then existing `transcribeSession`)

against the cap, starting at the Stop tap.

- If both finish first → navigate Home with the session typically READY.
- If the cap fires first → navigate Home anyway. Persist and transcription **keep running**. List coverage / PART TX is the fallback.

Retention (`enforceCap` / `flushPending` then `enforceRetentionPolicy`) must not be cancelled. It is not part of the UI wait.

`navigate === 'none'` (pagehide / freeze) stays a durability path: stop + flush, no 5s UI wait, no transcription requirement.

### Durability (non-negotiable)

FORBIDDEN: cancelling `flushPending`, dropping the persist queue, “retry once then move on”, or navigating in a way that aborts encoded-chunk writes.

The timeout only stops **waiting to leave the recording screen**.

## Tests

Unit tests (no mic, fake timers / short timeout override):

- Stop tap → phase `finishing`, disabled button, busy copy, second tap ignored
- Persist + last transcription before the cap → `settled`
- Either side still pending when the cap fires → `timed_out`
- Timed-out work **still completes** after the UI has moved on (do not cancel the promise)

## Proof

Keep the PR **draft** until iPhone viewport (Chrome DevTools iPhone device mode) screenshots are in the PR body:

1. Instant **Finishing recording…** state
2. Home list after Stop with the session **fully transcribed** (READY)

QA helpers: `?screenshot=record-finishing`, existing `?screenshot=home-after-stop`.

## Out of scope

- Wake lock / screen sleep
- capture-engine persist-queue internals
- transcription-client retry policy
- Session detail, snip algorithm, retention policy changes
- Home tile live PART TX → READY animation (already exists)

## Resolution Criteria

Mark this spec resolved when:

- [ ] Stop tap paints busy copy and disables the button before any flush/await
- [ ] Recording screen stays up until persist + last transcription, or `STOP_FINISH_WAIT_MS`
- [ ] Timeout navigates Home without cancelling `flushPending` / transcription
- [ ] Unit tests cover state transitions and timeout (including “work continues after timeout”)
- [ ] Customer docs updated on both sides of any usage-contract change
- [ ] iPhone DevTools screenshots in `documentation/qa/` and the PR body
- [ ] PR kept draft until those shots are in the body
- [ ] `make build` published `docs/` PWA artifacts
- [ ] `src/wakeLock.ts` untouched
- [ ] Spec updated with a Resolution section
