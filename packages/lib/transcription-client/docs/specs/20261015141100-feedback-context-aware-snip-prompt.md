Spec Status: resolved
Spec Type: feedback
Created: 2026-10-15T14:11:00Z
Resolved: 2026-10-15T16:30:00Z
Product: packages/lib/transcription-client

# Feedback: Context-aware Whisper snip prompts

## User Feedback

Transcription of each audio **snip** (the assembled speech segment sent to Groq Whisper — never a raw ~4s capture chunk and never the whole session) should be context-aware, using the tail of the previous snip's transcript.

Whisper's `prompt` param on Groq `POST /openai/v1/audio/transcriptions` (max 224 tokens; Whisper only attends to the end of it) conditions decoding like preceding text. Passing the previous snip's transcript tail keeps spelling, casing, punctuation, and style consistent across cuts, and helps with words split at a snip boundary.

## Lexicon

- **Snip** — the unit this package transcribes. One Groq call per snip. Audio is time-trimmed to `[startTime, endTime]` (see `assembleSnipTranscriptionBlob`).
- **Chunk** — capture-engine's ~4s MP3 piece. Not sent to Groq as the transcription unit.
- **Context prompt** — the Groq `prompt` string built for snip N from optional vocabulary plus the tail of accumulated transcript text from snips before N.
- **Poisoning** — a previous snip result that should not condition the next decode (silence, low confidence, empty/repetitive hallucination).

## Requested Outcome

### 1. Prompt construction (snip N after the first)

When context is on, build `prompt` as:

1. Optional **vocabulary line** first (configurable string, e.g. `Asana, Groq, BrainGraft, TeleLinux`).
2. Then the **tail of the accumulated transcript so far**, trimmed to about **150 words** and within the **224-token** Whisper budget.
3. Keep vocabulary at the front. Cut the tail at a **word boundary**, dropping words from the *start* of the tail so the most recent words remain (Whisper attends to the end).
4. First snip: vocabulary only (or empty if no vocabulary). Do not invent preceding text.

Token accounting is local and conservative (no tiktoken dependency). Vocabulary tokens are reserved first so a long tail cannot push the vocabulary off the 224-token window.

### 2. Poisoning guard

Request `response_format=verbose_json`. Parse segment quality from the Groq body:

- `avg_logprob` (mean across segments)
- `no_speech_prob` (max across segments)

If the **previous** snip had:

- high `no_speech_prob` (default `> 0.6`), or
- low `avg_logprob` (default `< -1.0`), or
- text that looks like a hallucination (empty / whitespace-only, or highly repetitive),

then snip N's prompt is **vocabulary only** — do not attach that previous tail.

Thresholds are package constants, overridable per call. They do not need a PWA Settings control.

A failed previous snip (`{error}`) is treated as poisoned for the next prompt. Accumulated tail only includes successful non-empty text. After a clean snip, context resumes for the snip after that.

### 3. Ordering and retries

Context needs the previous result. Snip N's Groq request starts when snip N−1 **resolves** (success or failure). Do not fire snip Groq calls in parallel.

**Latency tradeoff:** a session of N snips waits for the sum of Groq round-trips instead of the max. Typical snips return in 1–5s, so a 12-snip take is tens of seconds serial versus a handful of seconds if parallel. Live ingest already closes snips over time, so serial cost is mostly hidden. Post-stop "Transcribe remaining" / session Transcribe pays the full serial cost. That is the intended trade: spelling continuity across cuts over wall-clock batch speed.

Retries of a **single** snip (HTTP backoff inside `transcribeAudio`, or a later user retry of snip N) reuse the context built from snips **before** N — not from a failed attempt of N, and not from N's own text.

### 4. Public interface

This package owns prompt building, quality extraction, the serial chain, and sending `prompt` + `verbose_json` on the Groq request.

Planning names (implementation may match):

| Interface | Input | Output |
| --- | --- | --- |
| `buildContextPrompt(options)` | vocabulary, accumulated text, previous result, enabled flag, thresholds | `{prompt, kind, usedPreviousTail, guardReason?}` |
| `createContextChain(options)` | vocabulary, enabled, thresholds | stepper: `promptForNext()`, `observeResult(result)`, seed from prior transcripts |
| `transcribeSequence(items, options)` | ordered `{id, blob}[]`, apiKey/mode/vocabulary/enabled | ordered results with `prompt` + `kind` per snip |
| `transcribeAudio(blob, options)` | existing options plus `prompt`, `contextEnabled` | `{text, language?, avgLogprob?, noSpeechProb?, compressionRatio?}` or `{error}` |

`transcribeAudio` retries (1s / 2s / 4s) resend the **same** prompt.

Default: context **on**. Vocabulary default: empty string (callers / Settings supply names).

### 5. What is not stored here

This package still owns **no durable data**. It does not write transcripts or prompt strings to session-store. Quality fields ride on the in-memory result so the next call in the chain can apply the guard. A later retry reconstructs the prompt from prior snips' **stored text** (text-only hallucination guard when `avgLogprob` / `noSpeechProb` are absent).

### 6. Isolation Demo

Extend the package Isolation Demo (same factory-floor app, additional page):

- **Context chain page** (`context-chain.html`): side-by-side snip sequences **with context** vs **without**. Fixture/mock responses by default so it runs without a Groq key. Optional live mode if a Groq key is supplied (same paste/persist key field as the main demo).
- **Guard fallback demo** on that page: previous snip is empty / repetitive / high `no_speech_prob` → next prompt is vocabulary only, labeled as the guard.
- Show the prompt string used for each snip.
- Main demo archive step-through uses the serial context chain when Live Groq is on (same as production).

### 7. Downstream

The PWA must expose Settings (on/off default on, vocabulary field) and pass them into the chain on Transcribe, live ingest, and per-snip retry. That is a downstream-request spec on `apps/web-whisper-pwa`, implemented in the same PR because the founder asked for end-to-end Settings plus the core package.

## Out of scope

- Changing snip cut math or `assembleSnipTranscriptionBlob`
- session-store schema / persisting prompt or quality on the transcript record
- Parallel Groq fan-out
- Paid live Groq in unit tests
- UI for poison thresholds

## Resolution Criteria

- [x] Spec + README / customer-doc addenda describe the context chain, request/response shape, and serial latency tradeoff
- [x] `buildContextPrompt` keeps vocabulary first, trims ~150 words / 224 tokens at a word boundary
- [x] Guard falls back to vocabulary-only on high `no_speech_prob`, low `avg_logprob`, empty/repetitive text
- [x] `transcribeSequence` / chain is serial (N waits on N−1); retries reuse prior-snip context
- [x] Unit tests mock Groq; no live paid calls
- [x] Isolation Demo shows with/without context side by side plus guard fallback
- [x] `make build` refreshes PWA + Isolation Demo publish artifacts
- [x] Draft PR; do not mark ready; do not merge

## Resolution

**Resolved:** 2026-10-15T16:30:00Z  
**Phase:** Phase 07 — context-aware Whisper snip prompts  
**Runner:** Cursor Cloud Agent (grok-4.6)

### What shipped

- `src/contextPrompt.js` — `buildContextPrompt`, `createContextChain`, trim/token budget, hallucination + quality guard
- `src/transcribeSequence.js` — serial snip N waits on N−1
- `transcribeAudio` sends `prompt` + `verbose_json`, returns `avgLogprob` / `noSpeechProb`, retries reuse the same prompt
- Isolation Demo `context-chain.html` (fixture mock side-by-side + guard) and archive step-through on the main demo
- PWA Settings + orchestration consume the chain (downstream spec)

### Validation

- `npm --prefix packages/lib/transcription-client test` — 26 pass (mocked Groq)
- `npm --prefix packages/lib/transcription-client/isolation-demo test` — 25 pass
- `npm --prefix apps/web-whisper-pwa test` — pass including settings + retry-context helpers
- Browser: fixture compare + guard on published Isolation Demo; PWA Settings shows toggle + vocabulary

## Notes For Phase 07

- Cursor Cloud Agent only — never Codex.
- Core logic lives in `packages/lib/transcription-client`.
- Isolation Demo stays package-local.
- Create a downstream-request spec for the PWA Settings + orchestration wiring.
