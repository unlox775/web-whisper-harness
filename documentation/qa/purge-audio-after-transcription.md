# QA: Purge transcribed audio under storage cap

**Date:** 2026-08-28  
**Branch:** `cursor/purge-audio-after-transcription-e4c1`  
**Proof type:** automated (IndexedDB via `fake-indexeddb`) — no session-detail / overlay restyle to screenshot

## What was verified

Command:

```
npm install --prefix packages/datastore/session-store
npm test --prefix packages/datastore/session-store
```

All 5 tests passed:

1. **Purges oldest fully-transcribed audio and keeps the transcript**  
   Two sessions over a small cap. Older session has a valid transcript + volume profile. Newer session has audio and **no** transcript. After `enforceRetentionPolicy`:
   - Older chunk blob is empty, `audioPurgedAt` set, `sizeBytes === 0`
   - Transcript text still reads `Lecture notes stay.`
   - Session row still listed (`deletedSessions === 0`)
   - Volume profile for the fully-purged session is deleted
   - Newer untranscribed chunk is untouched

2. **Never deletes a snip’s audio when it has no successful transcript**  
   Whitespace-only transcript is not “valid”. Over-cap pass purges **zero** chunks.

3. **Does not purge a chunk until every overlapping snip is transcribed**  
   Shared chunk covered by one transcribed snip and one untranscribed snip stays.

4. **Prefers oldest fully-transcribed audio**  
   Two transcribed sessions; only the older chunk is purged when one chunk of headroom is enough.

5. **No-op under the approaching-cap threshold**  
   Tiny transcribed session under a 200 MB cap is left alone.

## Playback mapping (not a layout change)

`playSession` / `playChunk` / `playSnip` return `{ error: 'audio_purged' }`. Session detail toasts **Audio removed after transcription**. Transcript textarea is unchanged.

## Out of scope confirmed untouched

- Session-detail copy-first layout
- Live recording overlay Stop slot / overlay chrome
