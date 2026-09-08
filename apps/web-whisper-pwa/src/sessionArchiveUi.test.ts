import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sessionArchiveToolsVisible } from './sessionArchiveUi.ts';

describe('sessionArchiveToolsVisible', () => {
  it('hides import / export session zip when developer mode is off', () => {
    assert.equal(sessionArchiveToolsVisible(false), false);
  });

  it('shows import / export session zip when developer mode is on', () => {
    assert.equal(sessionArchiveToolsVisible(true), true);
  });
});
