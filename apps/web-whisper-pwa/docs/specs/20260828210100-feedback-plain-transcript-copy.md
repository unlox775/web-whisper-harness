Spec Status: resolved
Spec Type: feedback
Created: 2026-08-28T21:01:00Z
Updated: 2026-08-28T23:15:00Z
Resolved: 2026-08-28T23:15:00Z
Product: apps/web-whisper-pwa

# Feedback: Plain concatenated transcript copy

## User Feedback (Dave, 2026-08-28)

When viewing a session and copying, the product is **one big simple wall of text**. Concatenate snip transcriptions with a single space between them. No newlines between snips. No `[0:00]` / bracket time headers. No snip markers. Selected text and the Copy button must output plain prose only.

## Requirements

1. Default **Transcript** tab textarea + Copy path is plain concatenated snip text (single spaces, no time stamps, no snip walls).
2. Debug views may still show per-snip detail (times, RETRY, errors).
3. Do not change the live recording pipeline, Stop navigation, storage purge, or isolation demos.

## Implementation Notes

- `buildTranscriptText` (Transcript tab / Copy) joins non-empty snip texts with `' '`.
- Missing / failed snips are omitted from the copy string (no `[Snip N failed…]` markers).
- Internal whitespace in a snip is flattened so the result is one prose wall.
- QA helper: `?screenshot=session-detail` seeds a fixture session and opens the Transcript tab.

## Out of Scope

- Live recording overlay / Stop slot
- Storage retention / purge
- Isolation demos
- Snip algorithm

## QA Shots Required (1170×2532, `documentation/qa/`)

- [x] `session-detail-plain-copy.png` — session detail Transcript tab with selected plain transcript and no time brackets

## Resolution Criteria

Mark resolved when:

- [x] Textarea + Copy emit plain concatenated prose
- [x] No `[m:ss]` headers or snip markers on the default copy path
- [x] Debug tab still lists per-snip rows
- [x] `make build` completed
- [x] iPhone 1170×2532 shot in `documentation/qa/` and linked in the draft PR
- [x] Spec updated with Resolution

## Resolution

**Resolved:** 2026-08-28T23:15:00Z on branch `cursor/plain-transcript-copy-5a85` (draft PR).

### What shipped

- `apps/web-whisper-pwa/src/transcriptText.ts` — `buildTranscriptText` returns space-joined plain prose.
- `SessionDetailScreen` Transcript textarea + Copy use that string; Debug stays per-snip.
- Unit tests in `transcriptText.test.ts`.
- QA helper `?screenshot=session-detail`.
- `make build` refreshed `docs/` GitHub Pages publish artifacts.

### Proof shot (1170×2532)

- `documentation/qa/session-detail-plain-copy.png`
- Notes: `documentation/qa/session-detail-plain-copy.md`
