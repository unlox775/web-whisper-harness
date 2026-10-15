/**
 * Serial snip transcription. Snip N's Groq request starts when N-1 resolves
 * so the next prompt can use that transcript tail (or vocabulary-only if
 * the previous result is poisoned).
 *
 * Latency: wall-clock time is the sum of per-snip Groq round-trips, not
 * the max. That is the spelling-continuity tradeoff versus a parallel fan-out.
 */

import { createContextChain } from './contextPrompt.js';
import { transcribeAudio } from './transcribeAudio.js';

function asLiveOptions(options, prompt) {
  const next = { ...options, prompt };
  if (options.contextEnabled !== false && !next.responseFormat) {
    next.responseFormat = 'verbose_json';
  }
  return next;
}

/**
 * @param {Array<{ id?: string, blob: Blob }>} items
 * @param {object} options transcribeAudio options plus contextEnabled, vocabulary, transcribe
 * @returns {Promise<Array<{ id: string, result: object, prompt: string, kind: string, guardReason?: string|null }>>}
 */
export async function transcribeSequence(items, options = {}) {
  const list = Array.isArray(items) ? items : [];
  const transcribe = options.transcribe || transcribeAudio;
  const contextEnabled = options.contextEnabled !== false;
  const chain = createContextChain({
    enabled: contextEnabled,
    vocabulary: options.vocabulary,
    priorTranscripts: options.priorTranscripts,
    maxPromptWords: options.maxPromptWords,
    maxPromptTokens: options.maxPromptTokens,
    noSpeechProbMax: options.noSpeechProbMax,
    avgLogprobMin: options.avgLogprobMin,
  });

  const results = [];
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index] || {};
    const id = item.id || `snip-${index}`;
    const promptInfo = contextEnabled
      ? chain.promptForNext()
      : { prompt: '', kind: 'disabled', usedPreviousTail: false, guardReason: null };

    const result = await transcribe(
      item.blob,
      asLiveOptions(options, promptInfo.prompt)
    );

    if (contextEnabled) {
      chain.observeResult(result);
    }

    results.push({
      id,
      result,
      prompt: promptInfo.prompt,
      kind: promptInfo.kind,
      guardReason: promptInfo.guardReason || null,
      usedPreviousTail: Boolean(promptInfo.usedPreviousTail),
    });
  }
  return results;
}
