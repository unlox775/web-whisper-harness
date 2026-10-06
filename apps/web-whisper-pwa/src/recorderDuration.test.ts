import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  coverageExtrasForSession,
  rememberRecorderDurationMs,
  rememberRecorderDurationSeconds,
} from './recorderDuration.ts';

describe('recorderDuration', () => {
  it('keeps the larger of stored recorder samples for a session', () => {
    rememberRecorderDurationSeconds('ses-rec', 45);
    rememberRecorderDurationMs('ses-rec', 40_000);
    rememberRecorderDurationSeconds('ses-rec', 90);
    assert.deepEqual(coverageExtrasForSession('ses-rec'), { recorderDurationMs: 90_000 });
  });

  it('returns empty extras when no recorder duration was remembered', () => {
    assert.deepEqual(coverageExtrasForSession('ses-unknown'), {});
  });
});
