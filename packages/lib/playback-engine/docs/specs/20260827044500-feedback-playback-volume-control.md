Spec Status: unresolved
Spec Type: feedback
Created: 2026-08-27T04:45:00Z
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
- [ ] `PlaybackHandle.setVolume(level)` method implemented
- [ ] Volume control tested in Isolation Demo
- [ ] Volume changes apply in real-time during playback
- [ ] Demo includes volume slider that calls setVolume
- [ ] Spec updated with Resolution section documenting what shipped
