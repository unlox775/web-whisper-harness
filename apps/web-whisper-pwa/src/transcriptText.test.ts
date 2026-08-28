import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildTranscriptText } from './transcriptText.ts';
import type { SnipRecord, TranscriptRecord } from './types.ts';

function snip(id: string, startTime: number): SnipRecord {
  return {
    id,
    sessionId: 's1',
    startChunkIndex: 0,
    endChunkIndex: 0,
    startTime,
    endTime: startTime + 10,
    duration: 10,
    chunkIds: ['c1'],
    confidence: 1,
    createdAt: '2026-08-28T00:00:00Z',
  };
}

function tx(snipId: string, text: string): TranscriptRecord {
  return {
    snipId,
    sessionId: 's1',
    text,
    createdAt: '2026-08-28T00:00:00Z',
    updatedAt: '2026-08-28T00:00:00Z',
  };
}

describe('buildTranscriptText', () => {
  it('concatenates snip transcriptions with a single space and no time headers', () => {
    const text = buildTranscriptText(
      [snip('a', 0), snip('b', 12), snip('c', 28)],
      [
        tx('a', 'Okay so the first thing is the grocery list.'),
        tx('b', 'We need milk, eggs, and sourdough.'),
        tx('c', 'Then call the dentist.'),
      ]
    );
    assert.equal(
      text,
      'Okay so the first thing is the grocery list. We need milk, eggs, and sourdough. Then call the dentist.'
    );
    assert.equal(text.includes('['), false);
    assert.equal(text.includes('0:00'), false);
    assert.equal(text.includes('\n'), false);
  });

  it('skips empty, whitespace-only, and missing transcripts without snip markers', () => {
    const text = buildTranscriptText(
      [snip('a', 0), snip('b', 10), snip('c', 20), snip('d', 30)],
      [tx('a', 'Hello.'), tx('b', '   '), tx('d', 'Goodbye.')]
    );
    assert.equal(text, 'Hello. Goodbye.');
    assert.equal(/snip/i.test(text), false);
    assert.equal(/failed/i.test(text), false);
  });

  it('flattens newlines inside a snip into a single wall of prose', () => {
    const text = buildTranscriptText(
      [snip('a', 0), snip('b', 10)],
      [tx('a', 'Line one.\nLine two.'), tx('b', 'Line three.')]
    );
    assert.equal(text, 'Line one. Line two. Line three.');
  });

  it('returns empty string when nothing is transcribed', () => {
    assert.equal(buildTranscriptText([], []), '');
    assert.equal(buildTranscriptText([snip('a', 0)], []), '');
  });
});
