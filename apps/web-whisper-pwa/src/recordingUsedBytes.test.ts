import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RETENTION_WHILE_RECORDING_MIN_INTERVAL_MS } from './retentionPolicy.ts';
import {
  RECORDING_USED_BYTES_OVERHEAD,
  accountEncodedChunkBytes,
  shouldRunRecordingRetention,
} from './recordingUsedBytes.ts';

describe('accountEncodedChunkBytes', () => {
  it('adds sizeBytes × 1.1 overhead for each encoded chunk', () => {
    assert.equal(RECORDING_USED_BYTES_OVERHEAD, 1.1);
    assert.equal(accountEncodedChunkBytes(1000, 100), 1000 + Math.round(100 * 1.1));
    assert.equal(accountEncodedChunkBytes(0, 65245), Math.round(65245 * 1.1));
  });

  it('ignores missing or non-positive byteLength so persist stays on the hot path', () => {
    assert.equal(accountEncodedChunkBytes(50, 0), 50);
    assert.equal(accountEncodedChunkBytes(50, -1), 50);
    assert.equal(accountEncodedChunkBytes(50, Number.NaN), 50);
  });
});

describe('shouldRunRecordingRetention', () => {
  const capBytes = 100;

  it('does not retain when usedBytes is unknown (no getStorageStats on chunkEncoded)', () => {
    assert.equal(
      shouldRunRecordingRetention({
        usedBytesKnown: false,
        usedBytes: 0,
        capBytes,
        lastRecordingRetentionAtMs: null,
        nowMs: 0,
      }),
      false
    );
    assert.equal(
      shouldRunRecordingRetention({
        usedBytesKnown: false,
        usedBytes: 99,
        capBytes,
        lastRecordingRetentionAtMs: null,
        nowMs: 0,
      }),
      false
    );
  });

  it('does not retain during recording when last-known usedBytes is under 90%', () => {
    assert.equal(
      shouldRunRecordingRetention({
        usedBytesKnown: true,
        usedBytes: 89,
        capBytes,
        lastRecordingRetentionAtMs: null,
        nowMs: 0,
      }),
      false
    );
  });

  it('retains at ≥ 90% of cap, then waits 60 s, without fetching stats', () => {
    const gate = (usedBytes: number, lastRecordingRetentionAtMs: number | null, nowMs: number) =>
      shouldRunRecordingRetention({
        usedBytesKnown: true,
        usedBytes,
        capBytes,
        lastRecordingRetentionAtMs,
        nowMs,
      });
    assert.equal(gate(90, null, 0), true);
    assert.equal(gate(95, 0, RETENTION_WHILE_RECORDING_MIN_INTERVAL_MS - 1), false);
    assert.equal(gate(95, 0, RETENTION_WHILE_RECORDING_MIN_INTERVAL_MS), true);
  });

  it('100-chunk under-cap take never retains; estimate grows without a library scan', () => {
    let used = 10;
    let lastRecordingRetentionAtMs: number | null = null;
    let duringRecording = 0;
    for (let seq = 0; seq < 100; seq += 1) {
      used = accountEncodedChunkBytes(used, 100);
      const nowMs = seq * 4000;
      if (
        shouldRunRecordingRetention({
          usedBytesKnown: true,
          usedBytes: used,
          capBytes: 1_000_000,
          lastRecordingRetentionAtMs,
          nowMs,
        })
      ) {
        duringRecording += 1;
        lastRecordingRetentionAtMs = nowMs;
      }
    }
    assert.equal(duringRecording, 0);
    assert.equal(used, 10 + 100 * Math.round(100 * 1.1));
  });
});
