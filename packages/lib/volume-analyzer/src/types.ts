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
  samples: Float32Array; // One sample per 100ms
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

/** Options for snip proposal */
export interface SnipOptions {
  quietThreshold?: number; // dB threshold (default -40)
  minSnipDuration?: number; // seconds (default 5)
  maxSnipDuration?: number; // seconds (default 60)
  minSilenceGapDuration?: number; // seconds (default 1.0)
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
