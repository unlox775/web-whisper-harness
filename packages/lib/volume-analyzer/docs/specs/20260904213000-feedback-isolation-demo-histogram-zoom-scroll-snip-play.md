Spec Status: unresolved
Spec Type: feedback
Created: 2026-09-04T21:30:00Z
Product: packages/lib/volume-analyzer

# Feedback: Isolation Demo — histogram zoom / scroll + snip play

## User Feedback

Dave imported a long real session archive into the volume-analyzer Isolation Demo. The histogram is so dense it is unusable for diagnosing suspected **double-grabbed snips** (overlapping / wrong audio regions).

He needs to:

1. **Zoom** the histogram to a usable number of seconds across the width
2. **Pan / scroll** along the timeline when zoomed in
3. Keep the existing **noise-floor / min snip / max snip / quiet-gap sliders live** while scrolled (recompute snips without jumping the viewport back to t=0)
4. **Play individual snips** from the already-loaded in-memory chunk blobs (archive / live / fixture) and see a **playhead** so he can hear whether a cut grabbed the wrong region

This is a diagnosis surface. Do **not** change the snip proposal algorithm to “fix” double-grabs.

## Requested Outcome

Isolation Demo UX only: `packages/lib/volume-analyzer/isolation-demo/` (`VolumeHistogram`, `SnipList`, `App`, styles, plus small demo-local helpers/tests).

### A. Horizontal zoom + scroll

- Control: slider for **seconds visible across the histogram width** (e.g. “Window: N seconds”).
- Default: **fit all** for short sessions; a **reasonable window** (about 30s) when the computed profile is long, so a dense archive is immediately inspectable.
- When zoomed in (window < full duration), provide a **horizontal scrollbar / pan** so Dave can scrub along the timeline.
- Snip boundary markers and the noise-floor line must stay correct in the zoomed/scrolled viewport (same session time domain as `proposeSnipsFromProfile`: flattened 100ms samples from t=0).

### B. Sliders stay live while scrolled

- Noise floor / min snip / max snip / quiet-gap must still recompute snips when adjusted **while** the user is scrolled to a non-zero pan position.
- Do **not** reset scroll on every recompute unless the zoom window itself changes in a way that requires a clamp (e.g. `viewStart + window > duration`).
- Prefer preserving scroll offset.

### C. Snip playback + playhead

- From the snips list (and histogram snip markers): **Play** a snip using the in-memory chunk blobs already loaded.
- Assemble the snip’s audio range (decode overlapping chunks, slice to `[snip.startTime, snip.endTime]`, play). Prefer `HTMLAudioElement` (or existing demo patterns). Do **not** add playback-engine as a new demo dependency.
- Show a **playhead** on the histogram that tracks playback `currentTime` on the **session timeline**:

  `playheadTime = snip.startTime + audio.currentTime`

  Session-relative is required so Dave can see which region of the dense histogram is sounding.
- **Pause** freezes the playhead at the current session time.
- **Stop** / `ended` clears the playhead (idle, hidden).

### Isolation Demo only

Do not change `src/snips.ts` / `proposeSnipsFromProfile` / defaults. Do not edit the PWA session-detail histogram. Do not edit session-store / playback-engine packages.

## Notes For Phase 07

- Cursor Cloud Agent only — never Codex.
- Publish via `make build` / `deploy-isolation-demos` so `docs/isolation-demos/volume-analyzer/` updates on Pages.
- Screenshot proof: zoomed + scrolled dense view with snip markers visible.
- Update this spec with a Resolution section when implementation ships.
- Do **not** mark this spec resolved from a specs-only commit.

## Out of scope

- Changing `proposeSnipsFromProfile` algorithm or defaults to “fix” double-grabs
- PWA session-detail histogram / playhead
- session-store or playback-engine package edits
- Reimplementing archive parse (already shipped)

## Resolution Criteria

Mark this spec resolved when:

- [ ] Histogram has a window (seconds-visible) control and pans when zoomed
- [ ] Snip markers + noise floor stay aligned in the zoomed/scrolled viewport
- [ ] Aggressiveness sliders recompute snips without resetting scroll
- [ ] A snip can be played from in-memory blobs with a session-relative playhead
- [ ] Pause freezes the playhead; stop/ended clears it
- [ ] `proposeSnipsFromProfile` / core library snipping logic unchanged
- [ ] `make build` published Isolation Demo artifacts
- [ ] Spec updated with a Resolution section documenting what shipped
