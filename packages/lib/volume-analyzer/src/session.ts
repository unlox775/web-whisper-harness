/**
 * Session-store integration for volume analysis and snip proposal.
 */

import type {
  AnalysisResult,
  ChunkMetadata,
  ChunkVolumeProfile,
  ChunkWithBlob,
  Snip,
  SnipOptions,
  SnipResult,
} from './types.js';
import { analyzeChunksVolume } from './volume.js';
import { proposeSnipsFromProfile } from './snips.js';

async function loadStore() {
  // session-store is JS without types; the PWA Vite alias resolves this at bundle time.
  // @ts-expect-error -- no declaration file for session-store
  return import('../../../datastore/session-store/src/index.js');
}

const SNIP_START_EPSILON = 0.05;

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

function storedFromProfiles(profiles: ChunkVolumeProfile[]) {
  return {
    chunkVolumes: [...profiles]
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .map((profile) => ({
        chunkId: profile.chunkId,
        peakDb: profile.peakDb,
        avgDb: profile.avgDb,
        chunkIndex: profile.chunkIndex,
        samples: Array.from(profile.samples),
      })),
  };
}

function summaryFromProfiles(profiles: ChunkVolumeProfile[]): AnalysisResult {
  if (profiles.length === 0) {
    return { success: false, error: 'no_chunks' };
  }
  const avgVolume =
    profiles.reduce((sum, profile) => sum + profile.avgDb, 0) / profiles.length;
  const maxVolume = Math.max(...profiles.map((profile) => profile.peakDb));
  const sampleCount = profiles.reduce((sum, profile) => sum + profile.samples.length, 0);
  return {
    success: true,
    profileSummary: {
      chunkCount: profiles.length,
      avgVolume,
      maxVolume,
      sampleCount,
    },
  };
}

function mapStoredSnips(snips: any[]): Snip[] {
  return snips.map((snip: any, index: number) => ({
    snipId: index,
    startTime: snip.startTime,
    endTime: snip.endTime,
    duration: snip.duration,
    startChunkIndex: snip.startChunkIndex,
    endChunkIndex: snip.endChunkIndex,
    chunkRefs: snip.chunkIds || snip.chunkRefs || [],
    confidence: snip.confidence ?? 0,
  }));
}

/**
 * Decode new chunks only and merge into the stored volume profile.
 * Re-running on a growing session does not re-decode already-profiled chunks.
 */
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

    const storedProfile = await store.getVolumeProfile(sessionId);
    const existingProfiles = storedProfile ? profilesFromStored(storedProfile) : [];
    const knownIds = new Set(existingProfiles.map((profile) => profile.chunkId));

    const newChunks: ChunkWithBlob[] = [];
    for (const meta of metas) {
      if (knownIds.has(meta.id)) continue;
      const full = await store.getChunk(meta.id);
      if (full?.blob) {
        newChunks.push({
          id: full.id,
          seq: full.seq,
          startTime: full.startTime,
          endTime: full.endTime,
          duration: full.duration,
          blob: full.blob,
        });
      }
    }

    let chunkProfiles = existingProfiles;
    if (newChunks.length > 0) {
      const added = await analyzeChunksVolume(newChunks);
      chunkProfiles = [...existingProfiles, ...added].sort(
        (a, b) => a.chunkIndex - b.chunkIndex
      );
      const written = await store.writeVolumeProfile(sessionId, storedFromProfiles(chunkProfiles));
      if (written.error) {
        return { success: false, error: 'session_store_write_failed' };
      }
    } else if (!storedProfile) {
      return { success: false, error: 'no_chunks' };
    }

    return summaryFromProfiles(chunkProfiles);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'chunk_decode_failed',
    };
  }
}

/**
 * Propose snips for a (possibly still-growing) session.
 *
 * Already-persisted snips are frozen. Only audio after the last snip end is
 * proposed. Pass `{ includeTrailing: false }` while recording so the in-progress
 * tail is not written until a quiet-gap cut closes it (or until Stop).
 */
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

    const existingResult = await store.getSnipsForSession(sessionId);
    const existing = existingResult.error ? [] : existingResult.snips || [];
    const lastEnd =
      existing.length > 0
        ? Math.max(...existing.map((snip: { endTime: number }) => snip.endTime))
        : 0;

    const volumeProfile = profilesFromStored(storedProfile);
    const proposed = proposeSnipsFromProfile(volumeProfile, chunks, {
      ...options,
      windowStartTime: lastEnd,
    });

    for (const snip of proposed) {
      const alreadyHave = existing.some(
        (stored: { startTime: number }) =>
          Math.abs(stored.startTime - snip.startTime) < SNIP_START_EPSILON
      );
      if (alreadyHave || snip.startTime < lastEnd - SNIP_START_EPSILON) {
        continue;
      }
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

    const next = await store.getSnipsForSession(sessionId);
    const snips = next.error ? [...mapStoredSnips(existing), ...proposed] : mapStoredSnips(next.snips || []);
    return { success: true, snips };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'snip_proposal_failed',
    };
  }
}
