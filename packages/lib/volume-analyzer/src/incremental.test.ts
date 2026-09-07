import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  analyzeVolumeIncremental,
  chunkProfileHasSamples,
  mergeVolumeProfiles,
  profilesFromStored,
  proposeSnipsIncremental,
  storedProfileHasPerChunkSamples,
  windowSamplesFromProfile,
} from './incremental.js';
import { computeAdaptiveQuietThresholdDb } from './snips.js';
import type { ChunkMetadata, ChunkVolumeProfile, Snip } from './types.js';

function profileFromSeries(
  dbSeries: number[],
  opts: { chunkId?: string; chunkIndex?: number; startTime?: number } = {}
): { volumeProfile: ChunkVolumeProfile[]; chunks: ChunkMetadata[] } {
  const duration = dbSeries.length * 0.1;
  const startTime = opts.startTime ?? 0;
  const chunkId = opts.chunkId ?? 'c0';
  const chunkIndex = opts.chunkIndex ?? 0;
  return {
    volumeProfile: [
      {
        chunkId,
        chunkIndex,
        avgDb: dbSeries.reduce((sum, db) => sum + db, 0) / dbSeries.length,
        peakDb: Math.max(...dbSeries),
        quietSampleCount: dbSeries.filter((db) => db < -40).length,
        samples: Float32Array.from(dbSeries),
      },
    ],
    chunks: [
      {
        id: chunkId,
        seq: chunkIndex,
        startTime,
        endTime: startTime + duration,
        duration,
      },
    ],
  };
}

function joinProfiles(
  parts: Array<{ volumeProfile: ChunkVolumeProfile[]; chunks: ChunkMetadata[] }>
): { volumeProfile: ChunkVolumeProfile[]; chunks: ChunkMetadata[] } {
  return {
    volumeProfile: parts.flatMap((part) => part.volumeProfile),
    chunks: parts.flatMap((part) => part.chunks),
  };
}

describe('proposeSnipsIncremental', () => {
  it('freezes saved snips and sets windowStartTime to lastEnd', () => {
    const first = profileFromSeries(
      [...Array(120).fill(-14), ...Array(10).fill(-55)],
      { chunkId: 'c0', chunkIndex: 0, startTime: 0 }
    );
    const second = profileFromSeries(Array(80).fill(-14), {
      chunkId: 'c1',
      chunkIndex: 1,
      startTime: 13,
    });
    const { volumeProfile, chunks } = joinProfiles([first, second]);

    const growing = proposeSnipsIncremental(first.volumeProfile, first.chunks, [], {
      includeTrailing: false,
    });
    assert.ok(growing.newlyClosed.length >= 1, 'first window should close a snip');
    assert.equal(growing.windowStartTime, 0);
    const frozen = growing.committedThisTick;
    const lastEnd = Math.max(...frozen.map((snip) => snip.endTime));

    const next = proposeSnipsIncremental(volumeProfile, chunks, frozen, {
      includeTrailing: false,
    });
    assert.equal(next.windowStartTime, lastEnd);
    assert.deepEqual(
      next.frozen.map((snip) => [snip.startTime, snip.endTime]),
      frozen.map((snip) => [snip.startTime, snip.endTime])
    );
    for (const snip of next.newlyClosed) {
      assert.ok(snip.startTime >= lastEnd - 0.05);
    }
  });

  it('holds trailing when includeTrailing is false and commits it when true', () => {
    const series = [...Array(120).fill(-14), ...Array(10).fill(-55), ...Array(80).fill(-14)];
    const { volumeProfile, chunks } = profileFromSeries(series);

    const held = proposeSnipsIncremental(volumeProfile, chunks, [], { includeTrailing: false });
    assert.ok(held.newlyClosed.length >= 1);
    assert.ok(held.trailing, 'in-progress tail should be held');
    assert.equal(held.includeTrailing, false);
    assert.ok(held.trailing && held.trailing.endTime > held.newlyClosed[0].endTime);
    assert.equal(held.allCommitted.length, held.newlyClosed.length);

    const committed = proposeSnipsIncremental(volumeProfile, chunks, held.allCommitted, {
      includeTrailing: true,
    });
    assert.equal(committed.trailing, null);
    assert.equal(committed.includeTrailing, true);
    assert.ok(committed.committedThisTick.length >= 1, 'Stop should commit the tail');
    assert.ok(
      committed.allCommitted.length > held.allCommitted.length,
      'committed list grows on Stop'
    );
  });

  it('computes adaptive floor on the current window, not the full session', () => {
    const quietThenSpeech = profileFromSeries(
      [...Array(80).fill(-55), ...Array(120).fill(-14), ...Array(10).fill(-55)],
      { chunkId: 'c0', chunkIndex: 0, startTime: 0 }
    );
    const first = proposeSnipsIncremental(
      quietThenSpeech.volumeProfile,
      quietThenSpeech.chunks,
      [],
      { includeTrailing: false }
    );
    assert.ok(first.newlyClosed.length >= 1);
    const lastEnd = first.committedThisTick[0].endTime;

    const loudTail = profileFromSeries(Array(80).fill(-10), {
      chunkId: 'c1',
      chunkIndex: 1,
      startTime: quietThenSpeech.chunks[0].endTime,
    });
    const { volumeProfile, chunks } = joinProfiles([quietThenSpeech, loudTail]);
    const next = proposeSnipsIncremental(volumeProfile, chunks, first.committedThisTick, {
      includeTrailing: false,
    });

    const windowDbs = windowSamplesFromProfile(volumeProfile, lastEnd);
    const allDbs = windowSamplesFromProfile(volumeProfile, 0);
    const windowFloor = computeAdaptiveQuietThresholdDb(windowDbs);
    const sessionFloor = computeAdaptiveQuietThresholdDb(allDbs);

    assert.equal(next.windowStartTime, lastEnd);
    assert.ok(next.adaptiveFloorDb != null);
    assert.ok(Math.abs((next.adaptiveFloorDb ?? 0) - windowFloor) < 1e-6);
    assert.ok(
      Math.abs(windowFloor - sessionFloor) > 0.2,
      `expected window floor ${windowFloor} to differ from session floor ${sessionFloor}`
    );
  });
});

describe('analyzeVolumeIncremental + stored profile mapping', () => {
  it('merges decoded chunks and reuses stored samples without decode', async () => {
    const existing: ChunkVolumeProfile[] = [
      {
        chunkId: 'c0',
        chunkIndex: 0,
        avgDb: -20,
        peakDb: -12,
        quietSampleCount: 0,
        samples: Float32Array.from([-20, -18]),
      },
    ];
    const stored: ChunkVolumeProfile = {
      chunkId: 'c1',
      chunkIndex: 1,
      avgDb: -22,
      peakDb: -14,
      quietSampleCount: 0,
      samples: Float32Array.from([-22, -16, -14]),
    };
    const dummyBlob = new Blob([new Uint8Array([1])], { type: 'audio/mpeg' });
    const result = await analyzeVolumeIncremental(existing, [
      {
        chunk: {
          id: 'c1',
          seq: 1,
          startTime: 4,
          endTime: 8,
          duration: 4,
          blob: dummyBlob,
        },
        storedProfile: stored,
      },
    ]);
    assert.equal(result.newChunksDecoded, 0);
    assert.equal(result.profileReused, 1);
    assert.equal(result.mergedProfiles.length, 2);
    assert.equal(result.mergedProfiles[1].chunkId, 'c1');
    assert.equal(result.mergedProfiles[1].samples.length, 3);
  });

  it('profilesFromStored maps samples the same way session.ts did', () => {
    const mapped = profilesFromStored({
      chunkVolumes: [
        { chunkId: 'a', peakDb: -12, avgDb: -20, chunkIndex: 0, samples: [-20, -12] },
        { chunkId: 'b', peakDb: -40, chunkIndex: 1 },
      ],
    });
    assert.equal(mapped.length, 2);
    assert.deepEqual(Array.from(mapped[0].samples), [-20, -12]);
    assert.deepEqual(Array.from(mapped[1].samples), [-40]);
    assert.equal(storedProfileHasPerChunkSamples({
      chunkVolumes: [
        { chunkId: 'a', peakDb: -12, samples: [-12] },
        { chunkId: 'b', peakDb: -14, samples: [-14, -13] },
      ],
    }), true);
    assert.equal(
      storedProfileHasPerChunkSamples({
        chunkVolumes: [{ chunkId: 'a', peakDb: -12 }],
      }),
      false
    );
    assert.equal(chunkProfileHasSamples({ samples: [-1] }), true);
    assert.equal(chunkProfileHasSamples({ samples: [] }), false);
  });

  it('mergeVolumeProfiles replaces by chunkId and sorts by chunkIndex', () => {
    const merged = mergeVolumeProfiles(
      [
        {
          chunkId: 'c1',
          chunkIndex: 1,
          avgDb: -1,
          peakDb: -1,
          quietSampleCount: 0,
          samples: Float32Array.from([-1]),
        },
      ],
      [
        {
          chunkId: 'c0',
          chunkIndex: 0,
          avgDb: -2,
          peakDb: -2,
          quietSampleCount: 0,
          samples: Float32Array.from([-2]),
        },
        {
          chunkId: 'c1',
          chunkIndex: 1,
          avgDb: -3,
          peakDb: -3,
          quietSampleCount: 0,
          samples: Float32Array.from([-3]),
        },
      ]
    );
    assert.deepEqual(
      merged.map((row) => [row.chunkId, row.peakDb]),
      [
        ['c0', -2],
        ['c1', -3],
      ]
    );
  });
});

describe('incremental vs archived profile identity', () => {
  it('replaying stored samples with production defaults matches live incremental count/ranges', () => {
    const ticks = [
      profileFromSeries(
        [...Array(22).fill(-14), ...Array(11).fill(-55), ...Array(7).fill(-14)],
        { chunkId: 't0', chunkIndex: 0, startTime: 0 }
      ),
      profileFromSeries(
        [...Array(15).fill(-14), ...Array(11).fill(-55), ...Array(14).fill(-14)],
        { chunkId: 't1', chunkIndex: 1, startTime: 4 }
      ),
      profileFromSeries(
        [...Array(8).fill(-14), ...Array(11).fill(-55), ...Array(21).fill(-14)],
        { chunkId: 't2', chunkIndex: 2, startTime: 8 }
      ),
      profileFromSeries(
        [...Array(1).fill(-14), ...Array(11).fill(-55), ...Array(22).fill(-14), ...Array(6).fill(-55)],
        { chunkId: 't3', chunkIndex: 3, startTime: 12 }
      ),
      profileFromSeries(
        [...Array(5).fill(-55), ...Array(22).fill(-14), ...Array(11).fill(-55), ...Array(2).fill(-14)],
        { chunkId: 't4', chunkIndex: 4, startTime: 16 }
      ),
      profileFromSeries(Array(40).fill(-14), {
        chunkId: 't5',
        chunkIndex: 5,
        startTime: 20,
      }),
    ];

    let frozen: Snip[] = [];
    let liveProfiles: ChunkVolumeProfile[] = [];
    let liveChunks: ChunkMetadata[] = [];
    for (let i = 0; i < ticks.length; i++) {
      liveProfiles = [...liveProfiles, ...ticks[i].volumeProfile];
      liveChunks = [...liveChunks, ...ticks[i].chunks];
      const last = i === ticks.length - 1;
      const result = proposeSnipsIncremental(liveProfiles, liveChunks, frozen, {
        includeTrailing: last,
      });
      frozen = result.allCommitted;
    }

    const stored = {
      chunkVolumes: liveProfiles.map((profile) => ({
        chunkId: profile.chunkId,
        peakDb: profile.peakDb,
        avgDb: profile.avgDb,
        chunkIndex: profile.chunkIndex,
        samples: Array.from(profile.samples),
      })),
    };
    const replayProfiles = profilesFromStored(stored);

    let replayFrozen: Snip[] = [];
    let growing: ChunkVolumeProfile[] = [];
    let growingChunks: ChunkMetadata[] = [];
    for (let i = 0; i < ticks.length; i++) {
      growing = mergeVolumeProfiles(growing, [replayProfiles[i]]);
      growingChunks = [...growingChunks, ...ticks[i].chunks];
      const last = i === ticks.length - 1;
      const result = proposeSnipsIncremental(growing, growingChunks, replayFrozen, {
        includeTrailing: last,
      });
      replayFrozen = result.allCommitted;
    }

    assert.equal(replayFrozen.length, frozen.length);
    for (let i = 0; i < frozen.length; i++) {
      assert.ok(
        Math.abs(replayFrozen[i].startTime - frozen[i].startTime) <= 0.1,
        `start ${replayFrozen[i].startTime} vs ${frozen[i].startTime}`
      );
      assert.ok(
        Math.abs(replayFrozen[i].endTime - frozen[i].endTime) <= 0.1,
        `end ${replayFrozen[i].endTime} vs ${frozen[i].endTime}`
      );
    }
  });
});
