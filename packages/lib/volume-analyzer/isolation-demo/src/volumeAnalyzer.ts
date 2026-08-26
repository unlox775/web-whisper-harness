/**
 * Volume Analyzer Library (inline copy for demo)
 * 
 * In production, this would be imported from the parent package.
 * For the demo, we inline the core logic to avoid build complexity.
 */

export interface ChunkWithBlob {
  id: string;
  seq: number;
  blob: Blob;
  startTime: number;
  endTime: number;
  duration: number;
}

export interface ChunkMetadata {
  id: string;
  seq: number;
  startTime: number;
  endTime: number;
  duration: number;
}

export interface ChunkVolumeProfile {
  chunkId: string;
  chunkIndex: number;
  avgDb: number;
  peakDb: number;
  quietSampleCount: number;
  samples: Float32Array;
}

export interface Snip {
  snipId: number;
  startTime: number;
  endTime: number;
  duration: number;
  startChunkIndex: number;
  endChunkIndex: number;
  chunkRefs: string[];
  confidence: number;
}

export interface SnipOptions {
  quietThreshold?: number;
  minSnipDuration?: number;
  maxSnipDuration?: number;
  minSilenceGapDuration?: number;
}

const SAMPLE_WINDOW_MS = 100;

export async function analyzeChunksVolume(
  chunks: ChunkWithBlob[]
): Promise<ChunkVolumeProfile[]> {
  const profiles: ChunkVolumeProfile[] = [];
  
  for (const chunk of chunks) {
    const profile = await analyzeChunkVolume(chunk);
    profiles.push(profile);
  }
  
  return profiles;
}

async function analyzeChunkVolume(chunk: ChunkWithBlob): Promise<ChunkVolumeProfile> {
  const audioBuffer = await decodeChunkToPCM(chunk.blob);
  const samples = computeVolumeSamples(audioBuffer);
  const { avgDb, peakDb, quietSampleCount } = aggregateChunkVolume(samples);

  return {
    chunkId: chunk.id,
    chunkIndex: chunk.seq,
    avgDb,
    peakDb,
    quietSampleCount,
    samples,
  };
}

async function decodeChunkToPCM(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContext();
  try {
    return await audioContext.decodeAudioData(arrayBuffer);
  } finally {
    await audioContext.close();
  }
}

function computeVolumeSamples(audioBuffer: AudioBuffer): Float32Array {
  const channelData = audioBuffer.getChannelData(0);
  let monoData: Float32Array;
  
  if (audioBuffer.numberOfChannels > 1) {
    monoData = new Float32Array(channelData.length);
    for (let i = 0; i < channelData.length; i++) {
      let sum = 0;
      for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        sum += audioBuffer.getChannelData(ch)[i];
      }
      monoData[i] = sum / audioBuffer.numberOfChannels;
    }
  } else {
    monoData = channelData;
  }

  const sampleRate = audioBuffer.sampleRate;
  const windowSize = Math.floor((sampleRate * SAMPLE_WINDOW_MS) / 1000);
  const numWindows = Math.ceil(monoData.length / windowSize);
  const samples = new Float32Array(numWindows);

  for (let i = 0; i < numWindows; i++) {
    const start = i * windowSize;
    const end = Math.min(start + windowSize, monoData.length);
    
    let maxAbsSample = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(monoData[j]);
      if (abs > maxAbsSample) {
        maxAbsSample = abs;
      }
    }
    
    if (maxAbsSample < 0.00001) {
      samples[i] = -100;
    } else {
      samples[i] = 20 * Math.log10(maxAbsSample);
    }
  }

  return samples;
}

function aggregateChunkVolume(samples: Float32Array): {
  avgDb: number;
  peakDb: number;
  quietSampleCount: number;
} {
  if (samples.length === 0) {
    return { avgDb: -100, peakDb: -100, quietSampleCount: 0 };
  }

  let sum = 0;
  let peak = -Infinity;
  let quietCount = 0;

  for (let i = 0; i < samples.length; i++) {
    const db = samples[i];
    sum += db;
    if (db > peak) {
      peak = db;
    }
    if (db < -40) {
      quietCount++;
    }
  }

  return {
    avgDb: sum / samples.length,
    peakDb: peak,
    quietSampleCount: quietCount,
  };
}

export function proposeSnipsFromProfile(
  volumeProfile: ChunkVolumeProfile[],
  chunks: ChunkMetadata[],
  options: SnipOptions = {}
): Snip[] {
  const quietThreshold = options.quietThreshold ?? -40;
  // const minSnipDuration = options.minSnipDuration ?? 5;
  // const maxSnipDuration = options.maxSnipDuration ?? 60;
  const minSilenceGapDuration = options.minSilenceGapDuration ?? 1.0;

  const allQuiet = volumeProfile.every(chunk => 
    chunk.samples.every(sample => sample < quietThreshold)
  );

  if (allQuiet) {
    return [];
  }

  const silenceGaps = detectSilenceGaps(volumeProfile, quietThreshold, minSilenceGapDuration);
  let snips = groupLoudRegions(volumeProfile, silenceGaps, chunks);

  return snips;
}

function detectSilenceGaps(
  volumeProfile: ChunkVolumeProfile[],
  quietThreshold: number,
  minGapDuration: number
): Array<{ startTime: number; endTime: number }> {
  const gaps: Array<{ startTime: number; endTime: number }> = [];
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
    });
  }

  return gaps;
}

function groupLoudRegions(
  volumeProfile: ChunkVolumeProfile[],
  silenceGaps: Array<{ startTime: number; endTime: number }>,
  chunks: ChunkMetadata[]
): Snip[] {
  if (volumeProfile.length === 0) {
    return [];
  }

  const totalDuration = chunks.reduce((sum, chunk) => sum + chunk.duration, 0);

  if (silenceGaps.length === 0) {
    const snip: Snip = {
      snipId: 0,
      startTime: 0,
      endTime: totalDuration,
      duration: totalDuration,
      startChunkIndex: 0,
      endChunkIndex: chunks.length - 1,
      chunkRefs: chunks.map(c => c.id),
      confidence: 0.95,
    };
    return [snip];
  }

  const regions: { startTime: number; endTime: number }[] = [];
  
  if (silenceGaps[0].startTime > 0) {
    regions.push({ startTime: 0, endTime: silenceGaps[0].startTime });
  }

  for (let i = 0; i < silenceGaps.length - 1; i++) {
    regions.push({
      startTime: silenceGaps[i].endTime,
      endTime: silenceGaps[i + 1].startTime,
    });
  }

  const lastGap = silenceGaps[silenceGaps.length - 1];
  if (lastGap.endTime < totalDuration) {
    regions.push({ startTime: lastGap.endTime, endTime: totalDuration });
  }

  return regions.map((region, index) => {
    const overlappingChunks = chunks.filter(
      chunk => chunk.startTime < region.endTime && chunk.endTime > region.startTime
    );

    return {
      snipId: index,
      startTime: region.startTime,
      endTime: region.endTime,
      duration: region.endTime - region.startTime,
      startChunkIndex: overlappingChunks[0]?.seq ?? 0,
      endChunkIndex: overlappingChunks[overlappingChunks.length - 1]?.seq ?? 0,
      chunkRefs: overlappingChunks.map(c => c.id),
      confidence: 0.90,
    };
  });
}
