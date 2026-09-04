# Phase 07: Capture-engine mid-stream stall detection

**Package**: packages/lib/capture-engine  
**Spec**: packages/lib/capture-engine/docs/specs/20260904120001-feedback-ongoing-audio-stream-stall-detection.md  
**Status**: unresolved  
**Runner**: Cursor Cloud Agent (not Codex)

## Model / runner notes (read first)

- Implement this spec with a **Cursor Cloud Agent**. Do **not** call Codex (`codex exec` or any Codex CLI).
- This job is **capture-engine only**. Do not edit PWA, playback-engine, or session-store.
- This is not a PWA UI change. Isolation Demo proof is enough; iPhone DevTools screenshots are not required here.
- Do **not** run `make build` unless you actually change PWA publish output (you should not).
- Do **not** mark the spec resolved until stall/resume + start-watchdog tests and Isolation Demo status are done, then add a Resolution section.

## Task Summary

Start watchdog (`watchdogTimeout`, `no_audio_received`, auto-stop when zero chunks) is not enough. After audio has started, emit `audioStalled` if PCM/progress stops for ~5s, and `audioResumed` when it returns. **Never auto-stop** on mid-stream stall.

## What to Change

### 1. CaptureOptions (`src/types.ts`)

Add `stallTimeout?: number` (seconds, default `5.0`). Leave `watchdogTimeout` as the start-only ghost timer (default 10s).

Export typed payloads for `audioStalled` and `audioResumed` (see spec).

### 2. CaptureSession (`src/captureEngine.ts`)

- Track `pcmSeen` and last-progress timestamp on each PCM callback.
- After `pcmSeen || chunkCount > 0`, if no new PCM/progress for `stallTimeout`, emit `audioStalled` once (or once per stall interval if you document periodic re-emit). **Do not call `stop()`.**
- On the next PCM after a stall, emit `audioResumed` once.
- Keep existing start watchdog: first-PCM cancel, `no_audio_received` + auto-stop only when audio never started / `chunkCount === 0`.
- Optional: expose `stalled` / `stalledFor` on `getStatus()` for the demo.

### 3. Isolation Demo

- Banner or meter: Stream live vs stalled
- Event feed lines for `audioStalled` / `audioResumed` (not the same red treatment as `no_audio_received` unless you also keep them visually distinct)
- Optional Simulate stall control

### 4. Tests

Add `node:test` coverage in this package for stall, resume, no auto-stop, and start-watchdog isolation (see spec).

## What NOT to Change

- Do NOT auto-stop on mid-stream stall
- Do NOT reuse `no_audio_received` for mid-stream stall
- Do NOT implement PWA pulse/beep/wake-lock (spec `20260904120002`)
- Do NOT modify session-store or playback-engine
- Do NOT commit `node_modules`, `dist`, or lockfile surprises
- Do NOT mark the spec resolved from a specs-only commit — only after this implementation lands

## Stop Conditions

Mark spec resolved when:

1. `audioStalled` / `audioResumed` emit per spec
2. Mid-stream stall does not stop capture
3. Start watchdog still auto-stops with `no_audio_received` when zero audio
4. Isolation Demo shows stalled/resumed
5. Tests pass
6. Spec has a Resolution section

## Implementation Prompt

```
Implement capture-engine mid-stream stall detection per
packages/lib/capture-engine/docs/specs/20260904120001-feedback-ongoing-audio-stream-stall-detection.md

Use a Cursor Cloud Agent. Do NOT call Codex.

Requirements:
1. After audio started (PCM seen OR chunkCount > 0), if no PCM/progress for stallTimeout (default 5s), emit audioStalled. Do NOT stop().
2. When PCM resumes, emit audioResumed.
3. Keep start watchdog: no_audio_received + auto-stop only when no audio ever arrived.
4. Do not reuse no_audio_received for mid-stream stall.
5. Isolation Demo: live vs stalled status + event feed.
6. node:test for stall, resume, and start-watchdog isolation.
7. When complete, update the spec with a Resolution section.

Do NOT:
- Edit apps/web-whisper-pwa
- Edit session-store or playback-engine
- Auto-stop on mid-stream stall
- Commit node_modules, dist, or lockfiles

Stop when the spec is resolved with a Resolution section and demo + tests prove stall/resume.
```
