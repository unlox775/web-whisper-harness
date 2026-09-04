import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clampViewStart,
  clampWindowSeconds,
  defaultWindowSeconds,
  isZoomedIn,
  playheadSessionTime,
  scrollLeftForViewStart,
  timeToX,
  viewStartFromScrollLeft,
  viewStartToShowTime,
  xToTime,
  DEFAULT_LONG_WINDOW_SECONDS,
  MIN_WINDOW_SECONDS,
  sessionDurationFromProfile,
} from './histogramViewport.ts';
import type { ChunkVolumeProfile } from './volumeAnalyzer.ts';

function profile(sampleCounts: number[]): ChunkVolumeProfile[] {
  return sampleCounts.map((count, index) => ({
    chunkId: `c${index}`,
    chunkIndex: index,
    avgDb: -20,
    peakDb: -10,
    quietSampleCount: 0,
    samples: new Float32Array(count),
  }));
}

describe('sessionDurationFromProfile', () => {
  it('sums 100ms windows', () => {
    assert.equal(sessionDurationFromProfile(profile([10, 20])), 3);
  });
});

describe('defaultWindowSeconds', () => {
  it('fits short sessions', () => {
    assert.equal(defaultWindowSeconds(24), 24);
    assert.equal(defaultWindowSeconds(45), 45);
  });

  it('uses a 30s window for long sessions', () => {
    assert.equal(defaultWindowSeconds(180), DEFAULT_LONG_WINDOW_SECONDS);
    assert.equal(defaultWindowSeconds(46), DEFAULT_LONG_WINDOW_SECONDS);
  });
});

describe('clamp window and viewStart', () => {
  it('preserves a mid-timeline pan when the window stays the same', () => {
    const start = clampViewStart(40, 120, 30);
    assert.equal(start, 40);
  });

  it('clamps pan when the window grows past the remaining tail', () => {
    assert.equal(clampViewStart(100, 120, 30), 90);
    assert.equal(clampViewStart(0, 120, 120), 0);
  });

  it('does not treat slider recompute as a reason to snap to 0', () => {
    const afterRecompute = clampViewStart(18.5, 120, 30);
    assert.equal(afterRecompute, 18.5);
  });

  it('clamps window between min and duration', () => {
    assert.equal(clampWindowSeconds(2, 80), MIN_WINDOW_SECONDS);
    assert.equal(clampWindowSeconds(200, 80), 80);
  });
});

describe('zoom mapping', () => {
  it('maps session time through the scrolled viewport', () => {
    const chartWidth = 600;
    const x = timeToX(45, 30, 30, chartWidth, 0);
    assert.equal(x, 300);
    assert.equal(xToTime(300, 30, 30, chartWidth, 0), 45);
  });

  it('is zoomed only when window is shorter than the session', () => {
    assert.equal(isZoomedIn(120, 30), true);
    assert.equal(isZoomedIn(24, 24), false);
  });

  it('round-trips scrollbar position and viewStart', () => {
    const clientWidth = 400;
    const viewStart = 60;
    const left = scrollLeftForViewStart(viewStart, 180, 30, clientWidth);
    const back = viewStartFromScrollLeft(left, 180, 30, clientWidth);
    assert.ok(Math.abs(back - viewStart) < 0.01);
  });
});

describe('playhead session time', () => {
  it('is session-relative: snip start + audio currentTime', () => {
    assert.equal(playheadSessionTime(42.5, 1.25), 43.75);
  });

  it('keeps a frozen value when currentTime does not change (pause)', () => {
    const frozen = playheadSessionTime(10, 3);
    assert.equal(frozen, 13);
    assert.equal(playheadSessionTime(10, 3), frozen);
  });
});

describe('viewStartToShowTime', () => {
  it('pans so a snip start is inside the window without changing the window', () => {
    const start = viewStartToShowTime(90, 200, 30, 0.1);
    assert.ok(start <= 90);
    assert.ok(90 < start + 30);
    assert.equal(start, 87);
  });
});
