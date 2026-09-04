import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { concatAudioBlobs, encodeSineWavBlob } from './wav.js';

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

describe('encodeSineWavBlob', () => {
  it('writes a valid mono 16-bit WAV so fixture tones are playable', async () => {
    const blob = encodeSineWavBlob(0.05, 440);
    assert.equal(blob.type, 'audio/wav');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    assert.equal(ascii(bytes, 0, 4), 'RIFF');
    assert.equal(ascii(bytes, 8, 4), 'WAVE');
    assert.equal(ascii(bytes, 12, 4), 'fmt ');
    assert.equal(ascii(bytes, 36, 4), 'data');
    assert.ok(bytes.byteLength > 44);
  });
});

describe('concatAudioBlobs', () => {
  it('remuxes WAV fixtures into one playable blob', async () => {
    const a = encodeSineWavBlob(0.02, 250);
    const b = encodeSineWavBlob(0.02, 500);
    const combined = await concatAudioBlobs([a, b]);
    assert.equal(combined.type, 'audio/wav');
    const bytes = new Uint8Array(await combined.arrayBuffer());
    assert.equal(ascii(bytes, 0, 4), 'RIFF');
    const aSize = (await a.arrayBuffer()).byteLength - 44;
    const bSize = (await b.arrayBuffer()).byteLength - 44;
    assert.equal(bytes.byteLength, 44 + aSize + bSize);
  });

  it('byte-concatenates non-WAV blobs (live MP3 path)', async () => {
    const a = new Blob([new Uint8Array([1, 2])], { type: 'audio/mpeg' });
    const b = new Blob([new Uint8Array([3, 4])], { type: 'audio/mpeg' });
    const combined = await concatAudioBlobs([a, b]);
    assert.equal(combined.type, 'audio/mpeg');
    assert.deepEqual([...new Uint8Array(await combined.arrayBuffer())], [1, 2, 3, 4]);
  });
});
