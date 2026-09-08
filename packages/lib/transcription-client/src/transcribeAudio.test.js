import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filenameForAudioBlob } from './transcribeAudio.js';

describe('filenameForAudioBlob', () => {
  it('uses a .wav name for time-trimmed snip blobs from the PWA', () => {
    assert.equal(filenameForAudioBlob(new Blob([], { type: 'audio/wav' })), 'audio.wav');
  });

  it('keeps .mp3 for raw capture chunks and concat fallbacks', () => {
    assert.equal(filenameForAudioBlob(new Blob([], { type: 'audio/mpeg' })), 'audio.mp3');
    assert.equal(filenameForAudioBlob(new Blob([])), 'audio.mp3');
  });
});
