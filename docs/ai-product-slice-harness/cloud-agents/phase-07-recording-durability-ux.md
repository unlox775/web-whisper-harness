# Phase 07: PWA recording durability UX (wake lock + no-audio pulse/beep)

**Package**: apps/web-whisper-pwa  
**Spec**: apps/web-whisper-pwa/docs/specs/20260904120002-feedback-recording-durability-ux.md  
**Status**: unresolved  
**Depends on**: capture-engine stall events (spec `20260904120001`) merged or otherwise available  
**Runner**: Cursor Cloud Agent (not Codex)

## Model / runner notes (read first)

- Implement this spec with a **Cursor Cloud Agent**. Do **not** call Codex (`codex exec` or any Codex CLI).
- This job is **PWA only**. Consume capture-engine events; do not change capture-engine internals.
- **PWA UI change:** before marking resolved, capture **iPhone DevTools** screenshot proof (~390px / iPhone viewport) of the “No audio” pulse state.
- Run **`make build`** from the repo root before push so `docs/` GitHub Pages PWA artifacts refresh. Leave harness files in `docs/` in place; only refresh PWA publish artifacts.
- Do **not** mark the spec resolved until screenshots + `make build` + Resolution section exist.

## Task Summary

Keep the phone awake while recording. When capture thinks it is live but audio is missing (start clock with no PCM, or mid-stream `audioStalled`), pulse the recording UI and beep — **do not stop** the session.

## Critical Design Requirements

1. **Wake lock is PWA-owned** — port original `unlox775/web-whisper` `src/modules/capture/wake-lock.ts` (Screen Wake Lock + visibility reacquire). Not capture-engine.
2. **Dave: do not stop the recording** for no-audio alert / mid-stream stall. Change today’s `no_audio_received` → `finishCapture('home')` in `src/context.tsx` to alert instead.
3. **Spec 1 events** — listen for `audioStalled` / `audioResumed`. Also alert when recording is up and `chunksEncoded === 0` (clock ticking, no audio yet).

## What to Change

### 1. Wake lock module (new PWA file)

- `navigator.wakeLock.request('screen')` while recording
- Release on stop / abort / leaving recording
- Re-request on `visibilitychange` → `visible` if still recording
- Missing API: no throw

### 2. Recording durability alerts (`RecordingScreen` + `context.tsx`)

- Subscribe to `audioStalled` / `audioResumed` on the live handle
- Slow pulse + banner copy **“No audio”**
- Clear on resume / first PCM or chunk
- If stalled ≥ ~5s (and every ~5s while still stalled): **3-beep** pattern, loud enough on iPhone
- Same beeps when recording started but no audio yet
- Web Audio oscillator is fine; start/resume context from the Start Recording gesture
- **Do not** call `finishCapture` for `no_audio_received` or mid-stream stall
- `encoding_failed` may still stop; `store_write_failed` stays a toast

### 3. Proof

- iPhone DevTools screenshot of pulse / “No audio”
- `make build`

## What NOT to Change

- Do NOT edit capture-engine (beyond consuming events that spec 1 already added)
- Do NOT edit playback-engine volume
- Do NOT edit snips list text or histogram
- Do NOT modify session-store
- Do NOT commit `node_modules`, `dist`, or lockfile surprises

## Stop Conditions

Mark spec resolved when:

1. Wake lock acquired/released/reacquired as specified
2. Pulse + “No audio” banner on stall and start-with-no-audio
3. 3-beep pattern at ~5s / every ~5s while stalled
4. Recording is not auto-stopped for stall or `no_audio_received`
5. iPhone DevTools screenshot attached / checked in under `documentation/qa/` (or linked in Resolution)
6. `make build` completed
7. Spec has a Resolution section documenting the no-auto-stop choice

## Implementation Prompt

```
Implement PWA recording durability UX per
apps/web-whisper-pwa/docs/specs/20260904120002-feedback-recording-durability-ux.md

Use a Cursor Cloud Agent. Do NOT call Codex.

Prerequisites:
- Spec 20260904120001 (capture-engine audioStalled / audioResumed) should be available.

Requirements:
1. Screen wake lock while recording; release on stop/abort; re-request on visibility visible.
2. Consume audioStalled / audioResumed. Also alert when clock is ticking and no audio yet.
3. Slow visual pulse + “No audio” banner; clear on resume.
4. 3-beep pattern at ~5s and every ~5s while stalled (including start-with-no-audio).
5. Do NOT stop recording for mid-stream stall or no_audio_received. Change context.tsx so no_audio_received alerts instead of finishCapture('home').
6. iPhone DevTools screenshot of the pulse state before marking resolved.
7. Run make build from repo root before push (refresh docs/ PWA artifacts only).
8. Update the spec with a Resolution section.

Do NOT:
- Change capture-engine internals
- Touch volume slider, snips text, or histogram
- Modify session-store
- Call Codex
- Commit node_modules, dist, or lockfiles

Stop when the spec is resolved with Resolution, iPhone screenshot, and make build.
```
