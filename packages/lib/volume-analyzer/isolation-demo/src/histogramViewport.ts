/**
 * Histogram zoom / pan math for the Isolation Demo.
 * Session time matches proposeSnipsFromProfile: flattened 100ms samples from t=0.
 */

import { SAMPLE_WINDOW_MS, type ChunkVolumeProfile } from './volumeAnalyzer';

export const HISTOGRAM_PADDING = { left: 48, right: 16, top: 28, bottom: 36 };
export const MIN_WINDOW_SECONDS = 5;
export const LONG_SESSION_SECONDS = 45;
export const DEFAULT_LONG_WINDOW_SECONDS = 30;

export function sessionDurationFromProfile(volumeProfile: ChunkVolumeProfile[]): number {
  if (volumeProfile.length === 0) {
    return 0;
  }
  return volumeProfile.reduce(
    (sum, chunk) => sum + (chunk.samples.length * SAMPLE_WINDOW_MS) / 1000,
    0
  );
}

export function defaultWindowSeconds(totalDuration: number): number {
  if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
    return MIN_WINDOW_SECONDS;
  }
  if (totalDuration > LONG_SESSION_SECONDS) {
    return Math.min(DEFAULT_LONG_WINDOW_SECONDS, totalDuration);
  }
  return totalDuration;
}

export function clampWindowSeconds(windowSeconds: number, totalDuration: number): number {
  const duration = Math.max(0, totalDuration);
  const min = Math.min(MIN_WINDOW_SECONDS, duration || MIN_WINDOW_SECONDS);
  const max = Math.max(min, duration || MIN_WINDOW_SECONDS);
  if (!Number.isFinite(windowSeconds)) {
    return max;
  }
  return Math.min(max, Math.max(min, windowSeconds));
}

export function maxViewStart(totalDuration: number, windowSeconds: number): number {
  return Math.max(0, totalDuration - windowSeconds);
}

export function clampViewStart(
  viewStart: number,
  totalDuration: number,
  windowSeconds: number
): number {
  const max = maxViewStart(totalDuration, windowSeconds);
  if (!Number.isFinite(viewStart) || viewStart < 0) {
    return 0;
  }
  return Math.min(max, viewStart);
}

export function isZoomedIn(totalDuration: number, windowSeconds: number): boolean {
  return windowSeconds < totalDuration - 0.001;
}

export function timeToX(
  time: number,
  viewStart: number,
  windowSeconds: number,
  chartWidth: number,
  paddingLeft: number = HISTOGRAM_PADDING.left
): number {
  const span = windowSeconds > 0 ? windowSeconds : 1;
  return paddingLeft + ((time - viewStart) / span) * chartWidth;
}

export function xToTime(
  x: number,
  viewStart: number,
  windowSeconds: number,
  chartWidth: number,
  paddingLeft: number = HISTOGRAM_PADDING.left
): number {
  const span = windowSeconds > 0 ? windowSeconds : 1;
  const width = chartWidth > 0 ? chartWidth : 1;
  return viewStart + ((x - paddingLeft) / width) * span;
}

/** Session-relative playhead. Pause keeps this; stop/ended should pass null. */
export function playheadSessionTime(
  snipStartTime: number,
  audioCurrentTime: number
): number {
  return snipStartTime + audioCurrentTime;
}

export function viewStartToShowTime(
  time: number,
  totalDuration: number,
  windowSeconds: number,
  marginRatio: number = 0.1
): number {
  const margin = windowSeconds * marginRatio;
  return clampViewStart(time - margin, totalDuration, windowSeconds);
}

export function scrollLeftForViewStart(
  viewStart: number,
  totalDuration: number,
  windowSeconds: number,
  clientWidth: number
): number {
  const maxStart = maxViewStart(totalDuration, windowSeconds);
  if (maxStart <= 0 || clientWidth <= 0) {
    return 0;
  }
  const scrollWidth = (totalDuration / windowSeconds) * clientWidth;
  const maxScroll = Math.max(0, scrollWidth - clientWidth);
  return (viewStart / maxStart) * maxScroll;
}

export function viewStartFromScrollLeft(
  scrollLeft: number,
  totalDuration: number,
  windowSeconds: number,
  clientWidth: number
): number {
  const maxStart = maxViewStart(totalDuration, windowSeconds);
  if (maxStart <= 0 || clientWidth <= 0) {
    return 0;
  }
  const scrollWidth = (totalDuration / windowSeconds) * clientWidth;
  const maxScroll = Math.max(0, scrollWidth - clientWidth);
  if (maxScroll <= 0) {
    return 0;
  }
  return clampViewStart((scrollLeft / maxScroll) * maxStart, totalDuration, windowSeconds);
}
