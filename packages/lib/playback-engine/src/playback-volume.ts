/**
 * iOS Safari ignores `HTMLAudioElement.volume`: the property updates, but
 * audible output stays at 1.0. This package routes playback through a
 * Web Audio GainNode so `setVolume(0..1)` changes loudness on iPhone and
 * desktop Chrome.
 */

export const DEFAULT_PLAYBACK_VOLUME = 1;

export type VolumeGain = { value: number };
export type VolumeElement = { volume: number };

export function clampPlaybackVolume(level: number): number {
  if (typeof level !== 'number' || Number.isNaN(level)) {
    return 0;
  }
  return Math.max(0, Math.min(1, level));
}

/**
 * Write clamped volume to the GainNode when the graph is live.
 * Fall back to `HTMLAudioElement.volume` only when the graph is unavailable.
 * Do not drive both at the requested level — Chrome's MediaElementSource
 * still honors `element.volume`, which would attenuate twice.
 */
export function applyPlaybackVolume(
  level: number,
  targets: {
    gain?: VolumeGain | null;
    element?: VolumeElement | null;
    graphReady: boolean;
  }
): number {
  const clamped = clampPlaybackVolume(level);
  if (targets.graphReady && targets.gain) {
    targets.gain.value = clamped;
    if (targets.element) {
      targets.element.volume = DEFAULT_PLAYBACK_VOLUME;
    }
  } else if (targets.element) {
    targets.element.volume = clamped;
  }
  return clamped;
}

export function getAudioContextConstructor(): (new () => AudioContext) | undefined {
  const root = globalThis as typeof globalThis & {
    AudioContext?: new () => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  };
  return root.AudioContext || root.webkitAudioContext;
}
