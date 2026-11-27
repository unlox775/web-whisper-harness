import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AUDIO_IMPORT_ACCEPT,
  audioImportErrorCopy,
  audioImportStatusCopy,
  audioImportSuccessCopy,
  importWroteNothing,
  shortFileName,
} from './importAudio';

describe('import audio file helpers', () => {
  it('accept covers iOS picker types', () => {
    for (const part of ['audio/*', '.m4a', '.mp3', '.wav', '.webm']) {
      assert.ok(AUDIO_IMPORT_ACCEPT.split(',').includes(part), part);
    }
  });

  it('status copy shows decoding then chunk progress', () => {
    assert.equal(audioImportStatusCopy('memo.m4a', null), 'Importing memo.m4a… decoding audio');
    assert.equal(
      audioImportStatusCopy('memo.m4a', {
        phase: 'encoding',
        chunksEncoded: 3,
        chunksSaved: 2,
        totalChunks: 7,
        duration: 26,
      }),
      'Importing memo.m4a… 2 / 7 chunks saved'
    );
  });

  it('shortens long names but keeps the extension', () => {
    const short = shortFileName('Very long Voice Memo name from yesterday.m4a', 20);
    assert.ok(short.length <= 20, short);
    assert.ok(short.endsWith('.m4a'));
  });

  it('success copy depends on Groq key', () => {
    assert.equal(audioImportSuccessCopy('a.mp3', 65, true), 'Imported a.mp3 (1:05). Transcribing…');
    assert.match(audioImportSuccessCopy('a.mp3', 65, false), /Add a Groq key/);
  });

  it('error copy and wrote-nothing classification', () => {
    assert.match(audioImportErrorCopy('x.m4a', 'decode_failed'), /can't decode that audio format/);
    assert.equal(importWroteNothing('decode_failed'), true);
    assert.equal(importWroteNothing('empty_audio'), true);
    assert.equal(importWroteNothing(undefined), false);
    assert.equal(importWroteNothing('store_busy'), false);
  });
});
