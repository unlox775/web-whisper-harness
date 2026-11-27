Spec Status: resolved
Spec Type: feedback
Created: 2026-11-27T05:38:00Z
Resolved: 2026-11-27T06:10:00Z
Product: packages/lib/capture-engine

# Feedback: Import an audio file into durable chunks (same format as live capture)

## User Feedback

Dave wants to upload an existing recording (iPhone Voice Memos `.m4a`; also `.mp3`, `.wav`, `.webm`) and have it transcribed exactly like a live take. The file must land in the same session list and go through the same snip → transcription pipeline. Imported audio is durable data: it is saved, or held and retried until saved — never discarded.

## Why capture-engine

capture-engine already owns PCM → MP3 encoding, ~4 s chunk timing, and the durable persist queue (`writeChunk` with backoff, `flushPending`, `chunk_lost`). Every downstream consumer (volume-analyzer, snip assembler, playback-engine, export) reads those chunks. An imported file is just another PCM source. Re-implementing encode/persist in the PWA would fork the durability rules, so the import lives here.

## Requested Outcome — new public interface

```ts
importAudioFile(
  sessionId: string,
  file: Blob | ArrayBuffer,
  options?: {
    chunkTargetDuration?: number;      // default 4.0 (same as live)
    decodeSampleRate?: number;         // default 16000 (see Memory)
    onProgress?: (p: { phase: 'decoding' | 'encoding' | 'saving'; chunksEncoded: number; chunksSaved: number; totalChunks: number; duration: number }) => void;
    decode?: (bytes: ArrayBuffer, sampleRate: number) => Promise<{ sampleRate: number; channels: Float32Array[] }>; // test seam
  }
): Promise<ImportSummary>

type ImportSummary = {
  sessionId: string;
  chunksWritten: number;
  totalDuration: number;   // seconds, decoded PCM samples / sampleRate
  hasAudio: boolean;
  sampleRate: number;
  lostChunks: LostChunk[];
};
```

Errors: rejects with `CaptureError` codes `decode_failed` (unsupported codec / corrupt file — **nothing was written**), `empty_audio` (decoded 0 samples), `audio_context_unavailable`, `already_capturing` (same session id already active).

### Behavior

1. Decode with Web Audio `decodeAudioData` on an `OfflineAudioContext` at `decodeSampleRate` (falls back to `AudioContext` / `webkitOfflineAudioContext` where missing). Mix down to mono **per chunk** (no full-length mono copy).
2. Slice PCM into `chunkTargetDuration` pieces and encode them with the **same `MP3Encoder` (lamejs, `audio/mpeg`)** used for live capture, one continuous encoder per import, final short chunk flushed exactly like `stop()`.
3. Every chunk goes through the **same persist queue** as live capture (`sessionStore.writeChunk` with `seq`, `startTime`, `endTime`, `duration`, `blob`, `sizeBytes`). Same transient/permanent classification, same backoff (250 ms → 4 s), same `chunk_lost` + `recordChunkLost` on permanent loss only.
4. **Backpressure, not drop:** the encoder waits while ≥ 8 chunks are pending persist. It never skips a chunk and never ends the import while a chunk is pending.
5. The import is registered in the active-session map for its duration, so the package-level `flushPending()` / `whenPersistIdle()` covers it (retention gating stays correct). While importing, transient write errors keep retrying (session is "live").
6. Resolves only after `flushPending()` for that session: every chunk saved or declared lost.
7. Yields to the event loop between chunks so the UI can paint progress.
8. Structured logs via `session-store.log('capture-engine', …)`: import start (bytes, mime), decode ok (duration, channels, sampleRate), decode failed, import done (chunksWritten, lostCount).
9. No microphone, no watchdog / stall monitor, no wake lock for imports.

### Memory

`decodeAudioData` holds the whole decoded file in memory (Float32 × channels). At 16 kHz that is ~3.7 MB/min/channel (≈ 230 MB for 60 min mono). 16 kHz is what Whisper consumes, keeps speech intelligible for playback, and cuts iPhone memory ~3× vs 48 kHz. Callers may raise `decodeSampleRate` for short files.

## Customer guarantees (add to `customers/web-whisper-pwa.md`)

- Imported chunks are indistinguishable to consumers from live chunks (MP3 `audio/mpeg`, contiguous seq from 0, session-time `startTime`/`endTime`).
- Imported audio is saved or held and retried until saved; loss is only on permanent store error and reported precisely (`chunk_lost` / `lostChunks`).
- On `decode_failed` nothing was written; caller decides what to do with the empty session.

## Tests

- Unit (stub encoder + stub store + stub decode): chunk count / timing for a 10.5 s file → 3 chunks (4, 4, 2.5 s), seq 0..2, contiguous times; stereo mixdown; progress events; `decode_failed` writes nothing; transient store error is retried and the chunk is saved (no loss); permanent error → `lostChunks` + `chunk_lost`; backpressure never holds more than the bound; global `flushPending()` waits for an in-flight import.
- Existing live-capture tests stay green.

## Out of scope

- UI (PWA spec `apps/web-whisper-pwa/docs/specs/20261127053801-feedback-import-audio-file.md`).
- Streaming decode of files bigger than memory.
- session-store schema changes (no title/source field).

## Resolution Criteria

- [x] `importAudioFile` exported with types
- [x] Unit tests above pass; live capture tests unchanged and green
- [x] README interface section + `customers/web-whisper-pwa.md` producer response updated
- [x] Spec Resolution section

## Resolution

Resolved on branch `capture-engine/import-audio-file`.

- `importAudioFile(sessionId, file, options)` in `src/captureEngine.ts`, exported from `src/index.ts`; types `DecodedAudio`, `ImportAudioOptions`, `ImportProgress`, `ImportSummary` in `src/types.ts`.
- Decode: `OfflineAudioContext(1, 1, decodeSampleRate)` (→ `webkitOfflineAudioContext` → `AudioContext`), callback + promise `decodeAudioData` for older Safari. Per-chunk mono mixdown.
- Encode: same `MP3Encoder`; default bitrate is 64 kbps at ≤ 24 kHz (MPEG-2), 128 kbps otherwise (live capture unchanged at 44.1/48 kHz → 128).
- Persist: `CaptureSession.runImport` feeds the live `encodeChunk` → `enqueuePersist` → `drainPending` path. Backpressure loop holds encoding while ≥ 8 chunks pending. Registered in `activeSessions`, so package `flushPending()` covers imports.
- Tests: `src/importAudioFile.test.ts` (8 tests: chunk timing, stereo mixdown, decode_failed writes nothing, empty_audio, transient retry, permanent loss reported, backpressure bound, global flushPending waits). `npm test` → 22/22 pass (14 existing live-capture tests unchanged).
