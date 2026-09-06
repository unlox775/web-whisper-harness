import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_SNIP_OPTIONS } from '../../src/defaults.ts';
import { appDefaultTunerSettings, tunerMatchesAppDefaults } from './tunerDefaults.ts';

const matching = {
  autoNoiseFloor: true,
  minSnipDuration: DEFAULT_SNIP_OPTIONS.minSnipDuration,
  maxSnipDuration: DEFAULT_SNIP_OPTIONS.maxSnipDuration,
  minSilenceGapDuration: DEFAULT_SNIP_OPTIONS.minSilenceGapDuration,
};

describe('tunerMatchesAppDefaults', () => {
  it('matches auto noise floor plus min/max/gap defaults', () => {
    assert.equal(tunerMatchesAppDefaults(matching), true);
  });

  it('ignores stored quietThresholdDb when auto is on', () => {
    assert.equal(
      tunerMatchesAppDefaults({
        ...matching,
        quietThresholdDb: -12,
      }),
      true
    );
    assert.equal(
      tunerMatchesAppDefaults({
        ...matching,
        quietThresholdDb: -70,
      }),
      true
    );
  });

  it('does not match when auto noise floor is off', () => {
    assert.equal(
      tunerMatchesAppDefaults({
        ...matching,
        autoNoiseFloor: false,
        quietThresholdDb: -40,
      }),
      false
    );
  });

  it('does not match when min, max, or quiet-gap diverge', () => {
    assert.equal(
      tunerMatchesAppDefaults({ ...matching, minSnipDuration: 3 }),
      false
    );
    assert.equal(
      tunerMatchesAppDefaults({ ...matching, maxSnipDuration: 30 }),
      false
    );
    assert.equal(
      tunerMatchesAppDefaults({ ...matching, minSilenceGapDuration: 1.2 }),
      false
    );
  });
});

describe('appDefaultTunerSettings', () => {
  it('returns adaptive floor plus DEFAULT_SNIP_OPTIONS durations', () => {
    const next = appDefaultTunerSettings(-33);
    assert.equal(next.autoNoiseFloor, true);
    assert.equal(next.quietThresholdDb, -33);
    assert.equal(next.minSnipDuration, DEFAULT_SNIP_OPTIONS.minSnipDuration);
    assert.equal(next.maxSnipDuration, DEFAULT_SNIP_OPTIONS.maxSnipDuration);
    assert.equal(next.minSilenceGapDuration, DEFAULT_SNIP_OPTIONS.minSilenceGapDuration);
    assert.equal(tunerMatchesAppDefaults(next), true);
  });
});
