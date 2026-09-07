import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { proposeSnipsIncremental } from '../../src/incremental.ts';
import { reasonForTick, runLiveTick } from './livePath.ts';
import type { ChunkVolumeProfile, Snip } from './volumeAnalyzer.ts';

function loudChunk(
  seq: number,
  startTime: number,
  samples: number[]
): ChunkVolumeProfile {
  return {
    chunkId: `c${seq}`,
    chunkIndex: seq,
    avgDb: samples.reduce((sum, db) => sum + db, 0) / samples.length,
    peakDb: Math.max(...samples),
    quietSampleCount: 0,
    samples: Float32Array.from(samples),
  };
}

describe('runLiveTick', () => {
  it('reuses stored samples and holds trailing on a growing tick', async () => {
    const stored = loudChunk(0, 0, Array(40).fill(-14));
    const result = await runLiveTick({
      chunk: { id: 'c0', seq: 0, startTime: 0, endTime: 4, duration: 4 },
      blob: new Blob([new Uint8Array([1])], { type: 'audio/mpeg' }),
      storedProfile: stored,
      existingProfiles: [],
      existingChunks: [],
      frozenSnips: [],
      includeTrailing: false,
    });
    assert.equal(result.telemetry.profileReused, true);
    assert.equal(result.telemetry.newChunksDecoded, 0);
    assert.equal(result.telemetry.analyzeFn.includes('analyzeVolumeIncremental'), true);
    assert.equal(result.telemetry.proposeFn.includes('proposeSnipsIncremental'), true);
    assert.equal(result.propose.includeTrailing, false);
    assert.equal(result.propose.newlyClosed.length, 0);
    assert.ok(result.propose.trailing);
    assert.ok(result.events.some((event) => event.name === 'chunkEncoded'));
    assert.ok(result.events.some((event) => event.name === 'volumeUpdated'));
    assert.ok(result.events.some((event) => event.name === 'snipsProposed'));
    assert.match(result.reason, /trailing/);
  });

  it('commits trailing on the Stop tick', async () => {
    const first = loudChunk(0, 0, Array(40).fill(-14));
    const second = loudChunk(1, 4, Array(40).fill(-14));
    const growing = await runLiveTick({
      chunk: { id: 'c1', seq: 1, startTime: 4, endTime: 8, duration: 4 },
      blob: null,
      storedProfile: second,
      existingProfiles: [first],
      existingChunks: [
        {
          id: 'c0',
          seq: 0,
          startTime: 0,
          endTime: 4,
          duration: 4,
          blob: new Blob(),
        },
      ],
      frozenSnips: [],
      includeTrailing: true,
    });
    assert.equal(growing.propose.includeTrailing, true);
    assert.ok(growing.propose.allCommitted.length >= 1);
    assert.ok(growing.events.some((event) => event.name === 'trailingCommitted'));
    assert.match(reasonForTick(1, growing.propose, true, true), /includeTrailing true/);
  });
});

describe('proposeSnipsIncremental freeze is not demo-local', () => {
  it('uses the shared helper for windowStart after a closed snip', () => {
    const profiles = [
      loudChunk(0, 0, [...Array(120).fill(-14), ...Array(10).fill(-55)]),
      loudChunk(1, 13, Array(40).fill(-14)),
    ];
    const chunks = [
      { id: 'c0', seq: 0, startTime: 0, endTime: 13, duration: 13 },
      { id: 'c1', seq: 1, startTime: 13, endTime: 17, duration: 4 },
    ];
    const first = proposeSnipsIncremental([profiles[0]], [chunks[0]], [], {
      includeTrailing: false,
    });
    assert.ok(first.newlyClosed.length >= 1);
    const frozen: Snip[] = first.allCommitted;
    const next = proposeSnipsIncremental(profiles, chunks, frozen, { includeTrailing: false });
    assert.equal(next.windowStartTime, Math.max(...frozen.map((snip) => snip.endTime)));
  });
});
