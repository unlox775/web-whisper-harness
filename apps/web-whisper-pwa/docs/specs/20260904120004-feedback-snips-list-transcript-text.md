Spec Status: unresolved
Spec Type: feedback
Created: 2026-09-04T12:00:04Z
Product: apps/web-whisper-pwa

# Feedback: Snips list shows transcript text per snip

## User Feedback

Debug / session-detail snips tab shows duration + a **Transcribed** chip but **not the transcript text**. Dave wants a compact transcript preview on each snip so he can see what was said without leaving the list.

Current row (`SessionDetailScreen.tsx` debug snips list): `#N`, duration, time range, Transcribed chip or RETRY, download. Failed snips already show `failure.error`. Successful rows have `transcripts.find(t => t.snipId === snip.id)` in memory and never render `transcript.text`.

## Requested Outcome

For each snip that has a transcript, show a **compact text preview** under the existing row meta:

- Use the existing `transcripts` state (`TranscriptRecord.text`) — no new session-store fields, no extra producer APIs
- Truncate reasonably (e.g. ~160–240 characters with an ellipsis, or ~3–4 wrapped lines via CSS)
- Wrap so long words do not blow out the iPhone width (~390px)
- Keep the Transcribed chip
- Failed snips: keep showing the error; do not invent fake transcript text
- Pending / in-flight snips (no transcript, no failure): show nothing **or** a quiet placeholder such as “Pending…” — pick one and use it consistently
- Do not break package boundaries (PWA reads what it already loaded)

### Layout

Stay on the existing debug snips list (copy-first transcript panel remains the main copy surface). This is a per-snip preview, not a second full transcript wall.

Muted / smaller type under the `#N duration range` line is enough.

### iPhone-first proof

Screenshot the snips list with at least one row showing preview text (iPhone DevTools ~390px or device). Required before marking resolved.

## Notes For Phase 07

- Keep changes scoped to `apps/web-whisper-pwa`.
- Do not reach into capture-engine, playback-engine, or session-store.
- Update this spec with a Resolution or Blocked section when Phase 07 implementation runs.
- Do **not** mark this spec resolved from the specs-only PR.

## Out of scope

- Histogram playhead
- Wake lock / no-audio pulse / beep
- Playback volume
- Changing snip detection
- New transcript APIs

## Resolution Criteria

Mark this spec resolved when:

- [ ] Each snip with transcript text shows a compact, wrapping preview
- [ ] Failed snips still show error; pending show nothing or a placeholder
- [ ] Existing `transcripts` state is the only data source
- [ ] iPhone screenshot proof of a snip row with text
- [ ] `make build` published `docs/` PWA artifacts
- [ ] Spec updated with a Resolution section documenting what shipped
