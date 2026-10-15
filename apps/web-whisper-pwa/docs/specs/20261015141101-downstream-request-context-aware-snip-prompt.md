Spec Status: resolved
Spec Type: downstream-request
Created: 2026-10-15T14:11:01Z
Resolved: 2026-10-15T16:30:00Z
Product: apps/web-whisper-pwa
Requested By: packages/lib/transcription-client
Customer Relationship: web-whisper-pwa consumes transcription-client

# Downstream request: Context-aware snip transcription in the PWA

## What changed in the producer

transcription-client can condition each snip's Groq Whisper decode on the tail of the previous snip's transcript (`prompt` param), with an optional vocabulary line and a poisoning guard. Snip Groq calls are serial. See:

`packages/lib/transcription-client/docs/specs/20261015141100-feedback-context-aware-snip-prompt.md`

## What the PWA should reassess

The PWA owns Settings, live ingest, session Transcribe, and per-snip retry. It currently calls `transcribeAudio(blob, { apiKey, mode: 'live' })` with no prompt. Context is useless unless the PWA:

1. Stores and shows the new settings.
2. Feeds them into every Groq snip call in time order.
3. Rebuilds prior-snip context on retry.

## Requested behavior

### Settings (visible on the Transcription section)

- **Context-aware transcription** toggle. Default **on**.
- **Vocabulary** text field. Placeholder example: `Asana, Groq, BrainGraft, TeleLinux`. Default empty. Persist with the existing localStorage settings family (`groq_api_key`, `storage_cap_mb`, …).

Poison thresholds stay in the package; no extra Advanced sliders.

### Orchestration

`transcribePendingSnips` (session Transcribe, RETRY TX, live ingest leftover) already loops snips one at a time. Keep that serial order. For each pending snip:

1. Build the prompt from prior snips in start-time order (already-written transcripts plus results from this pass).
2. Call `transcribeAudio` with `prompt` and context enabled from Settings.
3. Observe the result so snip N+1 can apply the guard.

Live ingest calls `transcribePendingSnips` as snips close. Seed the chain from transcripts already stored for that session so snip 2 (later ingest tick) still sees snip 1.

### Per-snip retry (`retrySnip`)

Reuse context from snips **before** the retried snip (accumulated stored text + last prior snip's quality if this pass still has it). Do not use a failed attempt of the retried snip itself.

### Latency

Document in Settings help that snips transcribe one after another so spelling stays consistent across cuts. That is slower than parallel Groq calls for a long post-stop batch.

## Validation

- Settings round-trip: toggle off → reload → still off; vocabulary persists.
- Transcribe / live ingest / retry pass `prompt` when the toggle is on.
- Isolation Demo remains the visual proof of with/without context; PWA proof is Settings visible + orchestration wired.
- iPhone-first Settings screenshot in the implementation PR.

## Out of scope

- session-store transcript schema
- Changing volume-analyzer snip cuts
- Threshold UI

## Resolution

**Resolved:** 2026-10-15T16:30:00Z

Settings Transcription section has a context-aware toggle (default on) and a vocabulary field, persisted in the existing localStorage family. `transcribeSession`, live ingest, leftover TX, and per-snip retry pass `transcriptionContextFromSettings`. Help text documents the serial latency tradeoff. Screenshot: `documentation/qa/pwa-settings-context-prompt.png`.
