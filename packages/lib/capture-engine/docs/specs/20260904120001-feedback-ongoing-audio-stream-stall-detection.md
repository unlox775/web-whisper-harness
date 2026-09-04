Spec Status: unresolved
Spec Type: feedback
Created: 2026-09-04T12:00:01Z
Product: packages/lib/capture-engine

# Feedback: Ongoing audio stream stall detection (mid-recording)

## User Feedback

Dave: the start-of-recording watchdog is not enough.

Today `watchdogTimeout` (default 10s) only covers **start ghost**:

- `startWatchdog()` runs when capture starts
- First PCM callback cancels the watchdog (`handleAudioProcess`)
- If the timer fires with `chunkCount === 0`, emit `captureError` reason `no_audio_received` and **auto-stop**

That does **not** detect a mid-recording stall: UI still thinks capture is live (timer climbing, recording screen up) but PCM / chunks stop arriving. iPhone screen-sleep, mic ghost after a good start, and AudioContext suspension all look like this.

Dave needs an event while the session stays open so the PWA can pulse / beep without killing the take.

## Requested Outcome

After audio has **started** (`chunkCount > 0` **OR** at least one PCM callback has been seen), if no new PCM / no capture progress arrives for ~5 seconds (configurable, default **5**), emit a new event such as `audioStalled` with useful details.

When PCM / progress resumes, emit `audioResumed`.

**Do not auto-stop** the capture session on a mid-stream stall. That would be a breaking change versus today’s start-only auto-stop. Keep the start-of-recording zero-chunk watchdog as-is (still emit `no_audio_received` and still auto-stop when **no audio ever arrived**).

### Event contract (keep start vs mid distinguishable)

| When | Event | Auto-stop? |
| --- | --- | --- |
| Start watchdog: zero chunks / never started, `watchdogTimeout` (default 10s) | existing `captureError` `{ reason: 'no_audio_received' }` | **Yes** (unchanged) |
| Mid-stream: audio had started, then silence / no PCM for `stallTimeout` (default 5s) | new `audioStalled` | **No** |
| Mid-stream: PCM / progress returns after a stall | new `audioResumed` | No |

Suggested payloads (names may vary slightly; keep them typed and documented):

```typescript
// audioStalled
{
  sessionId: string;
  stalledFor: number;       // seconds since last PCM / last progress
  lastProgressAt: number;   // epoch ms or capture-relative seconds — document which
  chunksEncoded: number;
  pcmSeen: boolean;
  reason: 'mid_stream_stall';
}

// audioResumed
{
  sessionId: string;
  stalledFor: number;       // how long it was stalled
  chunksEncoded: number;
}
```

Do **not** reuse `no_audio_received` for mid-stream stall. PWA must be able to treat start failure vs mid-stream stall differently.

### Configuration

Add an option on `CaptureOptions`, e.g. `stallTimeout` (seconds, default `5.0`). Keep `watchdogTimeout` as the **start-only** ghost timer (default `10.0`).

Progress to watch: new PCM callbacks (preferred) and/or advancing `totalSamples` / encoded chunk seq. First stall emission only after audio has started. If PCM never starts, the existing start watchdog still owns that case.

While still stalled, either:

- emit `audioStalled` once and expose stall state on `getStatus()`, **or**
- emit once at the threshold and keep status pollable (`stalled: true`, `stalledFor`)

Do not spam a new event every animation frame. A single `audioStalled` plus status is enough; a periodic re-emit every `stallTimeout` is acceptable if documented.

### Isolation Demo

Show stalled / resumed status on the capture-engine Isolation Demo (this package only):

- Meter or banner: `Stream: live` vs `Stream: stalled`
- Event feed entries for `audioStalled` and `audioResumed` (distinct from red `no_audio_received`)
- Optional: a “Simulate stall” control or documented way to pause PCM so the demo can prove the events without waiting on a real mic ghost

### Tests

Add `node:test` coverage (same style as other harness packages) for:

1. After PCM / a chunk has been seen, a gap ≥ `stallTimeout` emits `audioStalled` and does **not** call `stop()`
2. When PCM resumes, emit `audioResumed` once (not on every subsequent callback)
3. Start watchdog still emits `no_audio_received` and auto-stops when **zero** chunks / never started
4. Mid-stream stall does **not** emit `no_audio_received`

## Notes For Phase 07

- Keep changes scoped to `packages/lib/capture-engine` unless this spec explicitly asks for integration edits.
- PWA flash / beep / wake-lock UX is **out of scope** (Phase 07 spec 2 / `20260904120002`).
- session-store is unchanged.
- playback-engine is unchanged.
- Update this spec with a Resolution or Blocked section when Phase 07 implementation runs.
- Do **not** mark this spec resolved from the specs-only PR.

## Out of scope

- PWA recording-screen pulse, banner, or beep
- Screen Wake Lock
- Changing start-watchdog auto-stop behavior (keep it; just document the reason codes)
- session-store writes or new durable fields

## Resolution Criteria

Mark this spec resolved when:

- [ ] `audioStalled` / `audioResumed` emit per the contract after audio has started
- [ ] Mid-stream stall does **not** auto-stop capture
- [ ] Start watchdog `no_audio_received` + auto-stop still documented and tested
- [ ] `stallTimeout` configurable, default 5s
- [ ] Isolation Demo shows stalled / resumed status
- [ ] Tests cover stall, resume, and start-watchdog isolation
- [ ] Spec updated with a Resolution section documenting what shipped
