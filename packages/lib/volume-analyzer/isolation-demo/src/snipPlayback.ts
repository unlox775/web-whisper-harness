/**
 * Assemble a snip's audio range from in-memory chunk blobs.
 * Timeline matches the histogram / proposeSnipsFromProfile (flattened 100ms from t=0).
 * Uses Web Audio decode + WAV encode; played by HTMLAudioElement in App.
 */

import { encodePcmToWav } from './wavEncode';
import {
  SAMPLE_WINDOW_MS,
  type ChunkWithBlob,
  type ChunkVolumeProfile,
  type Snip,
} from './volumeAnalyzer';

export type TimelineEntry = {
  chunk: ChunkWithBlob;
  start: number;
  end: number;
};

export type SliceRange = {
  chunkId: string;
  /** Seconds from the start of this chunk's decoded audio. */
  offset: number;
  duration: number;
};

export function chunkTimelineFromProfile(
  chunks: ChunkWithBlob[],
  volumeProfile: ChunkVolumeProfile[]
): TimelineEntry[] {
  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  let t = 0;
  const entries: TimelineEntry[] = [];
  for (let i = 0; i < volumeProfile.length; i++) {
    const profile = volumeProfile[i];
    const chunk = byId.get(profile.chunkId) ?? chunks[i];
    if (!chunk) {
      continue;
    }
    const duration = (profile.samples.length * SAMPLE_WINDOW_MS) / 1000;
    entries.push({ chunk, start: t, end: t + duration });
    t += duration;
  }
  return entries;
}

export function overlappingEntriesForSnip(
  timeline: TimelineEntry[],
  snip: Pick<Snip, 'startTime' | 'endTime'>
): TimelineEntry[] {
  return timeline.filter((entry) => entry.start < snip.endTime && entry.end > snip.startTime);
}

export function sliceRangesForSnip(
  timeline: TimelineEntry[],
  snip: Pick<Snip, 'startTime' | 'endTime'>
): SliceRange[] {
  return overlappingEntriesForSnip(timeline, snip).map((entry) => {
    const start = Math.max(snip.startTime, entry.start);
    const end = Math.min(snip.endTime, entry.end);
    return {
      chunkId: entry.chunk.id,
      offset: start - entry.start,
      duration: Math.max(0, end - start),
    };
  });
}

function copySlice(
  source: Float32Array,
  sampleRate: number,
  offsetSec: number,
  durationSec: number
): Float32Array {
  const start = Math.max(0, Math.floor(offsetSec * sampleRate));
  const count = Math.max(0, Math.floor(durationSec * sampleRate));
  const end = Math.min(source.length, start + count);
  return source.subarray(start, end);
}

async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const context = new AudioContext();
  try {
    return await context.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    await context.close();
  }
}

/**
 * Decode overlapping chunks, slice to the snip range, encode a WAV the
 * HTMLAudioElement can play. Empty / decode-fail returns null.
 */
export async function assembleSnipWavBlob(
  chunks: ChunkWithBlob[],
  volumeProfile: ChunkVolumeProfile[],
  snip: Pick<Snip, 'startTime' | 'endTime'>
): Promise<Blob | null> {
  const timeline = chunkTimelineFromProfile(chunks, volumeProfile);
  const overlapping = overlappingEntriesForSnip(timeline, snip);
  if (overlapping.length === 0) {
    return null;
  }

  const ranges = sliceRangesForSnip(timeline, snip);
  const decoded: AudioBuffer[] = [];
  for (const entry of overlapping) {
    try {
      decoded.push(await decodeBlob(entry.chunk.blob));
    } catch {
      return null;
    }
  }

  const sampleRate = decoded[0]?.sampleRate ?? 48000;
  const channelCount = Math.max(1, ...decoded.map((buffer) => buffer.numberOfChannels));
  const channelChunks: Float32Array[][] = Array.from({ length: channelCount }, () => []);

  for (let i = 0; i < decoded.length; i++) {
    const buffer = decoded[i];
    const range = ranges[i];
    const duration = range.duration;
    if (duration <= 0) {
      continue;
    }
    for (let ch = 0; ch < channelCount; ch++) {
      const source =
        buffer.numberOfChannels > ch
          ? buffer.getChannelData(ch)
          : buffer.getChannelData(0);
      // Scale offset/duration if decoded length disagrees slightly with the
      // 100ms-window timeline (MP3 padding, last partial window).
      const timelineDur = overlapping[i].end - overlapping[i].start;
      const decodedDur = buffer.duration > 0 ? buffer.duration : timelineDur;
      const scale = timelineDur > 0 ? decodedDur / timelineDur : 1;
      channelChunks[ch].push(copySlice(source, sampleRate, range.offset * scale, duration * scale));
    }
  }

  const channels = channelChunks.map((parts) => {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Float32Array(total);
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  });

  if ((channels[0]?.length ?? 0) === 0) {
    return null;
  }

  return encodePcmToWav(channels, sampleRate);
}

export const SNIP_PLAY_ERROR = 'Could not assemble snip audio from loaded chunks';
