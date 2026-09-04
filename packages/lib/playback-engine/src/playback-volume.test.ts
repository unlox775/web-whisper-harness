import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyPlaybackVolume,
  clampPlaybackVolume,
  DEFAULT_PLAYBACK_VOLUME,
} from './playback-volume.js';

/**
 * iOS Safari ignores HTMLAudioElement.volume (property updates, output stays
 * at 1.0). Tests below assert we write GainNode.gain when the graph is live
 * and only fall back to element.volume when it is not.
 */
describe('clampPlaybackVolume', () => {
  it('leaves values in 0..1 unchanged', () => {
    assert.equal(clampPlaybackVolume(0), 0);
    assert.equal(clampPlaybackVolume(0.25), 0.25);
    assert.equal(clampPlaybackVolume(1), 1);
  });

  it('clamps below 0 and above 1', () => {
    assert.equal(clampPlaybackVolume(-0.2), 0);
    assert.equal(clampPlaybackVolume(-100), 0);
    assert.equal(clampPlaybackVolume(1.01), 1);
    assert.equal(clampPlaybackVolume(50), 1);
  });

  it('clamps infinities and treats NaN as silent', () => {
    assert.equal(clampPlaybackVolume(Number.POSITIVE_INFINITY), 1);
    assert.equal(clampPlaybackVolume(Number.NEGATIVE_INFINITY), 0);
    assert.equal(clampPlaybackVolume(Number.NaN), 0);
  });

  it('defaults new handles to full volume', () => {
    assert.equal(DEFAULT_PLAYBACK_VOLUME, 1);
    assert.equal(clampPlaybackVolume(DEFAULT_PLAYBACK_VOLUME), 1);
  });
});

describe('applyPlaybackVolume (GainNode vs iOS element.volume quirk)', () => {
  it('writes the clamped level to GainNode when the graph is ready', () => {
    const gain = { value: 1 };
    const element = { volume: 1 };
    const applied = applyPlaybackVolume(0.4, { gain, element, graphReady: true });
    assert.equal(applied, 0.4);
    assert.equal(gain.value, 0.4);
    assert.equal(
      element.volume,
      DEFAULT_PLAYBACK_VOLUME,
      'keep element.volume at 1 so Chrome does not double-attenuate'
    );
  });

  it('clamps then writes gain', () => {
    const gain = { value: 1 };
    applyPlaybackVolume(2.5, { gain, graphReady: true });
    assert.equal(gain.value, 1);
    applyPlaybackVolume(-1, { gain, graphReady: true });
    assert.equal(gain.value, 0);
  });

  it('falls back to HTMLAudioElement.volume only when the graph is unavailable', () => {
    const element = { volume: 1 };
    const applied = applyPlaybackVolume(0.2, { element, graphReady: false });
    assert.equal(applied, 0.2);
    assert.equal(element.volume, 0.2);
  });

  it('does not rely on element.volume alone when a gain node exists', () => {
    const gain = { value: 1 };
    const element = { volume: 1 };
    applyPlaybackVolume(0.1, { gain, element, graphReady: true });
    assert.notEqual(
      element.volume,
      0.1,
      'iOS Safari ignores HTMLAudioElement.volume; gain must carry the level'
    );
    assert.equal(gain.value, 0.1);
  });
});
