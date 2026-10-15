import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { promptChainFromTranscripts } from './transcriptionContext.ts';
import type { SnipRecord, TranscriptRecord } from './types.ts';

function snip(id: string, startTime: number): SnipRecord {
  return {
    id,
    sessionId: 'ses-1',
    startChunkIndex: 0,
    endChunkIndex: 0,
    startTime,
    endTime: startTime + 10,
    duration: 10,
    chunkIds: [],
    confidence: 1,
    createdAt: '2026-10-15T00:00:00.000Z',
  };
}

function tx(snipId: string, text: string): TranscriptRecord {
  return {
    snipId,
    sessionId: 'ses-1',
    text,
    createdAt: '2026-10-15T00:00:00.000Z',
    updatedAt: '2026-10-15T00:00:00.000Z',
  };
}

describe('promptChainFromTranscripts', () => {
  it('rebuilds retry context from snips before the retried one', () => {
    const snips = [snip('b', 10), snip('a', 0), snip('c', 20)];
    const transcripts = [tx('a', 'Hello from Asana.'), tx('b', 'BrainGraft next.')];
    const chain = promptChainFromTranscripts(
      snips,
      transcripts,
      { contextEnabled: true, vocabulary: 'Asana, BrainGraft' },
      'c'
    );
    const prompt = chain.promptForNext();
    assert.equal(prompt.kind, 'vocab+tail');
    assert.ok(prompt.prompt.startsWith('Asana, BrainGraft\n'));
    assert.ok(prompt.prompt.includes('Hello from Asana.'));
    assert.ok(prompt.prompt.includes('BrainGraft next.'));
  });

  it('does not include the retried snip in the prompt', () => {
    const snips = [snip('a', 0), snip('b', 10)];
    const transcripts = [tx('a', 'First.'), tx('b', 'Should not appear.')];
    const chain = promptChainFromTranscripts(
      snips,
      transcripts,
      { contextEnabled: true, vocabulary: 'Groq' },
      'b'
    );
    const prompt = chain.promptForNext();
    assert.ok(prompt.prompt.includes('First.'));
    assert.equal(prompt.prompt.includes('Should not appear.'), false);
  });
});
