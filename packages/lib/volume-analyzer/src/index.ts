/**
 * Volume Analyzer
 * Main API exports
 */

export * from './types.js';
export * from './volume.js';
export * from './snips.js';
export { analyzeVolumeForSession, proposeSnipsForSession } from './session.js';

import type {
  ChunkWithBlob,
  ChunkMetadata,
  ChunkVolumeProfile,
  VolumeProfile,
  AnalysisResult,
  SnipResult,
  SnipOptions,
} from './types.js';
import { analyzeChunksVolume } from './volume.js';
import { proposeSnipsFromProfile } from './snips.js';

/**
 * Analyze volume for chunks (standalone function for demo/testing)
 */
export async function analyzeVolume(chunks: ChunkWithBlob[]): Promise<AnalysisResult> {
  if (!chunks || chunks.length === 0) {
    return {
      success: false,
      error: 'no_chunks',
    };
  }

  try {
    const chunkProfiles = await analyzeChunksVolume(chunks);
    const volumeProfile: VolumeProfile = {
      chunkProfiles,
      computedAt: Date.now(),
    };

    // Compute summary statistics
    const avgVolume = chunkProfiles.reduce((sum, p) => sum + p.avgDb, 0) / chunkProfiles.length;
    const maxVolume = Math.max(...chunkProfiles.map(p => p.peakDb));
    const sampleCount = chunkProfiles.reduce((sum, p) => sum + p.samples.length, 0);

    return {
      success: true,
      profileSummary: {
        chunkCount: chunks.length,
        avgVolume,
        maxVolume,
        sampleCount,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'chunk_decode_failed',
    };
  }
}

/**
 * Propose snips from volume profile (standalone function for demo/testing)
 */
export function proposeSnips(
  chunks: ChunkMetadata[],
  volumeProfile: ChunkVolumeProfile[],
  options?: SnipOptions
): SnipResult {
  if (!volumeProfile || volumeProfile.length === 0) {
    return {
      success: false,
      error: 'no_volume_profile',
    };
  }

  try {
    const snips = proposeSnipsFromProfile(volumeProfile, chunks, options);
    
    return {
      success: true,
      snips,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'snip_proposal_failed',
    };
  }
}
