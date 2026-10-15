import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CONTEXT_PROMPT_KIND,
  WHISPER_PROMPT_TOKEN_LIMIT,
  buildContextPrompt,
  createContextChain,
  estimateWhisperTokens,
  extractTranscriptionQuality,
  looksLikeHallucination,
  previousResultIsPoisoned,
  trimTranscriptTail,
} from './contextPrompt.js';

function words(count, prefix = 'word') {
  return Array.from({ length: count }, (_, i) => `${prefix}${i}`).join(' ');
}

describe('estimateWhisperTokens', () => {
  it('returns 0 for empty text', () => {
    assert.equal(estimateWhisperTokens(''), 0);
    assert.equal(estimateWhisperTokens('   '), 0);
  });

  it('is at least the word count', () => {
    const text = words(10);
    assert.ok(estimateWhisperTokens(text) >= 10);
  });
});

describe('trimTranscriptTail', () => {
  it('keeps the last 150 words at a word boundary', () => {
    const text = words(200);
    const tail = trimTranscriptTail(text, { maxWords: 150, maxTokens: 1000 });
    const got = tail.split(' ');
    assert.equal(got.length, 150);
    assert.equal(got[0], 'word50');
    assert.equal(got.at(-1), 'word199');
    assert.equal(tail.includes('word49'), false);
  });

  it('drops extra words from the start of the tail to fit the token budget', () => {
    const text = words(80);
    const tail = trimTranscriptTail(text, { maxWords: 150, maxTokens: 20, reservedTokens: 0 });
    const got = tail.split(' ');
    assert.ok(got.length < 80);
    assert.equal(got.at(-1), 'word79');
    assert.ok(estimateWhisperTokens(tail) <= 20);
  });

  it('reserves tokens for vocabulary so the tail does not overflow 224', () => {
    const vocab = words(40, 'Name');
    const reserved = estimateWhisperTokens(vocab) + 1;
    const tail = trimTranscriptTail(words(200), {
      maxWords: 150,
      maxTokens: WHISPER_PROMPT_TOKEN_LIMIT,
      reservedTokens: reserved,
    });
    assert.ok(estimateWhisperTokens(`${vocab}\n${tail}`) <= WHISPER_PROMPT_TOKEN_LIMIT);
  });
});

describe('looksLikeHallucination', () => {
  it('treats empty text as a hallucination', () => {
    assert.equal(looksLikeHallucination(''), true);
    assert.equal(looksLikeHallucination('   '), true);
  });

  it('flags a repeated thank-you loop', () => {
    assert.equal(
      looksLikeHallucination('thank you thank you thank you thank you thank you thank you'),
      true
    );
  });

  it('does not flag ordinary mixed speech', () => {
    assert.equal(
      looksLikeHallucination('Ship the overlay fix first, then check the Asana board.'),
      false
    );
  });
});

describe('previousResultIsPoisoned', () => {
  it('poisons high no_speech_prob and low avg_logprob', () => {
    assert.equal(previousResultIsPoisoned({ text: 'ok', noSpeechProb: 0.91, avgLogprob: -0.2 }), true);
    assert.equal(previousResultIsPoisoned({ text: 'ok', noSpeechProb: 0.01, avgLogprob: -1.4 }), true);
    assert.equal(previousResultIsPoisoned({ text: 'ok', noSpeechProb: 0.01, avgLogprob: -0.2 }), false);
  });

  it('poisons previous errors', () => {
    assert.equal(previousResultIsPoisoned({ error: 'Network failure' }), true);
  });

  it('ignores missing quality numbers (retry from stored text only)', () => {
    assert.equal(previousResultIsPoisoned({ text: 'Hello from Asana' }), false);
  });
});

describe('buildContextPrompt', () => {
  const vocab = 'Asana, Groq, BrainGraft, TeleLinux';

  it('puts vocabulary first and the transcript tail after a newline', () => {
    const built = buildContextPrompt({
      vocabulary: vocab,
      accumulatedTranscript: 'We should open the Asana board next.',
      previousResult: { text: 'We should open the Asana board next.', avgLogprob: -0.2, noSpeechProb: 0.01 },
    });
    assert.equal(built.kind, CONTEXT_PROMPT_KIND.vocabAndTail);
    assert.ok(built.prompt.startsWith(vocab + '\n'));
    assert.ok(built.prompt.endsWith('We should open the Asana board next.'));
    assert.equal(built.usedPreviousTail, true);
  });

  it('sends vocabulary only on the first snip', () => {
    const built = buildContextPrompt({
      vocabulary: vocab,
      isFirst: true,
      accumulatedTranscript: '',
    });
    assert.equal(built.prompt, vocab);
    assert.equal(built.kind, CONTEXT_PROMPT_KIND.vocab);
    assert.equal(built.usedPreviousTail, false);
  });

  it('falls back to vocabulary only when the previous snip looks poisoned', () => {
    const built = buildContextPrompt({
      vocabulary: vocab,
      accumulatedTranscript: 'thank you thank you thank you thank you thank you thank you',
      previousResult: {
        text: 'thank you thank you thank you thank you thank you thank you',
        avgLogprob: -0.2,
        noSpeechProb: 0.01,
      },
    });
    assert.equal(built.prompt, vocab);
    assert.equal(built.kind, CONTEXT_PROMPT_KIND.vocabGuard);
    assert.equal(built.guardReason, 'repetitive');
    assert.equal(built.usedPreviousTail, false);
  });

  it('falls back to vocabulary only on high no_speech_prob', () => {
    const built = buildContextPrompt({
      vocabulary: vocab,
      accumulatedTranscript: 'quiet room',
      previousResult: { text: 'quiet room', noSpeechProb: 0.88, avgLogprob: -0.1 },
    });
    assert.equal(built.kind, CONTEXT_PROMPT_KIND.vocabGuard);
    assert.equal(built.guardReason, 'no-speech');
    assert.equal(built.prompt, vocab);
  });

  it('returns an empty prompt when context is disabled', () => {
    const built = buildContextPrompt({
      enabled: false,
      vocabulary: vocab,
      accumulatedTranscript: 'hello',
      previousResult: { text: 'hello' },
    });
    assert.equal(built.prompt, '');
    assert.equal(built.kind, CONTEXT_PROMPT_KIND.disabled);
  });
});

describe('createContextChain', () => {
  it('does not append a poisoned snip to later tails', () => {
    const chain = createContextChain({ vocabulary: 'Asana, Groq' });
    const first = chain.promptForNext();
    assert.equal(first.kind, CONTEXT_PROMPT_KIND.vocab);
    chain.observeResult({
      text: 'thank you thank you thank you thank you thank you thank you',
      avgLogprob: -0.2,
      noSpeechProb: 0.01,
    });
    const second = chain.promptForNext();
    assert.equal(second.kind, CONTEXT_PROMPT_KIND.vocabGuard);
    chain.observeResult({ text: 'Ship the Asana fix.', avgLogprob: -0.2, noSpeechProb: 0.01 });
    const third = chain.promptForNext();
    assert.equal(third.kind, CONTEXT_PROMPT_KIND.vocabAndTail);
    assert.equal(third.prompt.includes('thank you'), false);
    assert.ok(third.prompt.includes('Ship the Asana fix.'));
  });

  it('rebuilds retry context from prior stored transcripts, not the failed snip', () => {
    const chain = createContextChain({
      vocabulary: 'Groq',
      priorTranscripts: [{ text: 'Open the Groq console.', avgLogprob: -0.2, noSpeechProb: 0.01 }],
    });
    const prompt = chain.promptForNext();
    assert.ok(prompt.prompt.includes('Open the Groq console.'));
    chain.observeResult({ error: 'Network failure' });
    const retry = createContextChain({
      vocabulary: 'Groq',
      priorTranscripts: [{ text: 'Open the Groq console.', avgLogprob: -0.2, noSpeechProb: 0.01 }],
    });
    const again = retry.promptForNext();
    assert.equal(again.prompt, prompt.prompt);
  });
});

describe('extractTranscriptionQuality', () => {
  it('averages avg_logprob and takes max no_speech_prob from segments', () => {
    const quality = extractTranscriptionQuality({
      text: 'hello',
      segments: [
        { avg_logprob: -0.2, no_speech_prob: 0.01, compression_ratio: 1.1 },
        { avg_logprob: -0.4, no_speech_prob: 0.5, compression_ratio: 1.4 },
      ],
    });
    assert.ok(Math.abs(quality.avgLogprob - -0.3) < 1e-10);
    assert.equal(quality.noSpeechProb, 0.5);
    assert.equal(quality.compressionRatio, 1.4);
  });
});
