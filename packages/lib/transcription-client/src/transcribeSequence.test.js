import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CONTEXT_PROMPT_KIND } from './contextPrompt.js';
import { transcribeAudio } from './transcribeAudio.js';
import { transcribeSequence } from './transcribeSequence.js';

function blob(label) {
  return new Blob([label], { type: 'audio/mpeg' });
}

function deferred() {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('transcribeSequence ordering', () => {
  it('does not start snip N until snip N-1 has resolved', async () => {
    const gate = deferred();
    let concurrent = 0;
    let maxConcurrent = 0;
    const started = [];

    const transcribe = async (_blob, options) => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      started.push(options.prompt);
      if (started.length === 1) {
        await gate.promise;
      }
      concurrent -= 1;
      return {
        text: started.length === 1 ? 'Hello from BrainGraft' : 'TeleLinux next',
        avgLogprob: -0.2,
        noSpeechProb: 0.01,
      };
    };

    const running = transcribeSequence(
      [
        { id: 's1', blob: blob('one') },
        { id: 's2', blob: blob('two') },
      ],
      { transcribe, vocabulary: 'Asana, Groq, BrainGraft, TeleLinux', mode: 'fixture' }
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(started.length, 1);
    assert.equal(maxConcurrent, 1);
    gate.resolve();
    const results = await running;
    assert.equal(results.length, 2);
    assert.equal(maxConcurrent, 1);
    assert.equal(results[0].kind, CONTEXT_PROMPT_KIND.vocab);
    assert.equal(results[1].usedPreviousTail, true);
    assert.ok(results[1].prompt.includes('Hello from BrainGraft'));
  });

  it('reuses the pre-snip prompt when a segment is transcribed again', async () => {
    const prompts = [];
    const transcribe = async (_blob, options) => {
      prompts.push(options.prompt);
      if (prompts.length === 1) {
        return { text: 'First snip about Asana.', avgLogprob: -0.2, noSpeechProb: 0.01 };
      }
      if (prompts.length === 2) {
        return { error: 'Network failure' };
      }
      return { text: 'Retry of snip two.', avgLogprob: -0.2, noSpeechProb: 0.01 };
    };

    const firstPass = await transcribeSequence(
      [
        { id: 's1', blob: blob('one') },
        { id: 's2', blob: blob('two') },
      ],
      { transcribe, vocabulary: 'Asana', mode: 'fixture' }
    );
    assert.equal(firstPass[1].result.error, 'Network failure');

    const retry = await transcribeSequence([{ id: 's2', blob: blob('two') }], {
      transcribe,
      vocabulary: 'Asana',
      priorTranscripts: [{ text: 'First snip about Asana.', avgLogprob: -0.2, noSpeechProb: 0.01 }],
      mode: 'fixture',
    });
    assert.equal(retry[0].prompt, firstPass[1].prompt);
    assert.ok(retry[0].prompt.includes('First snip about Asana.'));
  });

  it('uses vocabulary only after a poisoned previous snip', async () => {
    let call = 0;
    const transcribe = async () => {
      call += 1;
      if (call === 1) {
        return { text: '', noSpeechProb: 0.95, avgLogprob: -1.8 };
      }
      return { text: 'Recovered speech.', avgLogprob: -0.2, noSpeechProb: 0.01 };
    };
    const results = await transcribeSequence(
      [
        { id: 's1', blob: blob('silence') },
        { id: 's2', blob: blob('talk') },
      ],
      { transcribe, vocabulary: 'Groq', mode: 'fixture' }
    );
    assert.equal(results[1].kind, CONTEXT_PROMPT_KIND.vocabGuard);
    assert.equal(results[1].prompt, 'Groq');
    assert.equal(results[1].guardReason, 'empty');
  });
});

describe('transcribeAudio Groq request (mocked)', () => {
  it('sends prompt and verbose_json, and retries with the same prompt', async () => {
    const sent = [];
    let attempt = 0;
    const fetchImpl = async (_url, init) => {
      attempt += 1;
      const fields = {};
      for (const [key, value] of init.body.entries()) {
        fields[key] = typeof value === 'string' ? value : value.name;
      }
      sent.push(fields);
      if (attempt === 1) {
        return { ok: false, status: 429, json: async () => ({ error: 'rate' }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          text: 'Hello Groq',
          language: 'en',
          segments: [{ avg_logprob: -0.25, no_speech_prob: 0.02, compression_ratio: 1.1 }],
        }),
      };
    };

    const originalSleep = globalThis.setTimeout;
    void originalSleep;

    const result = await transcribeAudio(blob('audio'), {
      mode: 'live',
      apiKey: 'gsk_test_key_not_real',
      prompt: 'Asana, Groq\nHello',
      fetch: fetchImpl,
    });

    assert.equal(sent.length, 2);
    assert.equal(sent[0].prompt, 'Asana, Groq\nHello');
    assert.equal(sent[1].prompt, 'Asana, Groq\nHello');
    assert.equal(sent[0].response_format, 'verbose_json');
    assert.equal(sent[1].response_format, 'verbose_json');
    assert.equal(result.text, 'Hello Groq');
    assert.equal(result.avgLogprob, -0.25);
    assert.equal(result.noSpeechProb, 0.02);
  });

  it('uses json when context is disabled', async () => {
    const sent = [];
    const fetchImpl = async (_url, init) => {
      const fields = {};
      for (const [key, value] of init.body.entries()) {
        fields[key] = typeof value === 'string' ? value : '[blob]';
      }
      sent.push(fields);
      return {
        ok: true,
        status: 200,
        json: async () => ({ text: 'plain', language: 'en' }),
      };
    };

    await transcribeAudio(blob('audio'), {
      mode: 'live',
      apiKey: 'gsk_test_key_not_real',
      contextEnabled: false,
      fetch: fetchImpl,
    });

    assert.equal(sent[0].response_format, 'json');
    assert.equal(sent[0].prompt, undefined);
  });
});
