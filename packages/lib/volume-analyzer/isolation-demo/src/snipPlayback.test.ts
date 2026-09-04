import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { encodePcmToWav } from './wavEncode.ts';
import {
  chunkTimelineFromProfile,
  overlappingEntriesForSnip,
  sliceRangesForSnip,
} from './snipPlayback.ts';
import type { ChunkVolumeProfile, ChunkWithBlob } from './volumeAnalyzer.ts';

function chunksAndProfile(): {
  chunks: ChunkWithBlob[];
  volumeProfile: ChunkVolumeProfile[];
} {
  const chunks: ChunkWithBlob[] = [
    {
      id: 'a',
      seq: 0,
      startTime: 0,
      endTime: 4,
      duration: 4,
      blob: new Blob([new Uint8Array([1])], { type: 'audio/wav' }),
    },
    {
      id: 'b',
      seq: 1,
      startTime: 4,
      endTime: 8,
      duration: 4,
      blob: new Blob([new Uint8Array([2])], { type: 'audio/wav' }),
    },
    {
      id: 'c',
      seq: 2,
      startTime: 8,
      endTime: 12,
      duration: 4,
      blob: new Blob([new Uint8Array([3])], { type: 'audio/wav' }),
    },
  ];
  const volumeProfile: ChunkVolumeProfile[] = chunks.map((chunk, index) => ({
    chunkId: chunk.id,
    chunkIndex: index,
    avgDb: -12,
    peakDb: -8,
    quietSampleCount: 0,
    samples: new Float32Array(40),
  }));
  return { chunks, volumeProfile };
}

describe('chunk timeline matches flattened 100ms session time', () => {
  it('places chunks end-to-end from t=0', () => {
    const { chunks, volumeProfile } = chunksAndProfile();
    const timeline = chunkTimelineFromProfile(chunks, volumeProfile);
    assert.equal(timeline.length, 3);
    assert.equal(timeline[0].start, 0);
    assert.equal(timeline[0].end, 4);
    assert.equal(timeline[2].start, 8);
    assert.equal(timeline[2].end, 12);
  });
});

describe('snip slice ranges', () => {
  it('selects overlapping chunks and offsets inside them', () => {
    const { chunks, volumeProfile } = chunksAndProfile();
    const timeline = chunkTimelineFromProfile(chunks, volumeProfile);
    const snip = { startTime: 3.5, endTime: 9.2 };
    const overlapping = overlappingEntriesForSnip(timeline, snip);
    assert.deepEqual(
      overlapping.map((entry) => entry.chunk.id),
      ['a', 'b', 'c']
    );
    const ranges = sliceRangesForSnip(timeline, snip);
    assert.equal(ranges.length, 3);
    assert.ok(Math.abs(ranges[0].offset - 3.5) < 1e-9);
    assert.ok(Math.abs(ranges[0].duration - 0.5) < 1e-9);
    assert.ok(Math.abs(ranges[1].offset) < 1e-9);
    assert.ok(Math.abs(ranges[1].duration - 4) < 1e-9);
    assert.ok(Math.abs(ranges[2].offset) < 1e-9);
    assert.ok(Math.abs(ranges[2].duration - 1.2) < 1e-9);
  });

  it('returns no ranges when the snip is outside the timeline', () => {
    const { chunks, volumeProfile } = chunksAndProfile();
    const timeline = chunkTimelineFromProfile(chunks, volumeProfile);
    assert.equal(sliceRangesForSnip(timeline, { startTime: 20, endTime: 22 }).length, 0);
  });
});

describe('encodePcmToWav', () => {
  it('writes a RIFF/WAVE header for assembled PCM', () => {
    const pcm = new Float32Array(48);
    pcm[0] = 0.5;
    const blob = encodePcmToWav([pcm], 48000);
    assert.equal(blob.type, 'audio/wav');
    return blob.arrayBuffer().then((buffer) => {
      const view = new DataView(buffer);
      assert.equal(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)), 'RIFF');
      assert.equal(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)), 'WAVE');
    });
  });
});
