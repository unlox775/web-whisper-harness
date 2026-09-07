import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { proposeSnipsIncremental } from '../../src/incremental.ts';
import {
  replayArchiveLivePath,
  replayWithFullProfileEveryTick,
  stepArchiveReplay,
  emptyArchiveReplayState,
} from './archiveReplay.ts';
import { BLT_LIVE_RANGES, buildBltReplayQueue } from './bltLiveReplayFixture.ts';

const RANGE_EPS = 0.05;

function assertRangesMatch(
  frozen: Array<{ startTime: number; endTime: number }>,
  live: Array<{ startTime: number; endTime: number }>,
  label: string
) {
  assert.equal(frozen.length, live.length, `${label}: count ${frozen.length} vs ${live.length}`);
  for (let i = 0; i < live.length; i++) {
    assert.ok(
      Math.abs(frozen[i].startTime - live[i].startTime) <= RANGE_EPS,
      `${label} #${i + 1} start ${frozen[i].startTime} vs ${live[i].startTime}`
    );
    assert.ok(
      Math.abs(frozen[i].endTime - live[i].endTime) <= RANGE_EPS,
      `${label} #${i + 1} end ${frozen[i].endTime} vs ${live[i].endTime}`
    );
  }
}

describe('BLT archive live-path replay (13 snips)', () => {
  it('growing profiles + last includeTrailing true matches live archived 13 within 50ms', async () => {
    const { items, liveSnips } = buildBltReplayQueue();
    const state = await replayArchiveLivePath(items);
    assert.equal(liveSnips.length, 13);
    assert.equal(state.frozen.length, 13, `Frozen ${state.frozen.length} — expected 13`);
    assert.equal(state.frozen.length, liveSnips.length);
    assertRangesMatch(state.frozen, liveSnips, 'Frozen vs Live archived');
    const seven = state.frozen[6];
    assert.ok(Math.abs(seven.startTime - 92.9) <= RANGE_EPS, `Live #7 start ${seven.startTime}`);
    assert.ok(Math.abs(seven.endTime - 103.4) <= RANGE_EPS, `Live #7 end ${seven.endTime}`);
    assert.equal(state.trailing, null);
    assert.equal(state.includeTrailing, true);
  });

  it('last tick includeTrailing false only leaves 12 frozen + trailing (Dave’s 12-count)', async () => {
    const { items } = buildBltReplayQueue();
    let state = emptyArchiveReplayState();
    for (const item of items) {
      state = await stepArchiveReplay(state, item, false);
    }
    assert.equal(state.frozen.length, 12, `expected 12 frozen + trailing, got ${state.frozen.length}`);
    assert.ok(state.trailing, 'trailing must still be held');
    assert.equal(state.includeTrailing, false);
  });

  it('grows the profile one stored chunk per tick (never the full zip profile mid-replay)', async () => {
    const { items, profiles } = buildBltReplayQueue();
    assert.ok(profiles.length > 8, 'fixture must be a multi-chunk session');
    let state = emptyArchiveReplayState();
    state = await stepArchiveReplay(state, items[0], false);
    assert.equal(state.profiles.length, 1);
    state = await stepArchiveReplay(state, items[1], false);
    assert.equal(state.profiles.length, 2);
    assert.ok(state.profiles.length < profiles.length);
    const sampleCount = state.profiles.reduce((sum, row) => sum + row.samples.length, 0);
    const fullCount = profiles.reduce((sum, row) => sum + row.samples.length, 0);
    assert.ok(sampleCount < fullCount, 'must not attach the full session samples on early ticks');
  });

  it('documents the forbidden full-profile-every-tick helper (real zip yielded 11)', () => {
    const { items, profiles } = buildBltReplayQueue();
    const wrong = replayWithFullProfileEveryTick(items, profiles);
    assert.ok(Array.isArray(wrong.frozen));
    assert.ok(profiles.length > 1);
  });

  it('kernel growing replay (no demo wrapper) also matches the 13 live ranges', () => {
    const { items, liveSnips } = buildBltReplayQueue();
    let frozen = [];
    let profiles = [];
    let chunks = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.storedProfile) profiles = [...profiles, item.storedProfile];
      chunks = [...chunks, item.chunk];
      const result = proposeSnipsIncremental(profiles, chunks, frozen, {
        includeTrailing: i === items.length - 1,
      });
      frozen = result.allCommitted;
    }
    assertRangesMatch(frozen, liveSnips, 'kernel growing');
  });
});
