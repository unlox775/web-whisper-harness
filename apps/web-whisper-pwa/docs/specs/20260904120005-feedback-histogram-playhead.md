Spec Status: resolved
Spec Type: feedback
Created: 2026-09-04T12:00:05Z
Product: apps/web-whisper-pwa

# Feedback: Histogram playhead follows main session playback

## User Feedback

Nice-to-have. Debug **Volume Histogram** on session detail draws volume + snip boundary lines but has **no playhead**. While main session playback runs, Dave wants a moving ticker so he can see “where we are” on the waveform.

`SessionDetailScreen` already tracks `currentTime` / `duration` from `PlaybackHandle` `timeupdate` and already mounts `VolumeHistogram` with `{ profile, snips }` only (`src/components/VolumeHistogram.tsx`).

## Requested Outcome

- Pass playback `currentTime` (and `duration` if needed) into `VolumeHistogram`
- Draw a **clear playhead line** (distinct from amber snip-boundary dashes — e.g. solid white / teal, full plot height)
- Update the playhead on `timeupdate` while the histogram is visible
- Show the playhead when histogram is visible **and** there is a position (playing **or** paused with a known `currentTime`)
- Hide the playhead when there is no session playback handle / no position yet (idle before first play)
- Map time → x using the same time domain as the existing plot (today the canvas uses `samples.length * 0.1` as a stand-in duration). Prefer `session.duration` / playback `duration` when available so the playhead lines up with snip start times. If you change the x-scale, keep snip markers aligned with the same scale. Do not change snip detection.

Only the session-detail **main** session playback path is required (the same handle as the hero play/pause). Per-chunk / per-snip preview playback does not need a playhead unless it is trivial to reuse the same `currentTime`.

### iPhone-first proof

iPhone screenshot of histogram + playhead is **optional but preferred** (DevTools ~390px or device).

## Notes For Phase 07

- Keep changes scoped to `apps/web-whisper-pwa` (`VolumeHistogram` + `SessionDetailScreen`).
- Do not change volume-analyzer or snip algorithms.
- Isolation demos are out of scope unless a one-line comment is truly trivial.
- Update this spec with a Resolution or Blocked section when Phase 07 implementation runs.
- Do **not** mark this spec resolved from the specs-only PR.

## Out of scope

- Changing snip detection / volume-analyzer
- Wake lock / durability pulse
- Snips list transcript text
- Playback-engine API changes (`timeupdate` already exists)
- Isolation demo work unless trivial

## Resolution Criteria

Mark this spec resolved when:

- [x] `VolumeHistogram` receives `currentTime` (and duration if needed)
- [x] A clear playhead updates on `timeupdate` while the histogram is visible
- [x] Playhead shows for playing and paused-with-position; hidden when idle
- [x] Snip-boundary lines still make sense on the same x-scale
- [ ] iPhone screenshot optional but preferred
- [x] `make build` published `docs/` PWA artifacts
- [x] Spec updated with a Resolution section documenting what shipped

## Resolution

**Resolved:** 2026-09-04 on branch `cursor/histogram-playhead-dd72` (draft PR).

### What shipped

- `apps/web-whisper-pwa/src/histogramScale.ts` — shared plot duration (`session`/`playback` duration, else `samples × 0.1s`) and `timeToFraction` so snip starts and `currentTime` share one x-domain.
- `VolumeHistogram` accepts `currentTime` / `duration`. Solid white playhead (full plot height + top marker) is distinct from amber dashed snip boundaries. Hidden when `currentTime` is null (idle, no handle).
- `SessionDetailScreen` sets `hasPlayback` on `bindHandle` and passes `currentTime={hasPlayback ? currentTime : null}` plus `playbackDuration`. `timeupdate` already updates `currentTime`, so the canvas redraws while the histogram is visible (playing or paused-with-position).
- Unit tests in `histogramScale.test.ts`. Waveform still spans the canvas; time-mapped markers use the duration domain. Snip detection / volume-analyzer / wake lock / snips text / `setVolume` unchanged.

### Proof

- iPhone DevTools screenshot optional; added after browser verification when available.
- `make build` refreshed `docs/` GitHub Pages PWA artifacts.
