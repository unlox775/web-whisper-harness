import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatStorageMeterLabel } from './storageMeter';

describe('formatStorageMeterLabel', () => {
  it('shows Calculating when used bytes are unknown', () => {
    const label = formatStorageMeterLabel({
      usedBytes: Number.MAX_SAFE_INTEGER,
      capBytes: 500 * 1024 * 1024,
      usedBytesKnown: false,
      usedBytesStatus: 'rebuilding',
    });
    assert.ok(!label.includes('8388608'));
    assert.match(label, /Calculating…/);
    assert.match(label, /500/);
  });

  it('shows formatted usage when known', () => {
    const label = formatStorageMeterLabel({
      usedBytes: 270 * 1024 * 1024,
      capBytes: 500 * 1024 * 1024,
      usedBytesKnown: true,
      usedBytesStatus: 'known',
    });
    assert.match(label, /270/);
    assert.match(label, /500/);
  });
});
