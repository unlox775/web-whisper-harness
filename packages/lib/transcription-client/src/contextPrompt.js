/**
 * Whisper context-prompt builder for snip-to-snip transcription.
 *
 * Groq /openai/v1/audio/transcriptions accepts `prompt` (max 224 tokens).
 * Whisper only attends to the end of that string. We keep an optional
 * vocabulary line at the front and trim the accumulated transcript tail
 * so the vocabulary cannot be pushed off the window.
 */

export const WHISPER_PROMPT_TOKEN_LIMIT = 224;
export const DEFAULT_MAX_PROMPT_WORDS = 150;

export const DEFAULT_POISON_THRESHOLDS = {
  noSpeechProbMax: 0.6,
  avgLogprobMin: -1.0,
};

export const CONTEXT_PROMPT_KIND = {
  disabled: 'disabled',
  empty: 'empty',
  vocab: 'vocab',
  tail: 'tail',
  vocabAndTail: 'vocab+tail',
  vocabGuard: 'vocab-guard',
};

const WORD_RE = /\S+/g;

export function splitWords(text) {
  const matches = String(text || '').match(WORD_RE);
  return matches ? matches.slice() : [];
}

/**
 * Conservative token estimate without tiktoken. Whisper's limit is 224
 * tokens; over-counting is safer than under-counting (we would rather
 * send a slightly shorter tail than overflow the window).
 */
export function estimateWhisperTokens(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return 0;
  const words = splitWords(trimmed);
  const fromWords = Math.ceil(words.length * 1.35);
  const fromChars = Math.ceil(trimmed.length / 4);
  return Math.max(fromWords, fromChars, words.length);
}

/**
 * Keep the most recent words of `text`, cut at a word boundary, within
 * both a word cap and a token budget (after reservedTokens for vocabulary).
 */
export function trimTranscriptTail(
  text,
  {
    maxWords = DEFAULT_MAX_PROMPT_WORDS,
    maxTokens = WHISPER_PROMPT_TOKEN_LIMIT,
    reservedTokens = 0,
  } = {}
) {
  const words = splitWords(text);
  if (words.length === 0) return '';
  const wordCap = Math.max(0, Number(maxWords) || 0);
  let slice = words.slice(-wordCap);
  const budget = Math.max(0, (Number(maxTokens) || 0) - Math.max(0, reservedTokens));
  while (slice.length > 0 && estimateWhisperTokens(slice.join(' ')) > budget) {
    slice = slice.slice(1);
  }
  return slice.join(' ');
}

function normalizeForRepeat(word) {
  return String(word || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function ngramRepeatRatio(words, n) {
  if (words.length < n * 3) return 0;
  const ngrams = [];
  for (let i = 0; i <= words.length - n; i += 1) {
    ngrams.push(words.slice(i, i + n).join(' ').toLowerCase());
  }
  if (ngrams.length === 0) return 0;
  const counts = new Map();
  let max = 0;
  for (const gram of ngrams) {
    const next = (counts.get(gram) || 0) + 1;
    counts.set(gram, next);
    if (next > max) max = next;
  }
  return max / ngrams.length;
}

/**
 * Empty / whitespace-only, or highly repetitive Whisper-style loops
 * ("thank you thank you…", a single word repeated, a short phrase looping).
 */
export function looksLikeHallucination(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return true;
  const words = splitWords(trimmed);
  if (words.length === 0) return true;

  const normalized = words.map(normalizeForRepeat).filter(Boolean);
  if (normalized.length >= 8) {
    const unique = new Set(normalized);
    if (unique.size <= 2) return true;
  }

  for (let n = 1; n <= 4; n += 1) {
    if (ngramRepeatRatio(words, n) >= 0.6) return true;
  }
  return false;
}

export function previousResultIsPoisoned(result, thresholds = DEFAULT_POISON_THRESHOLDS) {
  if (!result) return false;
  if (result.error) return true;
  if (looksLikeHallucination(result.text)) return true;
  const noSpeechMax = Number(thresholds.noSpeechProbMax);
  const logprobMin = Number(thresholds.avgLogprobMin);
  if (
    typeof result.noSpeechProb === 'number' &&
    Number.isFinite(result.noSpeechProb) &&
    Number.isFinite(noSpeechMax) &&
    result.noSpeechProb > noSpeechMax
  ) {
    return true;
  }
  if (
    typeof result.avgLogprob === 'number' &&
    Number.isFinite(result.avgLogprob) &&
    Number.isFinite(logprobMin) &&
    result.avgLogprob < logprobMin
  ) {
    return true;
  }
  return false;
}

export function poisonReason(result, thresholds = DEFAULT_POISON_THRESHOLDS) {
  if (!result) return null;
  if (result.error) return 'previous-error';
  if (looksLikeHallucination(result.text)) {
    return String(result.text || '').trim() ? 'repetitive' : 'empty';
  }
  const noSpeechMax = Number(thresholds.noSpeechProbMax);
  if (
    typeof result.noSpeechProb === 'number' &&
    Number.isFinite(result.noSpeechProb) &&
    result.noSpeechProb > noSpeechMax
  ) {
    return 'no-speech';
  }
  const logprobMin = Number(thresholds.avgLogprobMin);
  if (
    typeof result.avgLogprob === 'number' &&
    Number.isFinite(result.avgLogprob) &&
    result.avgLogprob < logprobMin
  ) {
    return 'low-logprob';
  }
  return null;
}

function joinPrompt(vocabulary, tail) {
  const vocab = String(vocabulary || '').trim();
  const body = String(tail || '').trim();
  if (vocab && body) return `${vocab}\n${body}`;
  return vocab || body;
}

/**
 * @param {object} options
 * @param {boolean} [options.enabled=true]
 * @param {string} [options.vocabulary]
 * @param {string} [options.accumulatedTranscript]
 * @param {object|null} [options.previousResult]
 * @param {boolean} [options.isFirst]
 * @param {number} [options.maxPromptWords]
 * @param {number} [options.maxPromptTokens]
 * @param {number} [options.noSpeechProbMax]
 * @param {number} [options.avgLogprobMin]
 */
export function buildContextPrompt(options = {}) {
  const enabled = options.enabled !== false;
  const vocabulary = String(options.vocabulary || '').trim();
  const accumulated = String(options.accumulatedTranscript || '').trim();
  const thresholds = {
    noSpeechProbMax:
      options.noSpeechProbMax ?? DEFAULT_POISON_THRESHOLDS.noSpeechProbMax,
    avgLogprobMin: options.avgLogprobMin ?? DEFAULT_POISON_THRESHOLDS.avgLogprobMin,
  };

  if (!enabled) {
    return {
      prompt: '',
      kind: CONTEXT_PROMPT_KIND.disabled,
      usedPreviousTail: false,
      guardReason: null,
    };
  }

  const vocabTokens = vocabulary ? estimateWhisperTokens(vocabulary) + 1 : 0;
  const tokenLimit = options.maxPromptTokens ?? WHISPER_PROMPT_TOKEN_LIMIT;
  if (vocabTokens > tokenLimit) {
    const clippedVocab = trimTranscriptTail(vocabulary, {
      maxWords: DEFAULT_MAX_PROMPT_WORDS,
      maxTokens: tokenLimit,
      reservedTokens: 0,
    });
    return {
      prompt: clippedVocab,
      kind: CONTEXT_PROMPT_KIND.vocab,
      usedPreviousTail: false,
      guardReason: null,
    };
  }

  if (options.isFirst === true) {
    return {
      prompt: vocabulary,
      kind: vocabulary ? CONTEXT_PROMPT_KIND.vocab : CONTEXT_PROMPT_KIND.empty,
      usedPreviousTail: false,
      guardReason: null,
    };
  }

  const guardReason = poisonReason(options.previousResult, thresholds);
  if (guardReason) {
    return {
      prompt: vocabulary,
      kind: vocabulary ? CONTEXT_PROMPT_KIND.vocabGuard : CONTEXT_PROMPT_KIND.empty,
      usedPreviousTail: false,
      guardReason,
    };
  }

  if (!accumulated) {
    return {
      prompt: vocabulary,
      kind: vocabulary ? CONTEXT_PROMPT_KIND.vocab : CONTEXT_PROMPT_KIND.empty,
      usedPreviousTail: false,
      guardReason: null,
    };
  }

  const tail = trimTranscriptTail(accumulated, {
    maxWords: options.maxPromptWords ?? DEFAULT_MAX_PROMPT_WORDS,
    maxTokens: tokenLimit,
    reservedTokens: vocabTokens,
  });

  const prompt = joinPrompt(vocabulary, tail);
  const usedPreviousTail = Boolean(tail);
  let kind = CONTEXT_PROMPT_KIND.empty;
  if (vocabulary && usedPreviousTail) kind = CONTEXT_PROMPT_KIND.vocabAndTail;
  else if (vocabulary) kind = CONTEXT_PROMPT_KIND.vocab;
  else if (usedPreviousTail) kind = CONTEXT_PROMPT_KIND.tail;

  return {
    prompt,
    kind,
    usedPreviousTail,
    guardReason: null,
  };
}

function appendAccumulated(current, text) {
  const next = String(text || '').trim();
  if (!next) return current;
  const prev = String(current || '').trim();
  return prev ? `${prev} ${next}` : next;
}

function snapshotFromTranscripts(priorTranscripts, thresholds) {
  const list = Array.isArray(priorTranscripts) ? priorTranscripts : [];
  let accumulated = '';
  let previousResult = null;
  for (const item of list) {
    if (!item || item.error) {
      previousResult = item || { error: 'missing' };
      continue;
    }
    const text = String(item.text || '');
    previousResult = {
      text,
      avgLogprob: item.avgLogprob,
      noSpeechProb: item.noSpeechProb,
    };
    if (!previousResultIsPoisoned(previousResult, thresholds)) {
      accumulated = appendAccumulated(accumulated, text);
    }
  }
  return { accumulated, previousResult, started: list.length > 0 };
}

/**
 * In-memory stepper for a snip sequence. Call `promptForNext()` then
 * `observeResult(result)` after each Groq call. Seed from already-written
 * transcripts so live ingest / retry can resume mid-session.
 */
export function createContextChain(options = {}) {
  const enabled = options.enabled !== false;
  const vocabulary = String(options.vocabulary || '');
  const thresholds = {
    noSpeechProbMax:
      options.noSpeechProbMax ?? DEFAULT_POISON_THRESHOLDS.noSpeechProbMax,
    avgLogprobMin: options.avgLogprobMin ?? DEFAULT_POISON_THRESHOLDS.avgLogprobMin,
  };
  const promptOptions = {
    enabled,
    vocabulary,
    maxPromptWords: options.maxPromptWords,
    maxPromptTokens: options.maxPromptTokens,
    ...thresholds,
  };

  let accumulated = String(options.accumulatedTranscript || '');
  let previousResult = options.previousResult ?? null;
  let started = Boolean(options.started);
  let lastPrompt = {
    prompt: '',
    kind: enabled ? CONTEXT_PROMPT_KIND.empty : CONTEXT_PROMPT_KIND.disabled,
    usedPreviousTail: false,
    guardReason: null,
  };

  function seedFromTranscripts(priorTranscripts) {
    const snap = snapshotFromTranscripts(priorTranscripts, thresholds);
    accumulated = snap.accumulated;
    previousResult = snap.previousResult;
    started = snap.started;
  }

  if (Array.isArray(options.priorTranscripts)) {
    seedFromTranscripts(options.priorTranscripts);
  }

  return {
    get accumulatedTranscript() {
      return accumulated;
    },
    get previousResult() {
      return previousResult;
    },
    get lastPrompt() {
      return lastPrompt;
    },
    seedFromTranscripts,
    promptForNext() {
      lastPrompt = buildContextPrompt({
        ...promptOptions,
        accumulatedTranscript: accumulated,
        previousResult,
        isFirst: !started,
      });
      return lastPrompt;
    },
    /**
     * Rebuild the same prompt used for the snip that just ran (retries).
     * Does not require observeResult; uses state as of promptForNext().
     */
    lastPromptOrRebuild() {
      return lastPrompt;
    },
    observeResult(result) {
      started = true;
      previousResult = result && typeof result === 'object' ? result : { error: 'invalid-result' };
      if (previousResult && !previousResult.error && !previousResultIsPoisoned(previousResult, thresholds)) {
        accumulated = appendAccumulated(accumulated, previousResult.text);
      }
    },
  };
}

/**
 * Quality fields from a Groq verbose_json transcription body.
 */
export function extractTranscriptionQuality(data) {
  const source = data && typeof data === 'object' ? data : {};
  const segments = Array.isArray(source.segments) ? source.segments : [];
  let avgLogprob = typeof source.avg_logprob === 'number' ? source.avg_logprob : null;
  let noSpeechProb = typeof source.no_speech_prob === 'number' ? source.no_speech_prob : null;
  let compressionRatio =
    typeof source.compression_ratio === 'number' ? source.compression_ratio : null;

  if (segments.length > 0) {
    const logs = segments
      .map((seg) => seg && seg.avg_logprob)
      .filter((value) => typeof value === 'number' && Number.isFinite(value));
    const ns = segments
      .map((seg) => seg && seg.no_speech_prob)
      .filter((value) => typeof value === 'number' && Number.isFinite(value));
    const cr = segments
      .map((seg) => seg && seg.compression_ratio)
      .filter((value) => typeof value === 'number' && Number.isFinite(value));
    if (logs.length) {
      avgLogprob = logs.reduce((sum, value) => sum + value, 0) / logs.length;
    }
    if (ns.length) {
      noSpeechProb = Math.max(...ns);
    }
    if (cr.length) {
      compressionRatio = Math.max(...cr);
    }
  }

  return {
    avgLogprob,
    noSpeechProb,
    compressionRatio,
  };
}
