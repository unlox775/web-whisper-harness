/**
 * Dave’s BLT debug session shape (ses_1788550979475, ~3m27s, 13 live snips).
 *
 * Live #7 is the 10.5s “so” cut (92.9–103.4) that Isolation Demo dropped
 * (Frozen then showed Live #8 as snip 7, count 12).
 *
 * Samples are synthetic but encode the same cut times: loud speech with a
 * ≥0.6s quiet gap centered on each interior live boundary. Packed into ~4s
 * chunks with per-chunk samples — the archive replay queue must grow these
 * one tick at a time.
 */

import { SAMPLE_WINDOW_MS, type ChunkVolumeProfile } from './volumeAnalyzer';
import type { ArchivedLiveSnip, ReplayQueueItem } from './archiveSource';

export const BLT_SESSION_END = 207.0;
export const BLT_CHUNK_SECONDS = 4;

/** Interior cuts must match live archived ranges (50ms test epsilon). */
export const BLT_LIVE_RANGES: Array<{
  startTime: number;
  endTime: number;
  text: string;
}> = [
  { startTime: 0.0, endTime: 16.2, text: 'cook' },
  { startTime: 16.2, endTime: 31.8, text: 'italian chicken' },
  { startTime: 31.8, endTime: 47.4, text: 'and a side' },
  { startTime: 47.4, endTime: 62.6, text: 'please' },
  { startTime: 62.6, endTime: 78.0, text: 'yeah' },
  { startTime: 78.0, endTime: 92.9, text: 'and then' },
  { startTime: 92.9, endTime: 103.4, text: 'so' },
  { startTime: 103.4, endTime: 115.4, text: 'next is' },
  { startTime: 115.4, endTime: 131.0, text: "I'll take a BLT's." },
  { startTime: 131.0, endTime: 150.0, text: 'BLT is cheese quesadilla' },
  { startTime: 150.0, endTime: 170.0, text: 'cheese quesadillas on the side' },
  { startTime: 170.0, endTime: 188.6, text: 'that is all' },
  { startTime: 188.6, endTime: BLT_SESSION_END, text: 'thanks' },
];

const LOUD_DB = -14;
const QUIET_DB = -55;
const GAP_SECONDS = 0.8;

function sessionSamples(): number[] {
  const step = SAMPLE_WINDOW_MS / 1000;
  const count = Math.round(BLT_SESSION_END / step);
  const samples = Array.from({ length: count }, () => LOUD_DB);
  const cuts = BLT_LIVE_RANGES.slice(1).map((row) => row.startTime);
  for (const cut of cuts) {
    const gapStart = cut - GAP_SECONDS / 2;
    const gapEnd = cut + GAP_SECONDS / 2;
    for (let t = gapStart; t < gapEnd - 1e-9; t += step) {
      const index = Math.round(t / step);
      if (index >= 0 && index < samples.length) {
        samples[index] = QUIET_DB;
      }
    }
  }
  return samples;
}

export function buildBltReplayQueue(): {
  items: ReplayQueueItem[];
  profiles: ChunkVolumeProfile[];
  liveSnips: ArchivedLiveSnip[];
} {
  const flat = sessionSamples();
  const samplesPerChunk = Math.round((BLT_CHUNK_SECONDS * 1000) / SAMPLE_WINDOW_MS);
  const items: ReplayQueueItem[] = [];
  const profiles: ChunkVolumeProfile[] = [];
  let offset = 0;
  let seq = 0;
  while (offset < flat.length) {
    const slice = flat.slice(offset, offset + samplesPerChunk);
    const duration = (slice.length * SAMPLE_WINDOW_MS) / 1000;
    const startTime = (offset * SAMPLE_WINDOW_MS) / 1000;
    const id = `blt-chunk-${seq}`;
    const profile: ChunkVolumeProfile = {
      chunkId: id,
      chunkIndex: seq,
      avgDb: slice.reduce((sum, db) => sum + db, 0) / slice.length,
      peakDb: Math.max(...slice),
      quietSampleCount: slice.filter((db) => db <= QUIET_DB).length,
      samples: Float32Array.from(slice),
    };
    profiles.push(profile);
    items.push({
      seq,
      chunk: {
        id,
        seq,
        startTime,
        endTime: startTime + duration,
        duration,
      },
      blob: new Blob([new Uint8Array([seq + 1])], { type: 'audio/mpeg' }),
      storedProfile: profile,
      playable: true,
    });
    offset += slice.length;
    seq += 1;
  }

  const liveSnips: ArchivedLiveSnip[] = BLT_LIVE_RANGES.map((row, index) => ({
    id: String(index + 1),
    startTime: row.startTime,
    endTime: row.endTime,
    duration: row.endTime - row.startTime,
    chunkIds: [],
    text: row.text,
  }));

  return { items, profiles, liveSnips };
}

export const BLT_REPLAY_FIXTURE_NOTE =
  'BLT 13-snip replay fixture — growing volume-profile samples + live ranges (synthetic samples, Dave’s cut times including #7 92.9–103.4)';
