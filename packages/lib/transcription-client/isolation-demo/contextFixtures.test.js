import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { transcribeSequence } from '../src/transcribeSequence.js';
import {
  COMPARE_SNIPS,
  DEFAULT_VOCABULARY,
  GUARD_SNIPS,
  mockCompareTranscribe,
  mockGuardTranscribe,
  snipItems,
} from './contextFixtures.js';

describe('context chain fixture demo', () => {
  it('spells BrainGraft / Groq consistently only when context is on', async () => {
    const items = snipItems(COMPARE_SNIPS);
    const withCtx = await transcribeSequence(items, {
      transcribe: mockCompareTranscribe,
      vocabulary: DEFAULT_VOCABULARY,
      contextEnabled: true,
    });
    const without = await transcribeSequence(items, {
      transcribe: mockCompareTranscribe,
      vocabulary: DEFAULT_VOCABULARY,
      contextEnabled: false,
    });

    assert.equal(withCtx[0].prompt, DEFAULT_VOCABULARY);
    assert.ok(withCtx[1].prompt.startsWith(DEFAULT_VOCABULARY + '\n'));
    assert.match(withCtx[1].result.text, /Graft shipping on TeleLinux/);
    assert.match(withCtx[2].result.text, /Groq Whisper/);

    assert.equal(without[1].prompt, '');
    assert.match(without[1].result.text, /graft\? or maybe graph/);
    assert.match(without[2].result.text, /grok whisper/);
  });

  it('guard: poisoned snip 1 → snip 2 prompt is vocabulary only', async () => {
    const items = snipItems(GUARD_SNIPS);
    const results = await transcribeSequence(items, {
      transcribe: mockGuardTranscribe,
      vocabulary: DEFAULT_VOCABULARY,
      contextEnabled: true,
    });
    assert.equal(results[1].kind, 'vocab-guard');
    assert.equal(results[1].prompt, DEFAULT_VOCABULARY);
    assert.match(results[1].result.text, /Resume the Asana task/);
  });
});
