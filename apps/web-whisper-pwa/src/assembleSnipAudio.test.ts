import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assembleSnipTranscriptionBlob,
  describeSnipTranscriptionJobs,
  exclusiveChunkIdsForSnip,
  planSnipAudioSlices,
  transcriptionWindowsOverlap,
  wavDurationSeconds,
  type ChunkTimeRange,
  type DecodePcm,
  type SnipTimeRange,
} from './assembleSnipAudio.ts';

function chunk(id: string, startTime: number, endTime: number, blob?: Blob): ChunkTimeRange {
  return { id, startTime, endTime, duration: endTime - startTime, blob };
}

function snip(id: string, startTime: number, endTime: number, chunkIds: string[]): SnipTimeRange {
  return { id, startTime, endTime, chunkIds };
}

/** Typical capture tape: five ~4s chunks, two abutting ~10s snips that share chunk c2. */
const fourSecondChunks = [
  chunk('c0', 0, 4),
  chunk('c1', 4, 8),
  chunk('c2', 8, 12),
  chunk('c3', 12, 16),
  chunk('c4', 16, 20),
];

const abuttingSnips = [
  snip('a', 0, 10, ['c0', 'c1', 'c2']),
  snip('b', 10, 20, ['c2', 'c3', 'c4']),
];

describe('planSnipAudioSlices', () => {
  it('trims the shared boundary chunk so each snip only keeps its own time range', () => {
    const a = planSnipAudioSlices(abuttingSnips[0], fourSecondChunks);
    const b = planSnipAudioSlices(abuttingSnips[1], fourSecondChunks);

    assert.deepEqual(
      a.map((slice) => [slice.chunkId, slice.sliceStartTime, slice.sliceEndTime]),
      [
        ['c0', 0, 4],
        ['c1', 4, 8],
        ['c2', 8, 10],
      ]
    );
    assert.deepEqual(
      b.map((slice) => [slice.chunkId, slice.sliceStartTime, slice.sliceEndTime]),
      [
        ['c2', 10, 12],
        ['c3', 12, 16],
        ['c4', 16, 20],
      ]
    );
  });

  it('uses session chunk times, not stored chunkIds, when they disagree', () => {
    const stale = snip('a', 0, 10, ['c0']);
    const slices = planSnipAudioSlices(stale, fourSecondChunks);
    assert.deepEqual(
      slices.map((slice) => slice.chunkId),
      ['c0', 'c1', 'c2']
    );
    assert.equal(slices.at(-1)?.sliceEndTime, 10);
  });
});

describe('describeSnipTranscriptionJobs', () => {
  it('schedules exactly one Groq call per snip, never per chunk or whole session', () => {
    const jobs = describeSnipTranscriptionJobs(abuttingSnips, fourSecondChunks);
    assert.equal(jobs.length, 2);
    assert.equal(
      jobs.every((job) => job.groqCalls === 1),
      true
    );
    assert.equal(
      jobs.reduce((sum, job) => sum + job.groqCalls, 0),
      2
    );
    assert.notEqual(jobs.reduce((sum, job) => sum + job.overlappingChunkCount, 0), 1);
    assert.ok(jobs[0].overlappingChunkCount >= 2);
    assert.ok(jobs[1].overlappingChunkCount >= 2);
  });

  it('assembled duration matches snip range, not the 12s overlapping-chunk union', () => {
    const jobs = describeSnipTranscriptionJobs(abuttingSnips, fourSecondChunks);
    assert.equal(jobs[0].assembledDuration, 10);
    assert.equal(jobs[1].assembledDuration, 10);
    assert.equal(transcriptionWindowsOverlap(jobs), false);
  });

  it('would overlap if we sent whole overlapping chunk sets (the old bug)', () => {
    const wholeChunkJobs = abuttingSnips.map((item) => ({
      snipId: item.id || '',
      startTime: item.startTime,
      endTime: item.endTime,
      groqCalls: 1 as const,
      overlappingChunkCount: item.chunkIds?.length || 0,
      assembledDuration: 12,
      slices: (item.chunkIds || []).map((chunkId) => {
        const meta = fourSecondChunks.find((row) => row.id === chunkId)!;
        return {
          chunkId,
          chunkStartTime: meta.startTime,
          chunkEndTime: meta.endTime,
          sliceStartTime: meta.startTime,
          sliceEndTime: meta.endTime,
        };
      }),
    }));
    assert.equal(transcriptionWindowsOverlap(wholeChunkJobs), true);
  });
});

describe('exclusiveChunkIdsForSnip', () => {
  it('does not give the shared 8–12s chunk to both abutting snips', () => {
    const a = exclusiveChunkIdsForSnip(abuttingSnips[0], fourSecondChunks);
    const b = exclusiveChunkIdsForSnip(abuttingSnips[1], fourSecondChunks);
    assert.deepEqual(a, ['c0', 'c1']);
    assert.deepEqual(b, ['c2', 'c3', 'c4']);
    assert.equal(a.some((id) => b.includes(id)), false);
  });
});

describe('assembleSnipTranscriptionBlob', () => {
  function toneChunk(id: string, startTime: number, endTime: number, sampleRate = 1000): {
    chunk: ChunkTimeRange;
    decode: (blob: Blob) => Promise<DecodePcm>;
  } {
    const duration = endTime - startTime;
    const blob = new Blob([id], { type: 'audio/mpeg' });
    const channelData = new Float32Array(duration * sampleRate);
    for (let i = 0; i < channelData.length; i++) {
      channelData[i] = (startTime + i / sampleRate) / 100;
    }
    const pcmByBlob = new WeakMap<Blob, DecodePcm>([
      [blob, { channelData, sampleRate, duration }],
    ]);
    return {
      chunk: { id, startTime, endTime, duration, blob },
      decode: async (input) => {
        const pcm = pcmByBlob.get(input);
        if (!pcm) throw new Error('unknown blob');
        return pcm;
      },
    };
  }

  it('decodes and trims to the snip range so Groq does not hear the extra 8–12s tail', async () => {
    const pieces = [
      toneChunk('c0', 0, 4),
      toneChunk('c1', 4, 8),
      toneChunk('c2', 8, 12),
    ];
    const decode = async (blob: Blob) => {
      for (const piece of pieces) {
        try {
          return await piece.decode(blob);
        } catch {
          /* try next */
        }
      }
      throw new Error('unknown blob');
    };
    const assembled = await assembleSnipTranscriptionBlob(abuttingSnips[0], {
      sessionChunks: pieces.map((piece) => piece.chunk),
      decode,
    });
    assert.equal(assembled.kind, 'trimmed-wav');
    assert.equal(assembled.blob.type, 'audio/wav');
    const seconds = wavDurationSeconds(await assembled.blob.arrayBuffer());
    assert.ok(Math.abs(seconds - 10) < 0.02, `expected ~10s wav, got ${seconds}`);
    assert.equal(assembled.slices.at(-1)?.sliceEndTime, 10);
  });

  it('falls back to exclusive MP3 concat (no shared chunk) when decode fails', async () => {
    const chunks = fourSecondChunks.map((row) => ({
      ...row,
      blob: new Blob([row.id], { type: 'audio/mpeg' }),
    }));
    const assembled = await assembleSnipTranscriptionBlob(abuttingSnips[0], {
      sessionChunks: chunks,
      decode: async () => {
        throw new Error('no decoder');
      },
    });
    assert.equal(assembled.kind, 'concat-mp3');
    const text = await assembled.blob.text();
    assert.equal(text.includes('c2'), false);
    assert.equal(text.includes('c0'), true);
    assert.equal(text.includes('c1'), true);
  });
});
