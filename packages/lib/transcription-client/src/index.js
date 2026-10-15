/**
 * Groq Whisper API client for Web Whisper
 * 
 * Provides API key validation and audio transcription via Groq Whisper API.
 */

export { validateKey } from './validateKey.js';
export { transcribeAudio, filenameForAudioBlob } from './transcribeAudio.js';
export { transcribeSequence } from './transcribeSequence.js';
export {
  CONTEXT_PROMPT_KIND,
  DEFAULT_MAX_PROMPT_WORDS,
  DEFAULT_POISON_THRESHOLDS,
  WHISPER_PROMPT_TOKEN_LIMIT,
  buildContextPrompt,
  createContextChain,
  estimateWhisperTokens,
  extractTranscriptionQuality,
  looksLikeHallucination,
  previousResultIsPoisoned,
  poisonReason,
  trimTranscriptTail,
} from './contextPrompt.js';
export { TranscriptionError } from './errors.js';
export {
  assembleSnipTranscriptionBlob,
  chunksOverlappingSnip,
  describeSnipTranscriptionJobs,
  encodePcmWav,
  exclusiveChunkIdsForSnip,
  planSnipAudioSlices,
  rangesOverlap,
  sliceDuration,
  transcriptionWindowsOverlap,
  wavDurationSeconds,
} from './assembleSnipAudio.js';
