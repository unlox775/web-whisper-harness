# Customer: packages/lib/transcription-client

Transcription-client is a customer of session-store **only for structured logs**. It does not write transcripts (the PWA calls `writeTranscript` after `transcribeAudio` returns) and it does not read chunks.

## Producer's Understanding of This Customer

**Identity**: Transcription-client is the Groq Whisper boundary. It validates keys and transcribes one assembled snip blob per call.

**Core need (Phase 07)**: Emit durable structured logs through session-store so a failed take’s zip can show Groq attempts, retries, and errors without `console.log`.

**What this customer may call**:

```javascript
sessionStore.log('transcription-client', 'info', () => ({
  message: 'transcribeAudio ok',
  details: { snipId, charCount, language }
}), { sessionId })
```

Or `warn` / `error` on `{ error }` results. Always the lazy function (or a string). Session-store checks `transcription-client` level **and** active/explicit session id **before** invoking the payload. If gated, zero work.

**What this customer must not call**: `writeTranscript`, `writeChunk`, `enforceRetentionPolicy`, `queryLogs`, archive export/import. Those stay PWA / other packages.

## Customer Request

I'm transcription-client. I need `log(packageId, level, payload, { sessionId }?)` with the two-gate lazy contract documented in `docs/specs/20261006180517-feedback-durable-per-package-logging.md`. I will pass `packageId: 'transcription-client'` and the session id the PWA is transcribing. I do not need a log query API.

## Producer Response

Accepted. `log()` is the only new session-store surface for this customer. Failed persist returns `{ error }` and does not throw. No new transcription-client product or `package-logger` package.
