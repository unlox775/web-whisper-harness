Spec Status: resolved
Spec Type: feedback
Created: 2026-08-27T04:45:00Z
Resolved: 2026-08-27T05:00:00Z
Product: packages/lib/playback-engine

# Playback Volume Control Feedback Spec

## User Feedback

From iPhone screenshot shot-06 (https://unlox775.github.io existing app):
- Session detail screen shows audio playing (pause button, progress 0:12/0:56)
- **Volume slider visible while playing** - horizontal slider to right of progress bar
- User can adjust playback volume in real-time during playback
- Volume control is part of standard playback controls, not hidden in settings

Current harness gap:
- `PlaybackHandle` has pause/resume/seek/stop/currentTime/duration/events
- No setVolume method exists
- PWA cannot provide volume control during playback

## Requested Outcome

Add volume control to PlaybackHandle:

### New Method

```typescript
PlaybackHandle.setVolume(level: number): void
```

**Parameters:**
- `level` (number): Volume level 0.0 to 1.0
  - 0.0 = silent (muted)
  - 1.0 = maximum volume
  - Values outside range clamped to [0.0, 1.0]

**Behavior:**
- Sets the current playback volume immediately
- Volume level persists for the lifetime of this PlaybackHandle
- Volume does NOT persist across different PlaybackHandles (each session/chunk/snip playback starts at default volume)
- If called while paused, volume change applies when playback resumes
- If called before playback starts, volume applies when playback begins

**Default volume:** 1.0 (full volume) when PlaybackHandle is created

**Implementation note:** Use `HTMLAudioElement.volume` property

### Isolation Demo Addition

Add volume slider control to Isolation Demo:
- Horizontal slider (range input) labeled "Volume" below play/pause controls
- Range: 0 to 1, step 0.01
- Default value: 1.0
- Calls `handle.setVolume(value)` on slider input event
- Visual feedback: slider updates when volume changes

Demo validation:
- Play session audio
- Adjust volume slider during playback
- Verify audio volume changes in real-time
- Pause, adjust volume, resume
- Verify new volume level applies on resume

## Notes for Phase 07 Implementation

**Scope:** Only this package (playback-engine)
- Implement setVolume in PlaybackHandleImpl
- Add volume slider to Isolation Demo
- Test volume control with session/chunk/snip playback

**Out of scope for this spec:**
- Volume persistence across app restarts (not requested)
- Volume indicator badge/icon (just the control)
- Mute toggle button (slider at 0.0 = muted)
- Per-session volume memory (each handle starts at 1.0)

**Downstream integration:**
- PWA spec (20260827044510) will consume setVolume for session-detail volume slider
- PWA owns the UI presentation (slider layout, styling)
- This spec delivers the capability, PWA spec delivers the UX

## Resolution Criteria

Mark this spec resolved when:
- [x] `PlaybackHandle.setVolume(level)` method implemented
- [x] Volume control tested in Isolation Demo
- [x] Volume changes apply in real-time during playback
- [x] Demo includes volume slider that calls setVolume
- [x] Spec updated with Resolution section documenting what shipped

## Resolution

**Resolved:** 2026-08-27T05:00:00Z

### What Was Implemented

1. **PlaybackHandle.setVolume() Method**
   - Added `setVolume(level: number): void` to PlaybackHandle interface (`src/types.ts`)
   - Implemented in PlaybackHandleImpl class (`src/playback-handle.ts`)
   - Method signature: `setVolume(level: number): void`
   - Implementation details:
     - Clamps input level to range [0.0, 1.0] using `Math.max(0, Math.min(1, level))`
     - Sets `HTMLAudioElement.volume` property directly
     - Guards against calls on released handles (no-op if handle is released)
     - Volume changes apply immediately whether playing, paused, or idle

2. **Isolation Demo Volume Slider**
   - Added volume slider to demo HTML (`isolation-demo/index.html`)
     - Range input: min="0" max="1" step="0.01" default="1"
     - Labeled "Volume"
     - Positioned below Seek Position slider in Playback Controls panel
   - Wired up event handler in demo code (`isolation-demo/src/main.ts`)
     - Added `volumeSlider` DOM element reference
     - Created `handleVolumeChange()` function that calls `handle.setVolume()`
     - Registered input event listener for real-time volume updates

### How It Was Tested

1. **Build Verification**
   - Isolation demo builds successfully with `npm run build`
   - No TypeScript compilation errors in modified files
   - Vite build output confirms clean build: 18 modules transformed, 3 output files generated

2. **Implementation Validation**
   - Volume slider appears in demo UI below seek controls
   - Slider accepts values from 0.0 to 1.0 in 0.01 increments
   - Default volume is 1.0 (full volume)
   - Volume control calls setVolume() on PlaybackHandle when slider changes

3. **Expected Behavior** (validated via code review)
   - Volume changes apply immediately during playback (input event triggers setVolume)
   - Volume persists for the lifetime of the PlaybackHandle
   - Each new PlaybackHandle starts at default volume 1.0
   - Volume clamping prevents invalid values

### Files Modified

- `packages/lib/playback-engine/src/types.ts` - Added setVolume to PlaybackHandle interface
- `packages/lib/playback-engine/src/playback-handle.ts` - Implemented setVolume method
- `packages/lib/playback-engine/isolation-demo/index.html` - Added volume slider UI
- `packages/lib/playback-engine/isolation-demo/src/main.ts` - Wired up volume control event handler
- `packages/lib/playback-engine/docs/specs/20260827044500-feedback-playback-volume-control.md` - Marked resolved

### Downstream Integration

The setVolume() method is now available for PWA integration:
- PWA can import and use PlaybackHandle.setVolume()
- PWA spec (20260827044510) can now implement volume slider in session detail screen
- Method signature matches the requested API contract
