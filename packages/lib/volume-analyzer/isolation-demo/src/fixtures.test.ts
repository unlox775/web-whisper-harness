import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FIXTURE_CHUNK_SECONDS,
  FIXTURE_PATTERNS,
  fixtureTickSpecs,
  fixtureTotalDuration,
} from './fixtures.ts';

describe('fixture 4s tick packing', () => {
  it('packs breath-paused speech into ~4s ticks so three Steps cover ~12s', () => {
    const pattern = FIXTURE_PATTERNS.find((item) => item.id === 'breath-paused-speech');
    assert.ok(pattern);
    const total = fixtureTotalDuration(pattern);
    const ticks = fixtureTickSpecs(pattern);
    assert.ok(ticks.length >= 3);
    assert.equal(ticks[0].duration, FIXTURE_CHUNK_SECONDS);
    assert.equal(ticks[0].startTime, 0);
    assert.equal(ticks[1].startTime, 4);
    assert.equal(ticks[2].startTime, 8);
    assert.ok(Math.abs(ticks[2].endTime - 12) < 1e-6);
    assert.ok(Math.abs(ticks[ticks.length - 1].endTime - total) < 1e-6);
    assert.ok(ticks.every((tick) => tick.pieces.length > 0));
  });
});
