/**
 * Fixture snip sequences for the Context chain Isolation Demo.
 * Mock transcribe inspects the Whisper prompt so with/without context
 * (and the poisoning guard) are visible without a Groq key.
 */

export const DEFAULT_VOCABULARY = 'Asana, Groq, BrainGraft, TeleLinux';

export const COMPARE_SNIPS = [
  {
    id: 's1',
    label: 'Snip 1',
    spoken: 'I was talking to Dave about the Asana board for Brain',
  },
  {
    id: 's2',
    label: 'Snip 2',
    spoken: 'Graft shipping on TeleLinux next week.',
  },
  {
    id: 's3',
    label: 'Snip 3',
    spoken: 'Groq Whisper should keep the casing.',
  },
];

export const GUARD_SNIPS = [
  {
    id: 'g1',
    label: 'Snip 1 (silence / loop)',
    spoken: '(no speech — Whisper hallucinates a thank-you loop)',
  },
  {
    id: 'g2',
    label: 'Snip 2',
    spoken: 'Resume the Asana task after the pause.',
  },
];

function qualityOk() {
  return { avgLogprob: -0.22, noSpeechProb: 0.02 };
}

function promptLooksContextual(prompt) {
  const text = String(prompt || '');
  if (!text.trim()) return false;
  return (
    text.includes('\n') ||
    text.includes('Asana board') ||
    text.includes('BrainGraft') ||
    text.includes('TeleLinux')
  );
}

/**
 * Mock Groq: spelling/casing follows the prompt when context is present.
 */
export async function mockCompareTranscribe(blob, options = {}) {
  const id = await blob.text();
  const prompt = options.prompt || '';
  const contextual = promptLooksContextual(prompt);

  if (id === 's1') {
    return {
      text: 'I was talking to Dave about the Asana board for Brain',
      language: 'en',
      ...qualityOk(),
    };
  }
  if (id === 's2') {
    if (contextual) {
      return {
        text: 'Graft shipping on TeleLinux next week.',
        language: 'en',
        ...qualityOk(),
      };
    }
    return {
      text: 'graft? or maybe graph. Anyway grok is fast.',
      language: 'en',
      ...qualityOk(),
    };
  }
  if (id === 's3') {
    if (contextual) {
      return {
        text: 'Groq Whisper should keep the casing.',
        language: 'en',
        ...qualityOk(),
      };
    }
    return {
      text: 'grok whisper should keep the casing.',
      language: 'en',
      ...qualityOk(),
    };
  }
  return { text: '', language: 'en', ...qualityOk() };
}

export async function mockGuardTranscribe(blob, options = {}) {
  const id = await blob.text();
  const prompt = String(options.prompt || '');
  if (id === 'g1') {
    return {
      text: 'thank you thank you thank you thank you thank you thank you',
      language: 'en',
      avgLogprob: -1.5,
      noSpeechProb: 0.93,
    };
  }
  if (id === 'g2') {
    if (prompt.includes('thank you')) {
      return {
        text: 'thank you thank you thank you',
        language: 'en',
        avgLogprob: -1.2,
        noSpeechProb: 0.4,
      };
    }
    return {
      text: 'Resume the Asana task after the pause.',
      language: 'en',
      ...qualityOk(),
    };
  }
  return { text: '', language: 'en', ...qualityOk() };
}

export function snipItems(snips) {
  return snips.map((snip) => ({
    id: snip.id,
    blob: new Blob([snip.id], { type: 'audio/mpeg' }),
    label: snip.label,
    spoken: snip.spoken,
  }));
}
