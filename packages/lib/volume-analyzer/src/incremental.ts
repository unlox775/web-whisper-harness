/**
 * Shared incremental volume + snip path used by analyzeVolumeForSession /
 * proposeSnipsForSession and the Isolation Demo live path.
 *
 * Freeze + windowStartTime live here — not in Isolation Demo App.tsx.
 * Cut math stays in proposeSnipsFromProfile (unchanged).
 */

import { SAMPLE_WINDOW_MS } from './defaults.js';
import { proposeSnipsFromProfile, computeAdaptiveQuietThresholdDb, detectSilenceGaps } from './snips.js';
import { analyzeChunksVolume } from './volume.js';
import type {
  ChunkMetadata,
  ChunkVolumeProfile,
  ChunkWithBlob,
  IncrementalProposeResult,
  IncrementalVolumeResult,
  Snip,
  SnipOptions,
  StoredVolumeProfile,
} from './types.js';

/** Same epsilon proposeSnipsForSession uses to skip already-stored starts. */
export const SNIP_START_EPSILON = 0.05;

export function profilesFromStored(volumeProfile: StoredVolumeProfile | null | undefined): ChunkVolumeProfile[] {
  return (volumeProfile?.chunkVolumes || []).map((entry, index) => ({
    chunkId: entry.chunkId,
    chunkIndex: entry.chunkIndex ?? index,
    avgDb: entry.avgDb ?? entry.peakDb ?? -100,
    peakDb: entry.peakDb ?? -100,
    quietSampleCount: 0,
    samples: Float32Array.from(entry.samples || [entry.peakDb ?? -100]),
  }));
}

export function storedFromProfiles(profiles: ChunkVolumeProfile[]): StoredVolumeProfile {
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

export function chunkProfileHasSamples(profile: { samples?: ArrayLike<number> } | null | undefined): boolean {
  return Boolean(profile?.samples && profile.samples.length > 0);
}

export function storedProfileHasPerChunkSamples(
  volumeProfile: StoredVolumeProfile | null | undefined
): boolean {
  const rows = volumeProfile?.chunkVolumes || [];
  if (rows.length === 0) return false;
  return rows.every((row) => Array.isArray(row.samples) && row.samples.length > 0);
}

export function mergeVolumeProfiles(
  existingProfiles: ChunkVolumeProfile[],
  addedProfiles: ChunkVolumeProfile[]
): ChunkVolumeProfile[] {
  const byId = new Map(existingProfiles.map((profile) => [profile.chunkId, profile]));
  for (const added of addedProfiles) {
    byId.set(added.chunkId, added);
  }
  return [...byId.values()].sort((a, b) => a.chunkIndex - b.chunkIndex);
}

/**
 * Decode only new chunks and merge into the existing profile.
 * Optional storedProfile (with samples) skips decode for that chunk — archive replay.
 */
export async function analyzeVolumeIncremental(
  existingProfiles: ChunkVolumeProfile[],
  incoming: Array<{
    chunk: ChunkWithBlob;
    storedProfile?: ChunkVolumeProfile | null;
  }>
): Promise<IncrementalVolumeResult> {
  if (incoming.length === 0) {
    return {
      mergedProfiles: existingProfiles,
      newChunksDecoded: 0,
      profileReused: existingProfiles.length,
    };
  }

  const toDecode: ChunkWithBlob[] = [];
  const reused: ChunkVolumeProfile[] = [];

  for (const item of incoming) {
    if (item.storedProfile && chunkProfileHasSamples(item.storedProfile)) {
      reused.push(item.storedProfile);
    } else {
      toDecode.push(item.chunk);
    }
  }

  let decoded: ChunkVolumeProfile[] = [];
  if (toDecode.length > 0) {
    decoded = await analyzeChunksVolume(toDecode);
  }

  return {
    mergedProfiles: mergeVolumeProfiles(existingProfiles, [...reused, ...decoded]),
    newChunksDecoded: decoded.length,
    profileReused: reused.length,
  };
}

function flattenSampleDbs(volumeProfile: ChunkVolumeProfile[]): Array<{ time: number; db: number }> {
  const flat: Array<{ time: number; db: number }> = [];
  let currentTime = 0;
  for (const chunk of volumeProfile) {
    for (let i = 0; i < chunk.samples.length; i++) {
      flat.push({
        time: currentTime + (i * SAMPLE_WINDOW_MS) / 1000,
        db: chunk.samples[i],
      });
    }
    currentTime += (chunk.samples.length * SAMPLE_WINDOW_MS) / 1000;
  }
  return flat;
}

export function windowSamplesFromProfile(
  volumeProfile: ChunkVolumeProfile[],
  windowStartTime: number
): number[] {
  const start = Math.max(0, windowStartTime);
  return flattenSampleDbs(volumeProfile)
    .filter((sample) => sample.time >= start - 1e-6)
    .map((sample) => sample.db);
}

function lastFrozenEnd(frozenSnips: Snip[]): number {
  if (frozenSnips.length === 0) return 0;
  return Math.max(...frozenSnips.map((snip) => snip.endTime));
}

function isAlreadyFrozen(snip: Snip, frozenSnips: Snip[], lastEnd: number): boolean {
  const alreadyHave = frozenSnips.some(
    (stored) => Math.abs(stored.startTime - snip.startTime) < SNIP_START_EPSILON
  );
  return alreadyHave || snip.startTime < lastEnd - SNIP_START_EPSILON;
}

function sessionEndTime(chunks: ChunkMetadata[], volumeProfile: ChunkVolumeProfile[]): number {
  if (chunks.length > 0) {
    return Math.max(...chunks.map((chunk) => chunk.endTime));
  }
  return volumeProfile.reduce(
    (sum, chunk) => sum + (chunk.samples.length * SAMPLE_WINDOW_MS) / 1000,
    0
  );
}

/**
 * Incremental propose matching proposeSnipsForSession:
 * freeze saved snips, windowStartTime = lastEnd, adaptive floor on that window.
 */
export function proposeSnipsIncremental(
  volumeProfile: ChunkVolumeProfile[],
  chunks: ChunkMetadata[],
  frozenSnips: Snip[],
  options: SnipOptions = {}
): IncrementalProposeResult {
  const frozen = [...frozenSnips].sort((a, b) => a.startTime - b.startTime);
  const windowStartTime = lastFrozenEnd(frozen);
  const includeTrailing = options.includeTrailing !== false;
  const windowDbs = windowSamplesFromProfile(volumeProfile, windowStartTime);
  const adaptiveFloorDb =
    options.quietThreshold === undefined
      ? windowDbs.length > 0
        ? computeAdaptiveQuietThresholdDb(windowDbs)
        : null
      : options.quietThreshold;
  const floorForGaps = adaptiveFloorDb ?? options.quietThreshold ?? -40;
  const gapCount = detectSilenceGaps(
    volumeProfile,
    floorForGaps,
    options.minSilenceGapDuration ?? 0.6
  ).filter((gap) => gap.startTime >= windowStartTime - 1e-6).length;

  const proposedAll = proposeSnipsFromProfile(volumeProfile, chunks, {
    ...options,
    windowStartTime,
    includeTrailing: true,
  });
  const proposedClosed = proposeSnipsFromProfile(volumeProfile, chunks, {
    ...options,
    windowStartTime,
    includeTrailing: false,
  });

  const newlyClosed = proposedClosed.filter((snip) => !isAlreadyFrozen(snip, frozen, windowStartTime));
  const trailingCandidate = proposedAll
    .filter((snip) => !isAlreadyFrozen(snip, frozen, windowStartTime))
    .filter(
      (snip) =>
        !newlyClosed.some((closed) => Math.abs(closed.startTime - snip.startTime) < SNIP_START_EPSILON)
    )
    .at(-1);

  const audioEnd = sessionEndTime(chunks, volumeProfile);
  const trailing =
    trailingCandidate && Math.abs(trailingCandidate.endTime - audioEnd) <= SAMPLE_WINDOW_MS / 1000
      ? trailingCandidate
      : trailingCandidate ?? null;

  const committedThisTick = includeTrailing
    ? [...newlyClosed, ...(trailing ? [trailing] : [])]
    : newlyClosed;

  const allCommitted = [...frozen, ...committedThisTick].map((snip, index) => ({
    ...snip,
    snipId: index,
  }));

  return {
    frozen,
    newlyClosed,
    trailing: includeTrailing ? null : trailing,
    committedThisTick,
    allCommitted,
    windowStartTime,
    adaptiveFloorDb,
    windowSampleCount: windowDbs.length,
    gapCount,
    includeTrailing,
  };
}
