/**
 * Snip / noise-floor defaults copied from the original Web Whisper app.
 *
 * Source of truth: unlox775/web-whisper
 *   src/modules/analysis/session-analysis.ts
 *   DEFAULT_SESSION_ANALYSIS_CONFIG (commit 5b79a73)
 *
 * Original field names (ms) → this package (seconds unless noted):
 *   frameDurationMs: 50          (volume pipeline still stores 100ms peak-dB windows)
 *   minQuietDurationMs: 600  → minSilenceGapDuration 0.6s
 *   minSegmentMs: 5_000      → minSnipDuration 5s
 *   targetSegmentMs: 10_000  → targetSnipDuration 10s
 *   maxSegmentMs: 60_000     → maxSnipDuration 60s
 *   silencePaddingMs: 200    → hangoverMs 200 (cut at quiet-region center)
 *   thresholdMultiplier: 1.6
 *   quietPercentile: 0.3
 *   noisePercentile: 0.12
 *   initialIgnoreMs: 120
 *
 * Original does NOT use a fixed -40 dB silence line. It estimates a noise floor
 * from the 12th-percentile of normalized RMS frames, then only cuts at a quiet
 * gap after the running snip has reached the 10s target (never before 5s).
 */

export const SAMPLE_WINDOW_MS = 100;

export const ORIGINAL_FRAME_DURATION_MS = 50;
export const ORIGINAL_MIN_QUIET_DURATION_MS = 600;
export const ORIGINAL_MIN_SEGMENT_MS = 5_000;
export const ORIGINAL_TARGET_SEGMENT_MS = 10_000;
export const ORIGINAL_MAX_SEGMENT_MS = 60_000;
export const ORIGINAL_SILENCE_PADDING_MS = 200;
export const ORIGINAL_THRESHOLD_MULTIPLIER = 1.6;
export const ORIGINAL_QUIET_PERCENTILE = 0.3;
export const ORIGINAL_NOISE_PERCENTILE = 0.12;
export const ORIGINAL_INITIAL_IGNORE_MS = 120;
export const ORIGINAL_NORMALIZE_PEAK = 0.92;

/** Peak-dB floor used only when a caller supplies an explicit override. */
export const FALLBACK_QUIET_THRESHOLD_DB = -40;

export const DEFAULT_SNIP_OPTIONS = {
  /** Omit for adaptive noise-floor (original). Set to force a dB threshold. */
  quietThreshold: undefined as number | undefined,
  minSnipDuration: ORIGINAL_MIN_SEGMENT_MS / 1000,
  targetSnipDuration: ORIGINAL_TARGET_SEGMENT_MS / 1000,
  maxSnipDuration: ORIGINAL_MAX_SEGMENT_MS / 1000,
  minSilenceGapDuration: ORIGINAL_MIN_QUIET_DURATION_MS / 1000,
  hangoverMs: ORIGINAL_SILENCE_PADDING_MS,
  thresholdMultiplier: ORIGINAL_THRESHOLD_MULTIPLIER,
  quietPercentile: ORIGINAL_QUIET_PERCENTILE,
  noisePercentile: ORIGINAL_NOISE_PERCENTILE,
  initialIgnoreMs: ORIGINAL_INITIAL_IGNORE_MS,
} as const;

export type DefaultSnipOptions = typeof DEFAULT_SNIP_OPTIONS;
