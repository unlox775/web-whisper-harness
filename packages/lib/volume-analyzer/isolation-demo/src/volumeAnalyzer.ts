/**
 * Re-export core volume-analyzer functions (not session-store integration)
 * so the isolation demo exercises the same snip algorithm the PWA bundles.
 */

export { analyzeChunksVolume } from '../../src/volume.ts';
export {
  proposeSnipsFromProfile,
  computeAdaptiveQuietThresholdDb,
  resolveSnipOptions,
} from '../../src/snips.ts';
export { DEFAULT_SNIP_OPTIONS, SAMPLE_WINDOW_MS } from '../../src/defaults.ts';

export type {
  ChunkMetadata,
  ChunkWithBlob,
  ChunkVolumeProfile,
  Snip,
  SnipOptions,
} from '../../src/types.ts';
