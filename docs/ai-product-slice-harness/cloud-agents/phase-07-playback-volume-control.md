# Phase 07: Playback Engine Volume Control Implementation

**Package**: packages/lib/playback-engine  
**Spec**: packages/lib/playback-engine/docs/specs/20260827044500-feedback-playback-volume-control.md  
**Status**: unresolved

## Task Summary

Implement volume control for playback-engine based on user feedback from existing Web Whisper app (shot-06 shows volume slider during playback).

## What to Change

### 1. PlaybackHandleImpl (src/playback-handle.ts)

Add `setVolume` method to PlaybackHandleImpl:

```typescript
setVolume(level: number): void {
  // Clamp level to [0.0, 1.0]
  const clamped = Math.max(0, Math.min(1, level));
  // Set HTMLAudioElement.volume
  this._audio.volume = clamped;
}
```

**Implementation notes:**
- Use `HTMLAudioElement.volume` property (standard Web Audio API)
- Clamp input to 0.0–1.0 range
- No persistence across handles (each handle starts at default 1.0)
- Volume change applies immediately (works during play, pause, or before playback)

### 2. PlaybackHandle Type (src/types.ts)

Add `setVolume` to PlaybackHandle interface:

```typescript
export interface PlaybackHandle {
  // ... existing methods ...
  setVolume(level: number): void;
}
```

### 3. Isolation Demo (isolation-demo/src/App.tsx or similar)

Add volume slider control:

**UI addition:**
- Horizontal range input: `<input type="range" min="0" max="1" step="0.01" defaultValue="1" />`
- Label: "Volume"
- Position: Below or next to play/pause controls
- Event handler: Call `handle.setVolume(event.target.valueAsNumber)` on input event

**Validation:**
- Play session audio
- Adjust volume slider during playback → audio volume changes
- Pause, adjust volume, resume → new volume applies on resume
- Volume slider updates to reflect current level

## What NOT to Change

- Do NOT add volume persistence across app restarts (not requested)
- Do NOT add mute toggle button (slider at 0.0 = muted)
- Do NOT add volume memory per session (each handle starts at 1.0)
- Do NOT modify session-store (volume is playback state, not durable data)
- Do NOT modify capture-engine (capture volume is separate concern)
- Do NOT commit node_modules, dist, or lockfile changes

## Stop Conditions

Mark spec resolved when:
1. `setVolume(level)` method implemented and exported
2. Volume control tested in Isolation Demo
3. Volume slider in demo works (real-time volume change during playback)
4. All existing playback tests still pass
5. Spec updated with Resolution section:
   - What was implemented (method signature, behavior)
   - How it was tested (demo validation steps)
   - Screenshot or video proof of volume slider working in demo

## Implementation Prompt

```
Implement playback-engine volume control per feedback spec 20260827044500-feedback-playback-volume-control.md.

Requirements:
1. Add setVolume(level: number) method to PlaybackHandleImpl
   - Clamp level to [0.0, 1.0]
   - Set HTMLAudioElement.volume property
   - Applies immediately (during play, pause, or before playback)
2. Update PlaybackHandle type to include setVolume
3. Add volume slider to Isolation Demo
   - Range input: min=0 max=1 step=0.01 default=1
   - Label: "Volume"
   - Calls handle.setVolume(value) on input event
4. Test volume control:
   - Play audio, adjust slider → volume changes
   - Pause, adjust, resume → new volume applies
5. When complete, update spec with Resolution section documenting what shipped

Do NOT:
- Persist volume across handles (each starts at 1.0)
- Modify session-store (volume is playback state, not durable)
- Commit node_modules, dist, or lockfiles

Stop when spec is resolved with Resolution section and demo proof.
```
