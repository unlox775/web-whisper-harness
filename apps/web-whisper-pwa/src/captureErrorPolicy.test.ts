import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { actionForCaptureError } from './captureErrorPolicy.ts';

describe('actionForCaptureError', () => {
  it('alerts and does not stop for no_audio_received', () => {
    assert.equal(actionForCaptureError('no_audio_received'), 'alert');
  });

  it('still stops for encoding_failed', () => {
    assert.equal(actionForCaptureError('encoding_failed'), 'stop');
  });

  it('keeps store_write_failed as a toast', () => {
    assert.equal(actionForCaptureError('store_write_failed'), 'toast');
  });

  it('toasts unknown reasons instead of navigating Home', () => {
    assert.equal(actionForCaptureError('mystery'), 'toast');
  });
});
