import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeAdaptiveQuietThresholdDb,
  proposeSnipsFromProfile,
} from './snips.js';
import { DEFAULT_SNIP_OPTIONS } from './defaults.js';
import type { ChunkMetadata, ChunkVolumeProfile } from './types.js';

function makeProfile(dbSeries: number[]): {
  volumeProfile: ChunkVolumeProfile[];
  chunks: ChunkMetadata[];
} {
  const duration = dbSeries.length * 0.1;
  return {
    volumeProfile: [
      {
        chunkId: 'c0',
        chunkIndex: 0,
        avgDb: dbSeries.reduce((sum, db) => sum + db, 0) / dbSeries.length,
        peakDb: Math.max(...dbSeries),
        quietSampleCount: dbSeries.filter((db) => db < -40).length,
        samples: Float32Array.from(dbSeries),
      },
    ],
    chunks: [
      {
        id: 'c0',
        seq: 0,
        startTime: 0,
        endTime: duration,
        duration,
      },
    ],
  };
}

function repeatPattern(pattern: number[], times: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < times; i++) {
    out.push(...pattern);
  }
  return out;
}

describe('DEFAULT_SNIP_OPTIONS (original web-whisper)', () => {
  it('matches original session-analysis constants', () => {
    assert.equal(DEFAULT_SNIP_OPTIONS.minSnipDuration, 5);
    assert.equal(DEFAULT_SNIP_OPTIONS.targetSnipDuration, 10);
    assert.equal(DEFAULT_SNIP_OPTIONS.maxSnipDuration, 60);
    assert.equal(DEFAULT_SNIP_OPTIONS.minSilenceGapDuration, 0.6);
    assert.equal(DEFAULT_SNIP_OPTIONS.hangoverMs, 200);
    assert.equal(DEFAULT_SNIP_OPTIONS.thresholdMultiplier, 1.6);
    assert.equal(DEFAULT_SNIP_OPTIONS.quietPercentile, 0.3);
    assert.equal(DEFAULT_SNIP_OPTIONS.noisePercentile, 0.12);
    assert.equal(DEFAULT_SNIP_OPTIONS.initialIgnoreMs, 120);
  });
});

describe('proposeSnipsFromProfile', () => {
  it('returns no snips for uniform near-silence', () => {
    const { volumeProfile, chunks } = makeProfile(Array(100).fill(-55));
    const snips = proposeSnipsFromProfile(volumeProfile, chunks);
    assert.equal(snips.length, 0);
  });

  it('keeps continuous loud speech in one snip', () => {
    const { volumeProfile, chunks } = makeProfile(Array(100).fill(-14));
    const snips = proposeSnipsFromProfile(volumeProfile, chunks);
    assert.equal(snips.length, 1);
    assert.ok(snips[0].duration >= 9.5);
  });

  it('does not cut every 4–5 word breath on run-on speech', () => {
    // 2.2s loud + 1.1s quiet, seven times (old split-every-gap → ~2.2s snips)
    const phrase = [...Array(22).fill(-14), ...Array(11).fill(-55)];
    const { volumeProfile, chunks } = makeProfile(repeatPattern(phrase, 7));
    const snips = proposeSnipsFromProfile(volumeProfile, chunks);
    assert.ok(snips.length >= 1);
    assert.ok(snips.length <= 3, `expected a few long snips, got ${snips.length}`);
    const avg = snips.reduce((sum, snip) => sum + snip.duration, 0) / snips.length;
    assert.ok(avg >= 8, `expected snips of several seconds, avg was ${avg.toFixed(2)}s`);
  });

  it('splits more aggressively when min/target/quiet are set tiny (old behavior)', () => {
    const phrase = [...Array(22).fill(-14), ...Array(11).fill(-55)];
    const { volumeProfile, chunks } = makeProfile(repeatPattern(phrase, 7));
    const snips = proposeSnipsFromProfile(volumeProfile, chunks, {
      quietThreshold: -40,
      minSnipDuration: 0.5,
      targetSnipDuration: 0.5,
      maxSnipDuration: 60,
      minSilenceGapDuration: 1.0,
    });
    assert.ok(snips.length >= 5, `aggressive settings should yield many snips, got ${snips.length}`);
    const avg = snips.reduce((sum, snip) => sum + snip.duration, 0) / snips.length;
    assert.ok(avg < 6, `aggressive avg should be short, was ${avg.toFixed(2)}s`);
  });

  it('computes an adaptive floor between quiet and loud fixture levels', () => {
    const samples = [...Array(30).fill(-55), ...Array(90).fill(-14), ...Array(30).fill(-55)];
    const floor = computeAdaptiveQuietThresholdDb(samples);
    assert.ok(floor > -55 && floor < -25, `floor was ${floor.toFixed(1)} dB`);
  });

  it('drops the trailing in-progress snip while recording (includeTrailing: false)', () => {
    // 12s loud + 1s quiet + 8s loud → one closed cut after target, plus a growing tail
    const series = [...Array(120).fill(-14), ...Array(10).fill(-55), ...Array(80).fill(-14)];
    const { volumeProfile, chunks } = makeProfile(series);
    const closed = proposeSnipsFromProfile(volumeProfile, chunks, { includeTrailing: false });
    const all = proposeSnipsFromProfile(volumeProfile, chunks, { includeTrailing: true });
    assert.ok(all.length >= 2, `expected a closed snip plus a tail, got ${all.length}`);
    assert.equal(closed.length, all.length - 1);
    assert.ok(closed[0].endTime < all[all.length - 1].endTime);
  });

  it('only proposes snips after windowStartTime (incremental live window)', () => {
    const phrase = [...Array(120).fill(-14), ...Array(10).fill(-55)];
    const series = [...phrase, ...phrase, ...Array(80).fill(-14)];
    const { volumeProfile, chunks } = makeProfile(series);
    const firstPass = proposeSnipsFromProfile(volumeProfile, chunks, { includeTrailing: false });
    assert.ok(firstPass.length >= 1, 'first closed snip should be ready');
    const lastEnd = firstPass[firstPass.length - 1].endTime;
    const secondPass = proposeSnipsFromProfile(volumeProfile, chunks, {
      windowStartTime: lastEnd,
      includeTrailing: false,
    });
    for (const snip of secondPass) {
      assert.ok(
        snip.startTime >= lastEnd - 0.05,
        `incremental snip started at ${snip.startTime}, expected >= ${lastEnd}`
      );
    }
  });

  it('does not invent a snip covering the whole session when includeTrailing is false and no cut exists', () => {
    const { volumeProfile, chunks } = makeProfile(Array(80).fill(-14));
    const closed = proposeSnipsFromProfile(volumeProfile, chunks, { includeTrailing: false });
    assert.equal(closed.length, 0);
  });
});
