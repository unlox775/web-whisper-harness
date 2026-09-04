/** Volume-analyzer sample window used when playback duration is unknown. */
export const SAMPLE_WINDOW_S = 0.1;

/**
 * Shared x-axis duration for waveform, snip markers, and the playhead.
 * Prefer session/playback duration so snip startTimes and currentTime share one domain.
 */
export function histogramPlotDuration(sampleCount: number, duration?: number | null): number {
  if (typeof duration === 'number' && Number.isFinite(duration) && duration > 0) {
    return duration;
  }
  return Math.max(0, sampleCount) * SAMPLE_WINDOW_S;
}

/** True when session playback has a known position (playing or paused). Idle → false. */
export function shouldShowPlayhead(currentTime: number | null | undefined): boolean {
  return currentTime != null && Number.isFinite(currentTime);
}

/** Clamp a time onto the plot domain and return 0–1 for canvas mapping. */
export function timeToFraction(time: number, plotDuration: number): number {
  if (!(plotDuration > 0) || !Number.isFinite(time)) return 0;
  return Math.max(0, Math.min(1, time / plotDuration));
}
