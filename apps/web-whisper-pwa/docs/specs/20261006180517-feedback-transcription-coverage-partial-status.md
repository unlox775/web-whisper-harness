Spec Status: resolved
Spec Type: feedback
Created: 2026-10-06T18:05:17Z
Resolved: 2026-10-06T19:10:00Z
Product: apps/web-whisper-pwa

# Feedback: Transcription coverage — do not claim complete when audio remains past last snip

## User Feedback

Dave saw **“all snips transcribed”** / a complete (READY) status while **audio still remained past the last snip**. MediaRecorder / session duration outran snip coverage. Every *existing* snip had text, so the UI treated the take as done — but minutes of recorded audio were never proposed as snips and never sent to Groq.

That is a **false complete**. Status must be **`partial` / incomplete** (PART TX), not READY.

## Depends on

None of the logging / persist-queue specs. Independent PWA orchestration + badge copy.

Related (do not redo):

- Live durable snip pipeline — `20260828210000-feedback-live-durable-snip-transcription.md` (implemented)
- Home READY / PART TX badges — `20260827045000-feedback-live-recording-overlay.md`
- Assembled snip blobs — `20260908143900-feedback-phase-07-transcribe-assembled-snip-blobs.md` (resolved)

## Requested Outcome

### 1. Track coverage: last snip end vs session duration

Compute a single helper (name may vary; document it), e.g. `sessionTranscriptionCoverage(session, snips, transcripts, extras?)`.

Compare **in one unit** (prefer milliseconds):

- `lastSnipEndMs` = max snip `endTime` (existing snip times are **seconds** — multiply by 1000)
- `durationMs` = session recorded duration. Use the best available, in this order:
  1. `session.duration` seconds × 1000 (session-store; capture-engine updates this from chunk `endTime`)
  2. If the PWA still has capture-engine `totalDuration` / MediaRecorder duration for this take and it is **larger**, use that (do not claim complete when the recorder outran stored chunk metadata)
- `uncoveredMs` = `max(0, durationMs - lastSnipEndMs)`
- If there are **zero** snips and `durationMs` > threshold → uncovered = `durationMs`

**Gap threshold** (constant, document it): default **`2000` ms** (`COVERAGE_GAP_THRESHOLD_MS = 2000`). A trailing quiet tail shorter than this does **not** flip the session to incomplete (snip algorithm already holds a quiet-gap tail). Uncovered audio **greater than** 2.0s is incomplete.

Do not invent a new session-store field unless a later spec needs it. This is PWA-derived status.

### 2. Status must be `partial` when uncovered audio remains

Existing Home badges (`20260827045000`):

| Badge | When |
| --- | --- |
| **READY** (green) | Every existing snip has a transcript **and** uncovered tail ≤ threshold |
| **PART TX** (orange) | Some snips missing/failed transcripts **or** every snip has text but uncovered audio **>** threshold |

Internal status string for this second case: **`partial`** (alias **incomplete**). Do **not** use complete / READY / “all snips transcribed”.

`hasTranscript === true` on the session row only means “at least one transcript exists.” It is **not** sufficient for READY.

Session Detail (and live overlay / any “transcription complete” copy) must use the same helper. Do not show a complete checkmark while coverage is short.

Zero snips + playable duration > threshold: PART TX or the existing “no speech detected” path — **never** READY / “all snips transcribed.” All-quiet (`proposeSnips` → `[]`) may keep the dedicated “no speech” copy; still must not claim all snips transcribed.

### 3. Copy

When the only reason for incomplete is the uncovered tail (all existing snips have text):

> Transcription is incomplete. More audio exists beyond MM:SS.

`MM:SS` is the last snip end (or `0:00` if there are no snips), formatted like the rest of the PWA duration UI.

When snips are also missing transcripts, keep existing PART TX / retry copy; **also** mention the tail if uncovered > threshold (do not hide the coverage gap behind “retry failed snips”).

RETRY TX remains valid: it should ingest / propose snips on the uncovered window (`windowStartTime = lastSnipEnd`, same live pipeline), not only re-hit Groq on already-closed snips. If RETRY TX already calls `ingestGrowingSession` / `proposeSnipsForSession` with a growing window, use that. If it only retries snips that already exist, extend it so uncovered audio can become new snips. Do not change snip cut math (`proposeSnipsFromProfile` defaults).

### 4. Surfaces that must stay consistent

- Home session cards (badge + any “all snips transcribed” string)
- Session Detail status / transcript header
- Live overlay complete-state (if it currently flips to complete when the last known snip gets text)

If you change how status is written or derived, all three must match.

## Notes For Phase 07

- Keep changes scoped to `apps/web-whisper-pwa` (coverage helper, badges, copy, retry ingest window).
- Do not change volume-analyzer cut constants or session-store schema.
- Do not implement logging Settings or `flushPending` in this PR.
- Cursor Cloud Agent only — never Codex.
- iPhone-first proof: a session whose last snip ends before duration − 2s, with every snip transcribed, shows PART TX + the “beyond MM:SS” copy (fixture or imported archive is fine).
- Run **`make build`** from the repo root in the implementation PR.
- Update this spec with a Resolution or Blocked section when Phase 07 implementation runs.
- Do **not** mark this spec resolved from the specs-only PR.

## Out of scope

- Durable log store / Settings log levels
- Capture persist queue / retention flush
- Changing 5s / 10s / 0.6s snip algorithm
- Claiming MediaRecorder duration as a new session-store column unless the implementer finds `session.duration` is systematically wrong (if so, document and use the larger of the two in the helper)

## Resolution Criteria

Mark this spec resolved when:

- [x] Coverage helper compares last snip end to session/recorder duration with a documented ~2s threshold
- [x] READY / complete is never shown when uncovered audio > threshold, even if every existing snip has text
- [x] Copy states transcription is incomplete and more audio exists beyond MM:SS
- [x] Home, Session Detail, and overlay (if applicable) agree
- [x] RETRY TX can process the uncovered window, not only existing snips
- [x] iPhone DevTools (or fixture) proof of the false-complete case now showing PART TX
- [x] `make build` published `docs/` PWA artifacts
- [x] Spec updated with a Resolution section documenting what shipped

## Resolution

**Resolved:** 2026-10-06T19:10:00Z on branch `cursor/pwa-transcription-coverage-partial-a4f8` (draft PR).

### What shipped

1. `sessionTranscriptionCoverage(session, snips, transcripts, extras?)` in `apps/web-whisper-pwa/src/transcriptionCoverage.ts`.
   - `lastSnipEndMs` = max snip `endTime` (seconds × 1000); 0 when there are no snips.
   - `durationMs` = max(`session.duration` × 1000, remembered capture-engine `totalDuration` / `currentDuration`).
   - `uncoveredMs` = max(0, durationMs − lastSnipEndMs).
   - `COVERAGE_GAP_THRESHOLD_MS = 2000`. Uncovered **greater than** 2.0s is incomplete.
2. Status `partial` (Home/Detail badge **PART TX**, orange) when some snips lack text **or** every existing snip has text but uncovered > threshold. Zero snips + duration > threshold is PART TX, never READY.
3. **READY** only when `snipCount > 0`, every snip has text, and uncovered ≤ 2s.
4. Copy: `Transcription is incomplete. More audio exists beyond MM:SS.` (`MM:SS` = last snip end, or `0:00`). Shown on Home cards and Session Detail; missing-transcript retry copy is kept and the tail note is added when both apply.
5. Live overlay does not flip to complete/READY (trailing audio is still being recorded).
6. RETRY TX / `transcribeSession` still calls `ensureSnips` → `proposeSnipsForSession({ includeTrailing: true })`, which freezes stored snips and sets `windowStartTime = last snip end`. Toasts no longer say “completed” while the tail is uncovered.
7. Fixtures: `?screenshot=home-partial-coverage`, `?screenshot=session-partial-coverage`.

### Untouched

Logging Settings, capture persist queue / `flushPending`, volume-analyzer cut constants, session-store schema.

### Proof shots (iPhone 12 Pro, 390×844 CSS → 1170×2532)

- `documentation/qa/home-partial-coverage-iphone.png` — PART TX + beyond 0:45 on a 3:00 take
- `documentation/qa/session-partial-coverage-iphone.png` — same helper on Session Detail
- `documentation/qa/home-after-stop-ready-regression-iphone.png` — covered tail still READY
- `documentation/qa/session-transcribed-ready-regression-iphone.png` — covered Session Detail still READY
- Notes: `documentation/qa/transcription-coverage-partial-status.md`
