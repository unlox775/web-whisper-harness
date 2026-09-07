/**
 * Re-export volume-analyzer public surfaces the Isolation Demo operates.
 * Live path uses analyzeVolumeIncremental / proposeSnipsIncremental (same
 * helpers analyzeVolumeForSession / proposeSnipsForSession call).
 */

export { analyzeChunksVolume } from '../../src/volume.ts';
export { analyzeVolume, proposeSnips } from '../../src/index.ts';
export {
  analyzeVolumeForSession,
  proposeSnipsForSession,
} from '../../src/session.ts';
export {
  SNIP_START_EPSILON,
  analyzeVolumeIncremental,
  chunkProfileHasSamples,
  mergeVolumeProfiles,
  profilesFromStored,
  proposeSnipsIncremental,
  storedFromProfiles,
  storedProfileHasPerChunkSamples,
  windowSamplesFromProfile,
} from '../../src/incremental.ts';
export {
  proposeSnipsFromProfile,
  computeAdaptiveQuietThresholdDb,
  detectSilenceGaps,
  resolveSnipOptions,
} from '../../src/snips.ts';
export { DEFAULT_SNIP_OPTIONS, SAMPLE_WINDOW_MS } from '../../src/defaults.ts';
export {
  CONTIGUOUS_REPEAT_HEADLINE,
  NGRAM_SKIPPED_NO_TRANSCRIPTS,
  flaggedBoundaryTimes,
  formatSnipRange,
  scanSnipBoundaries,
} from '../../src/boundaryScan.ts';

export type {
  AnalysisResult,
  ChunkMetadata,
  ChunkWithBlob,
  ChunkVolumeProfile,
  IncrementalProposeResult,
  IncrementalVolumeResult,
  Snip,
  SnipOptions,
  SnipResult,
} from '../../src/types.ts';
export type {
  BoundaryScanResult,
  FlaggedBoundaryTime,
} from '../../src/boundaryScan.ts';
