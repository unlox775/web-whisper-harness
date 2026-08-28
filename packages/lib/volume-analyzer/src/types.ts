/**
 * Volume Analyzer Types
 *
 * Core types for volume profile computation and snip proposal.
 */

/** Audio chunk metadata */
export interface ChunkMetadata {
  id: string;
  seq: number;
  startTime: number;
  endTime: number;
  duration: number;
}

/** Audio chunk with blob data */
export interface ChunkWithBlob extends ChunkMetadata {
  blob: Blob;
}

/** Volume profile for a single chunk */
export interface ChunkVolumeProfile {
  chunkId: string;
  chunkIndex: number;
  avgDb: number;
  peakDb: number;
  quietSampleCount: number;
  samples: Float32Array; // One sample per 100ms (peak dB)
}

/** Complete volume profile for a session */
export interface VolumeProfile {
  chunkProfiles: ChunkVolumeProfile[];
  computedAt: number;
}

/** Proposed snip (speech segment) */
export interface Snip {
  snipId: number;
  startTime: number;
  endTime: number;
  duration: number;
  startChunkIndex: number;
  endChunkIndex: number;
  chunkRefs: string[]; // Chunk IDs that overlap this snip
  confidence: number; // 0.0-1.0, ratio of loud samples
}

/**
 * Options for snip proposal.
 *
 * Defaults match original web-whisper DEFAULT_SESSION_ANALYSIS_CONFIG.
 * Omit quietThreshold to use the adaptive noise-floor (percentile of volume).
 */
export interface SnipOptions {
  /** dB threshold override. When omitted, noise floor is estimated from the profile. */
  quietThreshold?: number;
  /** Seconds. Original minSegmentMs = 5000. */
  minSnipDuration?: number;
  /** Seconds. Original targetSegmentMs = 10000. Split only after this, at a quiet gap. */
  targetSnipDuration?: number;
  /** Seconds. Original maxSegmentMs = 60000. */
  maxSnipDuration?: number;
  /** Seconds. Original minQuietDurationMs = 600. */
  minSilenceGapDuration?: number;
  /** Milliseconds of pause kept around a cut (original silencePaddingMs = 200). */
  hangoverMs?: number;
  /** Original thresholdMultiplier = 1.6 */
  thresholdMultiplier?: number;
  /** Original quietPercentile = 0.3 */
  quietPercentile?: number;
  /** Original noisePercentile = 0.12 */
  noisePercentile?: number;
  /** Milliseconds ignored at the start before quiet detection (original 120). */
  initialIgnoreMs?: number;
}

/** Fully resolved snip options (adaptive threshold still optional). */
export interface ResolvedSnipOptions {
  quietThreshold?: number;
  minSnipDuration: number;
  targetSnipDuration: number;
  maxSnipDuration: number;
  minSilenceGapDuration: number;
  hangoverMs: number;
  thresholdMultiplier: number;
  quietPercentile: number;
  noisePercentile: number;
  initialIgnoreMs: number;
}

/** Analysis result */
export interface AnalysisResult {
  success: boolean;
  profileSummary?: {
    chunkCount: number;
    avgVolume: number;
    maxVolume: number;
    sampleCount: number;
  };
  error?: string;
}

/** Snip proposal result */
export interface SnipResult {
  success: boolean;
  snips?: Snip[];
  error?: string;
}

/** Silence gap detection result */
export interface SilenceGap {
  startTime: number;
  endTime: number;
  duration: number;
}
