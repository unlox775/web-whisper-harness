import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  histogramPlotDuration,
  SAMPLE_WINDOW_S,
  shouldShowPlayhead,
  timeToFraction,
} from './histogramScale.ts';

describe('histogramPlotDuration', () => {
  it('prefers playback/session duration over the sample-window stand-in', () => {
    assert.equal(histogramPlotDuration(470, 47), 47);
    assert.equal(histogramPlotDuration(256, 1024), 1024);
  });

  it('falls back to samples × 0.1s when duration is missing or invalid', () => {
    assert.equal(histogramPlotDuration(100), 10);
    assert.equal(histogramPlotDuration(100, 0), 10);
    assert.equal(histogramPlotDuration(100, null), 10);
    assert.equal(histogramPlotDuration(100, Number.NaN), 10);
    assert.equal(SAMPLE_WINDOW_S, 0.1);
  });
});

describe('shouldShowPlayhead', () => {
  it('hides when idle (no position) and shows for playing or paused-with-position', () => {
    assert.equal(shouldShowPlayhead(null), false);
    assert.equal(shouldShowPlayhead(undefined), false);
    assert.equal(shouldShowPlayhead(0), true);
    assert.equal(shouldShowPlayhead(12.4), true);
  });
});

describe('timeToFraction', () => {
  it('maps snip starts and currentTime onto the same 0–1 x-scale', () => {
    const duration = 47;
    assert.equal(timeToFraction(0, duration), 0);
    assert.equal(timeToFraction(23.5, duration), 0.5);
    assert.equal(timeToFraction(47, duration), 1);
    assert.equal(timeToFraction(12.4, duration), timeToFraction(12.4, duration));
    assert.equal(timeToFraction(-1, duration), 0);
    assert.equal(timeToFraction(99, duration), 1);
  });
});
