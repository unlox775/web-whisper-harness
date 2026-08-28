/**
 * Volume Computation
 * 
 * Decode MP3 chunks to PCM and compute volume profiles (peak dB per 100ms sample).
 */

import { FALLBACK_QUIET_THRESHOLD_DB, SAMPLE_WINDOW_MS } from './defaults.js';
import type { ChunkWithBlob, ChunkVolumeProfile } from './types.js';

/**
 * Decode MP3 blob to PCM using Web Audio API
 */
export async function decodeChunkToPCM(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContext();
  try {
    return await audioContext.decodeAudioData(arrayBuffer);
  } finally {
    await audioContext.close();
  }
}

/**
 * Compute volume samples (peak dB per 100ms window) from PCM buffer
 */
export function computeVolumeSamples(audioBuffer: AudioBuffer): Float32Array {
  // Convert to mono if stereo
  const channelData = audioBuffer.getChannelData(0);
  let monoData: Float32Array;
  
  if (audioBuffer.numberOfChannels > 1) {
    // Average all channels to mono
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
    
    // Compute peak dB for this window
    let maxAbsSample = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(monoData[j]);
      if (abs > maxAbsSample) {
        maxAbsSample = abs;
      }
    }
    
    // Convert to dB: 20 * log10(max / 1.0)
    // Handle silence (avoid log(0))
    if (maxAbsSample < 0.00001) {
      samples[i] = -100; // Very quiet, effectively silence
    } else {
      samples[i] = 20 * Math.log10(maxAbsSample);
    }
  }

  return samples;
}

/**
 * Aggregate chunk-level volume statistics from samples
 */
export function aggregateChunkVolume(
  samples: Float32Array,
  quietThreshold: number = FALLBACK_QUIET_THRESHOLD_DB
): { avgDb: number; peakDb: number; quietSampleCount: number } {
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
    if (db < quietThreshold) {
      quietCount++;
    }
  }

  return {
    avgDb: sum / samples.length,
    peakDb: peak,
    quietSampleCount: quietCount,
  };
}

/**
 * Analyze volume for a single chunk
 */
export async function analyzeChunkVolume(
  chunk: ChunkWithBlob,
  quietThreshold: number = FALLBACK_QUIET_THRESHOLD_DB
): Promise<ChunkVolumeProfile> {
  try {
    const audioBuffer = await decodeChunkToPCM(chunk.blob);
    const samples = computeVolumeSamples(audioBuffer);
    const { avgDb, peakDb, quietSampleCount } = aggregateChunkVolume(samples, quietThreshold);

    return {
      chunkId: chunk.id,
      chunkIndex: chunk.seq,
      avgDb,
      peakDb,
      quietSampleCount,
      samples,
    };
  } catch (error) {
    throw new Error(`Chunk decode failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Analyze volume for multiple chunks
 */
export async function analyzeChunksVolume(
  chunks: ChunkWithBlob[],
  quietThreshold: number = FALLBACK_QUIET_THRESHOLD_DB
): Promise<ChunkVolumeProfile[]> {
  const profiles: ChunkVolumeProfile[] = [];
  
  for (const chunk of chunks) {
    const profile = await analyzeChunkVolume(chunk, quietThreshold);
    profiles.push(profile);
  }
  
  return profiles;
}
