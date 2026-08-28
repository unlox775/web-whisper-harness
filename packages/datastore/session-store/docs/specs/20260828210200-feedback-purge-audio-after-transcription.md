Spec Status: resolved
Spec Type: feedback
Created: 2026-08-28T21:02:00Z
Resolved: 2026-08-28T23:20:00Z
Product: packages/datastore/session-store

# Feedback: Purge audio after transcription under storage cap

## User Feedback (Dave)

With a small storage cap (e.g. 5 MB), the app should still work for hours: as transcriptions complete, delete the audio for those snips/sessions that have valid text; can also drop waveform/volume profile data. Keep going. End result of long recording can be transcription text only. That was the original design intent.

## Requested Outcome

- session-store (and any PWA orchestration that enforces `storageCap`): after a snip/session has a successful transcript, it is eligible for audio purge when over cap (or proactively when approaching cap).
- Never delete a snip’s audio if it has no successful transcript yet.
- Prefer deleting oldest fully-transcribed audio first.
- Playback of purged audio should fail gracefully (“audio removed after transcription” / similar).
- Transcript text remains.
- Do not redesign session-detail or live overlay UI.

## Source of truth

Original Web Whisper (`unlox775/web-whisper`, `src/modules/storage/manifest.ts` `applyRetentionPolicy`):

- Does **not** delete sessions or transcripts to meet the cap.
- A chunk is eligible only when **every overlapping snip** has `transcription` and no `transcriptionError`.
- Chunks with no overlapping snips are skipped (untranscribed / uncut audio stays).
- Eligible chunks are sorted oldest-first (`createdAt`, then `seq`).
- Purge zeros the blob (`byteLength: 0`) and sets `audioPurgedAt` on the chunk and covering snips.
- Playback: “Audio was purged for this recording and is no longer available.” / “Audio for this recording was purged.”

Original PWA calls the pass on chunk-written (debounced), on a 120s interval while recording, and when the storage limit setting changes.

## What shipped

### session-store

`enforceRetentionPolicy(capBytes)` no longer cascade-deletes oldest sessions.

It now:

1. Computes used bytes (sum of chunk `sizeBytes` × 1.1 overhead).
2. Starts work when usage exceeds **90% of the cap** (approaching-cap headroom for the next encoded chunk).
3. Marks a chunk eligible only if it still has audio **and** every covering snip has a **non-empty trimmed** transcript.
4. Purges oldest eligible audio first (session `createdAt` asc, then chunk `seq`).
5. Replaces the blob with an empty `audio/mpeg` Blob, sets `sizeBytes: 0` and `audioPurgedAt`.
6. Marks snips `audioPurgedAt` only when **all** of that snip’s chunks are gone.
7. Drops volume-profile / waveform rows for fully-purged sessions; strips purged chunk entries from remaining profiles.
8. Leaves the session row and all transcript text in place.

Helpers: `isChunkAudioPurged`, `hasValidTranscriptText`, `RETENTION_APPROACH_RATIO`.

### PWA orchestration

- `enforceCap` after boot, when the cap setting changes, before Start Recording, after each encoded chunk (4s debounce), after stop, after each successful `writeTranscript`, and on `store_write_failed`.
- No “old sessions were deleted” toast (sessions are kept).
- Settings help text describes transcribed-audio purge, not session deletion.

### Playback (no session-detail restyle)

- `playSession` / `playChunk` / `playSnip` return `{ error: 'audio_purged' }` when nothing playable remains.
- Session detail toasts **Audio removed after transcription**. Play controls are unchanged.

### Isolation demo

Chunk details show `present` vs `removed after transcription`. Retention log reports purged chunk count; sessions stay in the list.

## Out of scope (honored)

- Session-detail layout / copy-first UI
- Live recording overlay layout
- Creating snips from the live overlay so in-progress chunks can purge mid-take (live overlay still transcribes for display only; post-stop snips + transcripts are what become eligible)

## Automated proof

`npm test --prefix packages/datastore/session-store`

See `documentation/qa/purge-audio-after-transcription.md`.

## Resolution

**Resolved:** 2026-08-28T23:20:00Z

- [x] Transcribed snip/session audio eligible for purge under / approaching cap
- [x] Untranscribed snip audio never deleted
- [x] Oldest fully-transcribed audio first
- [x] Transcripts remain; sessions remain
- [x] Volume/waveform data dropped for purged audio
- [x] Playback fails with “Audio removed after transcription”
- [x] No session-detail or live-overlay redesign
- [x] Spec in session-store `docs/specs/`
- [x] `make build` publishes PWA to `docs/`
- [x] Draft PR, not merged
