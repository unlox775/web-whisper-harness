import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SAVING_BEHIND_NOTICE,
  STORAGE_WRITE_FAILED_BANNER,
  actionForCaptureError,
  bannerForPersistEvent,
} from './captureErrorPolicy.ts';

describe('actionForCaptureError', () => {
  it('alerts and does not stop for no_audio_received', () => {
    assert.equal(actionForCaptureError('no_audio_received'), 'alert');
  });

  it('still stops for encoding_failed', () => {
    assert.equal(actionForCaptureError('encoding_failed'), 'stop');
  });

  it('logs store_write_failed instead of toasting a loss banner', () => {
    assert.equal(actionForCaptureError('store_write_failed'), 'log');
  });

  it('toasts unknown reasons instead of navigating Home', () => {
    assert.equal(actionForCaptureError('mystery'), 'toast');
  });
});

describe('bannerForPersistEvent', () => {
  it('does not show Storage write failed for store_write_failed alone', () => {
    assert.equal(
      bannerForPersistEvent({ type: 'captureError', reason: 'store_write_failed' }),
      null
    );
  });

  it('shows Storage write failed only on chunk_lost', () => {
    assert.equal(
      bannerForPersistEvent({ type: 'chunk_lost', reason: 'quota_exceeded' }),
      STORAGE_WRITE_FAILED_BANNER
    );
  });

  it('shows a softer Saving is behind notice on persist_backpressure', () => {
    assert.equal(
      bannerForPersistEvent({ type: 'persist_backpressure' }),
      SAVING_BEHIND_NOTICE
    );
  });
});
