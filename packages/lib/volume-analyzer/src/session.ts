/**
 * Session-store integration for volume analysis and snip proposal.
 */

import type {
  AnalysisResult,
  ChunkMetadata,
  ChunkVolumeProfile,
  ChunkWithBlob,
  SnipOptions,
  SnipResult,
} from './types.js';
import { analyzeChunksVolume } from './volume.js';
import { proposeSnipsFromProfile } from './snips.js';

async function loadStore() {
  return import('../../../datastore/session-store/src/index.js');
}

function profilesFromStored(volumeProfile: {
  chunkVolumes?: Array<{
    chunkId: string;
    peakDb?: number;
    avgDb?: number;
    chunkIndex?: number;
    samples?: number[];
  }>;
}): ChunkVolumeProfile[] {
  return (volumeProfile.chunkVolumes || []).map((entry, index) => ({
    chunkId: entry.chunkId,
    chunkIndex: entry.chunkIndex ?? index,
    avgDb: entry.avgDb ?? entry.peakDb ?? -100,
    peakDb: entry.peakDb ?? -100,
    quietSampleCount: 0,
    samples: Float32Array.from(entry.samples || [entry.peakDb ?? -100]),
  }));
}

export async function analyzeVolumeForSession(sessionId: string): Promise<AnalysisResult> {
  try {
    const store = await loadStore();
    const session = await store.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'session_not_found' };
    }

    const listed = await store.getChunksForSession(sessionId);
    if (listed.error) {
      return { success: false, error: listed.error };
    }
    const metas = listed.chunks || [];
    if (metas.length === 0) {
      return { success: false, error: 'no_chunks' };
    }

    const chunks: ChunkWithBlob[] = [];
    for (const meta of metas) {
      const full = await store.getChunk(meta.id);
      if (full?.blob) {
        chunks.push({
          id: full.id,
          seq: full.seq,
          startTime: full.startTime,
          endTime: full.endTime,
          duration: full.duration,
          blob: full.blob,
        });
      }
    }

    if (chunks.length === 0) {
      return { success: false, error: 'no_chunks' };
    }

    const chunkProfiles = await analyzeChunksVolume(chunks);
    const written = await store.writeVolumeProfile(sessionId, {
      chunkVolumes: chunkProfiles.map((profile) => ({
        chunkId: profile.chunkId,
        peakDb: profile.peakDb,
        avgDb: profile.avgDb,
        chunkIndex: profile.chunkIndex,
        samples: Array.from(profile.samples),
      })),
    });

    if (written.error) {
      return { success: false, error: 'session_store_write_failed' };
    }

    const avgVolume =
      chunkProfiles.reduce((sum, profile) => sum + profile.avgDb, 0) / chunkProfiles.length;
    const maxVolume = Math.max(...chunkProfiles.map((profile) => profile.peakDb));
    const sampleCount = chunkProfiles.reduce((sum, profile) => sum + profile.samples.length, 0);

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

export async function proposeSnipsForSession(
  sessionId: string,
  options?: SnipOptions
): Promise<SnipResult> {
  try {
    const store = await loadStore();
    const session = await store.getSession(sessionId);
    if (!session) {
      return { success: false, error: 'session_not_found' };
    }

    const existing = await store.getSnipsForSession(sessionId);
    if (!existing.error && existing.snips && existing.snips.length > 0) {
      return {
        success: true,
        snips: existing.snips.map((snip: any, index: number) => ({
          snipId: index,
          startTime: snip.startTime,
          endTime: snip.endTime,
          duration: snip.duration,
          startChunkIndex: snip.startChunkIndex,
          endChunkIndex: snip.endChunkIndex,
          chunkRefs: snip.chunkIds || snip.chunkRefs || [],
          confidence: snip.confidence ?? 0,
        })),
      };
    }

    const storedProfile = await store.getVolumeProfile(sessionId);
    if (!storedProfile) {
      return { success: false, error: 'volume_profile_missing' };
    }

    const listed = await store.getChunksForSession(sessionId);
    if (listed.error) {
      return { success: false, error: listed.error };
    }
    const chunks: ChunkMetadata[] = (listed.chunks || []).map((chunk: any) => ({
      id: chunk.id,
      seq: chunk.seq,
      startTime: chunk.startTime,
      endTime: chunk.endTime,
      duration: chunk.duration,
    }));

    const volumeProfile = profilesFromStored(storedProfile);
    const snips = proposeSnipsFromProfile(volumeProfile, chunks, options);

    for (const snip of snips) {
      const written = await store.writeSnip(sessionId, {
        startChunkIndex: snip.startChunkIndex,
        endChunkIndex: snip.endChunkIndex,
        startTime: snip.startTime,
        endTime: snip.endTime,
        duration: snip.duration,
        chunkIds: snip.chunkRefs,
        confidence: snip.confidence,
      });
      if (written.error) {
        return { success: false, error: 'session_store_write_failed' };
      }
    }

    return { success: true, snips };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'snip_proposal_failed',
    };
  }
}
