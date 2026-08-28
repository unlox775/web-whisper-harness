/**
 * Snip Proposal
 *
 * Quiet-gap splits gated by original web-whisper target length, using an
 * adaptive noise floor (percentile of volume) unless a dB override is given.
 *
 * Algorithm copied from unlox775/web-whisper
 *   src/modules/analysis/session-analysis.ts
 *   detectQuietRegions + proposeSegments
 */

import { DEFAULT_SNIP_OPTIONS, ORIGINAL_NORMALIZE_PEAK, SAMPLE_WINDOW_MS } from './defaults.js';
import type {
  ChunkMetadata,
  ChunkVolumeProfile,
  ResolvedSnipOptions,
  SilenceGap,
  Snip,
  SnipOptions,
} from './types.js';

const LINEAR_EPSILON = 1e-5;
/** If peak is less than this multiple of the noise floor, treat as no speech. */
const MIN_SPEECH_HEADROOM = 4;

interface FlatSample {
  time: number;
  db: number;
  linear: number;
}

export function resolveSnipOptions(options: SnipOptions = {}): ResolvedSnipOptions {
  return {
    quietThreshold: options.quietThreshold,
    minSnipDuration: options.minSnipDuration ?? DEFAULT_SNIP_OPTIONS.minSnipDuration,
    targetSnipDuration: options.targetSnipDuration ?? DEFAULT_SNIP_OPTIONS.targetSnipDuration,
    maxSnipDuration: options.maxSnipDuration ?? DEFAULT_SNIP_OPTIONS.maxSnipDuration,
    minSilenceGapDuration: options.minSilenceGapDuration ?? DEFAULT_SNIP_OPTIONS.minSilenceGapDuration,
    hangoverMs: options.hangoverMs ?? DEFAULT_SNIP_OPTIONS.hangoverMs,
    thresholdMultiplier: options.thresholdMultiplier ?? DEFAULT_SNIP_OPTIONS.thresholdMultiplier,
    quietPercentile: options.quietPercentile ?? DEFAULT_SNIP_OPTIONS.quietPercentile,
    noisePercentile: options.noisePercentile ?? DEFAULT_SNIP_OPTIONS.noisePercentile,
    initialIgnoreMs: options.initialIgnoreMs ?? DEFAULT_SNIP_OPTIONS.initialIgnoreMs,
  };
}

export function dbToLinear(db: number): number {
  if (!Number.isFinite(db) || db <= -100) {
    return 0;
  }
  return Math.pow(10, db / 20);
}

export function linearToDb(linear: number): number {
  if (!Number.isFinite(linear) || linear < LINEAR_EPSILON) {
    return -100;
  }
  return 20 * Math.log10(linear);
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const clamped = Math.min(Math.max(fraction, 0), 1);
  const index = clamped === 1 ? sorted.length - 1 : Math.floor(clamped * sorted.length);
  return sorted[index];
}

function flattenSamples(volumeProfile: ChunkVolumeProfile[]): FlatSample[] {
  const flat: FlatSample[] = [];
  let currentTime = 0;
  for (const chunk of volumeProfile) {
    for (let i = 0; i < chunk.samples.length; i++) {
      const db = chunk.samples[i];
      flat.push({
        time: currentTime + (i * SAMPLE_WINDOW_MS) / 1000,
        db,
        linear: dbToLinear(db),
      });
    }
    currentTime += (chunk.samples.length * SAMPLE_WINDOW_MS) / 1000;
  }
  return flat;
}

/**
 * Adaptive quiet threshold in dB, matching original:
 *   noiseFloor = percentile(normalized, 0.12)
 *   quietBand  = percentile(normalized, 0.3)
 *   threshold  = min(max(noiseFloor * 1.6, (noiseFloor + quietBand) / 2), peak * 0.7)
 */
export function computeAdaptiveQuietThresholdDb(
  samples: ArrayLike<number>,
  options: Pick<ResolvedSnipOptions, 'noisePercentile' | 'quietPercentile' | 'thresholdMultiplier'> = resolveSnipOptions()
): number {
  const linear = Array.from(samples, (db) => dbToLinear(db));
  const peak = linear.reduce((max, value) => Math.max(max, value), 0);
  const scaling = peak > 0 ? ORIGINAL_NORMALIZE_PEAK / peak : 1;
  const normalized = linear.map((value) => Math.min(value * scaling, 1));
  const noiseFloor = percentile(normalized, options.noisePercentile);
  const quietBand = percentile(normalized, options.quietPercentile);
  const candidate = Math.max(
    noiseFloor * options.thresholdMultiplier,
    (noiseFloor + quietBand) / 2
  );
  const normalizedPeak = peak * scaling;
  const thresholdNormalized = Math.min(candidate, normalizedPeak * 0.7);
  const thresholdLinear = scaling > 0 ? thresholdNormalized / scaling : 0;
  return linearToDb(thresholdLinear);
}

function totalDurationSeconds(chunks: ChunkMetadata[], volumeProfile: ChunkVolumeProfile[]): number {
  if (chunks.length > 0) {
    return chunks.reduce((sum, chunk) => sum + chunk.duration, 0);
  }
  return volumeProfile.reduce(
    (sum, chunk) => sum + (chunk.samples.length * SAMPLE_WINDOW_MS) / 1000,
    0
  );
}

/**
 * Detect silence gaps in volume profile (kept for callers / histogram overlays).
 */
export function detectSilenceGaps(
  volumeProfile: ChunkVolumeProfile[],
  quietThreshold: number,
  minGapDuration: number
): SilenceGap[] {
  const gaps: SilenceGap[] = [];
  const minGapSamples = Math.ceil(minGapDuration * (1000 / SAMPLE_WINDOW_MS));

  let quietStart: number | null = null;
  let quietSampleCount = 0;
  let currentTime = 0;

  for (const chunk of volumeProfile) {
    for (let i = 0; i < chunk.samples.length; i++) {
      const sampleDb = chunk.samples[i];
      const sampleTime = currentTime + (i * SAMPLE_WINDOW_MS) / 1000;

      if (sampleDb < quietThreshold) {
        if (quietStart === null) {
          quietStart = sampleTime;
          quietSampleCount = 1;
        } else {
          quietSampleCount++;
        }
      } else {
        if (quietStart !== null && quietSampleCount >= minGapSamples) {
          gaps.push({
            startTime: quietStart,
            endTime: sampleTime,
            duration: sampleTime - quietStart,
          });
        }
        quietStart = null;
        quietSampleCount = 0;
      }
    }

    currentTime += (chunk.samples.length * SAMPLE_WINDOW_MS) / 1000;
  }

  if (quietStart !== null && quietSampleCount >= minGapSamples) {
    gaps.push({
      startTime: quietStart,
      endTime: currentTime,
      duration: currentTime - quietStart,
    });
  }

  return gaps;
}

function detectQuietRegions(
  samples: FlatSample[],
  thresholdDb: number,
  minQuietDuration: number,
  initialIgnoreMs: number
): SilenceGap[] {
  const quietRegions: SilenceGap[] = [];
  let regionStart: number | null = null;
  let hasSeenLoudFrame = false;
  const initialIgnoreSec = initialIgnoreMs / 1000;
  const sampleDuration = SAMPLE_WINDOW_MS / 1000;

  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index];
    const meetsTimeGate = sample.time >= initialIgnoreSec;
    if (meetsTimeGate && sample.db > thresholdDb) {
      hasSeenLoudFrame = true;
    }
    const isQuiet = hasSeenLoudFrame && meetsTimeGate && sample.db <= thresholdDb;

    if (isQuiet) {
      if (regionStart === null) {
        regionStart = index;
      }
    }

    const isLast = index === samples.length - 1;
    const isRegionEnding = (!isQuiet && regionStart !== null) || (isLast && isQuiet && regionStart !== null);
    if (isRegionEnding && regionStart !== null) {
      const inclusiveEnd = isQuiet ? index : index - 1;
      const startTime = samples[regionStart].time;
      const endTime = samples[inclusiveEnd].time + sampleDuration;
      const duration = endTime - startTime;
      if (duration >= minQuietDuration) {
        quietRegions.push({ startTime, endTime, duration });
      }
      regionStart = null;
    }
  }

  return quietRegions;
}

/**
 * Original proposeSegments: skip quiet gaps until minSegment, then cut only once
 * the running snip has reached targetSegment (or maxSegment), at the quiet center.
 */
function proposeSegmentsFromQuietRegions(
  quietRegions: SilenceGap[],
  totalDuration: number,
  config: ResolvedSnipOptions
): Array<{ startTime: number; endTime: number }> {
  const cuts: number[] = [];
  let lastCut = 0;

  for (const region of quietRegions) {
    const center = (region.startTime + region.endTime) / 2;
    const segmentDuration = center - lastCut;
    if (segmentDuration < config.minSnipDuration) {
      continue;
    }
    if (segmentDuration >= config.targetSnipDuration || segmentDuration >= config.maxSnipDuration) {
      cuts.push(center);
      lastCut = center;
    }
  }

  const segments: Array<{ startTime: number; endTime: number }> = [];
  let currentStart = 0;
  for (const cut of cuts) {
    const end = Math.min(cut, totalDuration);
    if (end > currentStart) {
      segments.push({ startTime: currentStart, endTime: end });
    }
    currentStart = cut;
  }
  if (currentStart < totalDuration) {
    segments.push({ startTime: currentStart, endTime: totalDuration });
  }
  return segments;
}

function chunkRefsForRange(
  chunks: ChunkMetadata[],
  startTime: number,
  endTime: number
): { chunkRefs: string[]; startChunkIndex: number; endChunkIndex: number } {
  const overlapping = chunks.filter(
    (chunk) => chunk.startTime < endTime && chunk.endTime > startTime
  );
  if (overlapping.length === 0) {
    return { chunkRefs: [], startChunkIndex: 0, endChunkIndex: 0 };
  }
  return {
    chunkRefs: overlapping.map((chunk) => chunk.id),
    startChunkIndex: overlapping[0].seq,
    endChunkIndex: overlapping[overlapping.length - 1].seq,
  };
}

function computeRegionConfidence(
  region: { startTime: number; endTime: number },
  volumeProfile: ChunkVolumeProfile[],
  quietThreshold: number
): number {
  let totalSamples = 0;
  let loudSamples = 0;
  let currentTime = 0;

  for (const chunk of volumeProfile) {
    const chunkDuration = (chunk.samples.length * SAMPLE_WINDOW_MS) / 1000;

    for (let i = 0; i < chunk.samples.length; i++) {
      const sampleTime = currentTime + (i * SAMPLE_WINDOW_MS) / 1000;
      if (sampleTime >= region.startTime && sampleTime < region.endTime) {
        totalSamples++;
        if (chunk.samples[i] >= quietThreshold) {
          loudSamples++;
        }
      }
    }

    currentTime += chunkDuration;
  }

  return totalSamples > 0 ? loudSamples / totalSamples : 0;
}

function createSnipsFromRegions(
  regions: { startTime: number; endTime: number }[],
  chunks: ChunkMetadata[],
  volumeProfile: ChunkVolumeProfile[],
  quietThreshold: number
): Snip[] {
  const snips: Snip[] = [];

  for (const region of regions) {
    if (region.endTime <= region.startTime) {
      continue;
    }
    const refs = chunkRefsForRange(chunks, region.startTime, region.endTime);
    snips.push({
      snipId: snips.length,
      startTime: region.startTime,
      endTime: region.endTime,
      duration: region.endTime - region.startTime,
      startChunkIndex: refs.startChunkIndex,
      endChunkIndex: refs.endChunkIndex,
      chunkRefs: refs.chunkRefs,
      confidence: computeRegionConfidence(region, volumeProfile, quietThreshold),
    });
  }

  return snips;
}

function peakLinear(samples: FlatSample[]): number {
  return samples.reduce((max, sample) => Math.max(max, sample.linear), 0);
}

function noiseFloorLinear(
  samples: FlatSample[],
  noisePercentile: number
): number {
  return percentile(samples.map((sample) => sample.linear), noisePercentile);
}

/**
 * Propose snips from volume profile using original quiet-gap + target-length gating.
 */
export function proposeSnipsFromProfile(
  volumeProfile: ChunkVolumeProfile[],
  chunks: ChunkMetadata[],
  options: SnipOptions = {}
): Snip[] {
  const resolved = resolveSnipOptions(options);
  if (!volumeProfile || volumeProfile.length === 0) {
    return [];
  }

  const samples = flattenSamples(volumeProfile);
  if (samples.length === 0) {
    return [];
  }

  const thresholdDb =
    resolved.quietThreshold ??
    computeAdaptiveQuietThresholdDb(
      samples.map((sample) => sample.db),
      resolved
    );

  const peak = peakLinear(samples);
  const floor = noiseFloorLinear(samples, resolved.noisePercentile);
  const allBelowThreshold = samples.every((sample) => sample.db < thresholdDb);
  // Uniform near-silence (all-quiet fixture / no speech) → zero snips.
  // Do NOT apply this to all-loud audio: noise floor ≈ peak there.
  const peakDb = linearToDb(peak);
  const uniformlyQuiet =
    peakDb < -50 && peak < Math.max(floor, LINEAR_EPSILON) * MIN_SPEECH_HEADROOM;
  if (allBelowThreshold || uniformlyQuiet) {
    return [];
  }

  const totalDuration = totalDurationSeconds(chunks, volumeProfile);
  const quietRegions = detectQuietRegions(
    samples,
    thresholdDb,
    resolved.minSilenceGapDuration,
    resolved.initialIgnoreMs
  );
  const regions = proposeSegmentsFromQuietRegions(quietRegions, totalDuration, resolved);
  return createSnipsFromRegions(regions, chunks, volumeProfile, thresholdDb);
}
