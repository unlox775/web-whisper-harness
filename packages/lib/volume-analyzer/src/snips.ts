/**
 * Snip Proposal
 * 
 * Detect silence gaps and propose snip boundaries (speech segments).
 */

import type { ChunkMetadata, ChunkVolumeProfile, Snip, SnipOptions, SilenceGap } from './types.js';

// Default options
const DEFAULT_QUIET_THRESHOLD = -40; // dB
const DEFAULT_MIN_SNIP_DURATION = 5; // seconds
const DEFAULT_MAX_SNIP_DURATION = 60; // seconds
const DEFAULT_MIN_SILENCE_GAP_DURATION = 1.0; // seconds
const SAMPLE_WINDOW_MS = 100;

/**
 * Detect silence gaps in volume profile
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
        // Quiet sample
        if (quietStart === null) {
          quietStart = sampleTime;
          quietSampleCount = 1;
        } else {
          quietSampleCount++;
        }
      } else {
        // Loud sample - end current quiet region if long enough
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

  // Handle trailing silence
  if (quietStart !== null && quietSampleCount >= minGapSamples) {
    gaps.push({
      startTime: quietStart,
      endTime: currentTime,
      duration: currentTime - quietStart,
    });
  }

  return gaps;
}

/**
 * Group loud regions between silence gaps into candidate snips
 */
function groupLoudRegions(
  volumeProfile: ChunkVolumeProfile[],
  silenceGaps: SilenceGap[],
  chunks: ChunkMetadata[]
): Snip[] {
  if (volumeProfile.length === 0) {
    return [];
  }

  // Calculate total session duration
  const totalDuration = chunks.reduce((sum, chunk) => sum + chunk.duration, 0);

  // If no silence gaps, return single snip covering entire session
  if (silenceGaps.length === 0) {
    return createSnipsFromRegions([{ startTime: 0, endTime: totalDuration }], chunks, volumeProfile);
  }

  const regions: { startTime: number; endTime: number }[] = [];
  
  // Region before first gap
  if (silenceGaps[0].startTime > 0) {
    regions.push({ startTime: 0, endTime: silenceGaps[0].startTime });
  }

  // Regions between gaps
  for (let i = 0; i < silenceGaps.length - 1; i++) {
    regions.push({
      startTime: silenceGaps[i].endTime,
      endTime: silenceGaps[i + 1].startTime,
    });
  }

  // Region after last gap
  const lastGap = silenceGaps[silenceGaps.length - 1];
  if (lastGap.endTime < totalDuration) {
    regions.push({ startTime: lastGap.endTime, endTime: totalDuration });
  }

  return createSnipsFromRegions(regions, chunks, volumeProfile);
}

/**
 * Create snips from time regions
 */
function createSnipsFromRegions(
  regions: { startTime: number; endTime: number }[],
  chunks: ChunkMetadata[],
  volumeProfile: ChunkVolumeProfile[]
): Snip[] {
  const snips: Snip[] = [];

  for (const region of regions) {
    // Find chunks that overlap this region
    const overlappingChunks = chunks.filter(
      chunk => chunk.startTime < region.endTime && chunk.endTime > region.startTime
    );

    if (overlappingChunks.length === 0) {
      continue;
    }

    const chunkRefs = overlappingChunks.map(c => c.id);
    const startChunkIndex = overlappingChunks[0].seq;
    const endChunkIndex = overlappingChunks[overlappingChunks.length - 1].seq;

    // Compute confidence (ratio of loud samples in this region)
    const confidence = computeRegionConfidence(region, volumeProfile, -40);

    snips.push({
      snipId: snips.length,
      startTime: region.startTime,
      endTime: region.endTime,
      duration: region.endTime - region.startTime,
      startChunkIndex,
      endChunkIndex,
      chunkRefs,
      confidence,
    });
  }

  return snips;
}

/**
 * Compute confidence for a time region (ratio of loud samples)
 */
function computeRegionConfidence(
  region: { startTime: number; endTime: number },
  volumeProfile: ChunkVolumeProfile[],
  quietThreshold: number
): number {
  let totalSamples = 0;
  let loudSamples = 0;
  let currentTime = 0;

  for (const chunk of volumeProfile) {
    const chunkStartTime = currentTime;
    const chunkDuration = (chunk.samples.length * SAMPLE_WINDOW_MS) / 1000;
    
    for (let i = 0; i < chunk.samples.length; i++) {
      const sampleTime = chunkStartTime + (i * SAMPLE_WINDOW_MS) / 1000;
      
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

/**
 * Merge snips shorter than minimum duration
 */
function chunkRefsForRange(
  chunks: ChunkMetadata[],
  startTime: number,
  endTime: number
): string[] {
  return chunks
    .filter((chunk) => chunk.startTime < endTime && chunk.endTime > startTime)
    .map((chunk) => chunk.id);
}

function mergeShortSnips(
  snips: Snip[],
  minDuration: number,
  chunks: ChunkMetadata[]
): Snip[] {
  if (snips.length === 0) {
    return [];
  }

  const merged: Snip[] = [];
  let current = { ...snips[0] };

  for (let i = 1; i < snips.length; i++) {
    if (current.duration < minDuration) {
      const endTime = snips[i].endTime;
      current = {
        ...current,
        endTime,
        duration: endTime - current.startTime,
        endChunkIndex: snips[i].endChunkIndex,
        chunkRefs: chunkRefsForRange(chunks, current.startTime, endTime),
        confidence: (current.confidence + snips[i].confidence) / 2,
      };
    } else {
      merged.push(current);
      current = { ...snips[i] };
    }
  }

  merged.push(current);
  
  // Re-number snip IDs
  merged.forEach((snip, index) => {
    snip.snipId = index;
  });

  return merged;
}

/**
 * Split snips longer than maximum duration
 */
function splitLongSnips(
  snips: Snip[],
  maxDuration: number,
  volumeProfile: ChunkVolumeProfile[],
  silenceGaps: SilenceGap[]
): Snip[] {
  const result: Snip[] = [];

  for (const snip of snips) {
    if (snip.duration <= maxDuration) {
      result.push(snip);
      continue;
    }

    // Find internal silence gaps within this snip
    const internalGaps = silenceGaps.filter(
      gap => gap.startTime > snip.startTime && gap.endTime < snip.endTime
    );

    if (internalGaps.length > 0) {
      // Split at internal gaps
      const regions: { startTime: number; endTime: number }[] = [];
      let currentStart = snip.startTime;

      for (const gap of internalGaps) {
        if (gap.startTime - currentStart >= maxDuration / 2) {
          // Split here
          regions.push({ startTime: currentStart, endTime: gap.startTime });
          currentStart = gap.endTime;
        }
      }

      // Add final region
      regions.push({ startTime: currentStart, endTime: snip.endTime });

      // Create snips from regions (reuse chunk refs from original snip)
      for (const region of regions) {
        result.push({
          snipId: result.length,
          startTime: region.startTime,
          endTime: region.endTime,
          duration: region.endTime - region.startTime,
          startChunkIndex: snip.startChunkIndex,
          endChunkIndex: snip.endChunkIndex,
          chunkRefs: snip.chunkRefs,
          confidence: snip.confidence,
        });
      }
    } else {
      // No internal gaps, hard split at max duration boundary
      let currentStart = snip.startTime;
      while (currentStart < snip.endTime) {
        const currentEnd = Math.min(currentStart + maxDuration, snip.endTime);
        result.push({
          snipId: result.length,
          startTime: currentStart,
          endTime: currentEnd,
          duration: currentEnd - currentStart,
          startChunkIndex: snip.startChunkIndex,
          endChunkIndex: snip.endChunkIndex,
          chunkRefs: snip.chunkRefs,
          confidence: snip.confidence,
        });
        currentStart = currentEnd;
      }
    }
  }

  return result;
}

/**
 * Propose snips from volume profile
 */
export function proposeSnipsFromProfile(
  volumeProfile: ChunkVolumeProfile[],
  chunks: ChunkMetadata[],
  options: SnipOptions = {}
): Snip[] {
  const quietThreshold = options.quietThreshold ?? DEFAULT_QUIET_THRESHOLD;
  const minSnipDuration = options.minSnipDuration ?? DEFAULT_MIN_SNIP_DURATION;
  const maxSnipDuration = options.maxSnipDuration ?? DEFAULT_MAX_SNIP_DURATION;
  const minSilenceGapDuration = options.minSilenceGapDuration ?? DEFAULT_MIN_SILENCE_GAP_DURATION;

  // Check for all-quiet session
  const allQuiet = volumeProfile.every(chunk => 
    chunk.samples.every(sample => sample < quietThreshold)
  );

  if (allQuiet) {
    return []; // No speech detected
  }

  // Detect silence gaps
  const silenceGaps = detectSilenceGaps(volumeProfile, quietThreshold, minSilenceGapDuration);

  // Group loud regions into candidate snips
  let snips = groupLoudRegions(volumeProfile, silenceGaps, chunks);

  // Merge short snips
  snips = mergeShortSnips(snips, minSnipDuration, chunks);

  // Split long snips
  snips = splitLongSnips(snips, maxSnipDuration, volumeProfile, silenceGaps);

  return snips;
}
