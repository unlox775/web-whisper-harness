import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  RETENTION_WHILE_RECORDING_MIN_INTERVAL_MS,
  isNearCap,
  shouldRunRetention,
  simulateRecordingRetention,
} from './retentionPolicy.ts';

describe('shouldRunRetention', () => {
  it('always runs after Stop / boot / idle / Settings / Start', () => {
    for (const opportunity of ['stop', 'boot', 'idle', 'settings', 'start'] as const) {
      assert.equal(
        shouldRunRetention({
          opportunity,
          recording: opportunity === 'start' ? false : false,
          usedBytes: 1,
          capBytes: 100,
          lastRecordingRetentionAtMs: null,
          nowMs: 0,
        }),
        true,
        opportunity
      );
    }
  });

  it('does not run during recording when under 90% of cap', () => {
    assert.equal(isNearCap(89, 100), false);
    assert.equal(
      shouldRunRetention({
        opportunity: 'recording',
        recording: true,
        usedBytes: 89,
        capBytes: 100,
        lastRecordingRetentionAtMs: null,
        nowMs: 0,
      }),
      false
    );
  });

  it('runs during recording at ≥ 90% cap, then waits 60 s', () => {
    assert.equal(isNearCap(90, 100), true);
    assert.equal(
      shouldRunRetention({
        opportunity: 'recording',
        recording: true,
        usedBytes: 90,
        capBytes: 100,
        lastRecordingRetentionAtMs: null,
        nowMs: 0,
      }),
      true
    );
    assert.equal(
      shouldRunRetention({
        opportunity: 'recording',
        recording: true,
        usedBytes: 95,
        capBytes: 100,
        lastRecordingRetentionAtMs: 0,
        nowMs: RETENTION_WHILE_RECORDING_MIN_INTERVAL_MS - 1,
      }),
      false
    );
    assert.equal(
      shouldRunRetention({
        opportunity: 'recording',
        recording: true,
        usedBytes: 95,
        capBytes: 100,
        lastRecordingRetentionAtMs: 0,
        nowMs: RETENTION_WHILE_RECORDING_MIN_INTERVAL_MS,
      }),
      true
    );
  });
});

describe('simulateRecordingRetention', () => {
  it('100-chunk recording under cap never retains during recording; retains once after Stop', () => {
    const result = simulateRecordingRetention({
      chunks: 100,
      usedBytes: 10,
      capBytes: 100,
    });
    assert.equal(result.duringRecording, 0);
    assert.equal(result.afterStop, 1);
    assert.deepEqual(result.timestamps, []);
  });

  it('recording at ≥ 90% cap retains at most once per 60 s', () => {
    const result = simulateRecordingRetention({
      chunks: 100,
      usedBytes: 90,
      capBytes: 100,
      chunkIntervalMs: 4000,
    });
    assert.ok(result.duringRecording >= 1);
    assert.ok(result.duringRecording <= 7, `expected ≤ 7 calls over 400s, got ${result.duringRecording}`);
    for (let i = 1; i < result.timestamps.length; i += 1) {
      assert.ok(
        result.timestamps[i] - result.timestamps[i - 1] >= RETENTION_WHILE_RECORDING_MIN_INTERVAL_MS,
        `interval ${result.timestamps[i] - result.timestamps[i - 1]} < 60s`
      );
    }
    assert.equal(result.afterStop, 1);
  });
});
