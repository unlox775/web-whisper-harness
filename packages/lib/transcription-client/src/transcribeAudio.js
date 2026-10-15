/**
 * Transcribe audio using Groq Whisper API
 */

import { extractTranscriptionQuality } from './contextPrompt.js';
import { fixtureTranscribe } from './fixture.js';

const GROQ_API_ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-large-v3';
const REQUEST_TIMEOUT = 30000; // 30 seconds
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff: 1s, 2s, 4s

/**
 * Groq infers format from the upload filename. PWA Transcribe may send a
 * time-trimmed WAV snip (not a raw MP3 chunk).
 */
export function filenameForAudioBlob(audioBlob) {
  const type = String(audioBlob?.type || '').toLowerCase();
  if (type.includes('wav')) return 'audio.wav';
  if (type.includes('webm')) return 'audio.webm';
  if (type.includes('mp4') || type.includes('m4a')) return 'audio.m4a';
  return 'audio.mp3';
}

/**
 * Transcribe audio to text using Groq Whisper API
 * 
 * @param {Blob} audioBlob - One assembled snip (time-trimmed WAV or MP3)
 * @param {Object} options - Transcription options
 * @param {string} options.apiKey - Groq API key (required for live mode)
 * @param {'fixture' | 'live'} options.mode - Operation mode (default: 'fixture')
 * @param {string} options.language - Optional language hint (ISO 639-1 code)
 * @param {string} options.prompt - Optional Whisper context (vocabulary + prior tail)
 * @param {boolean} options.contextEnabled - When not false, request verbose_json for quality
 * @param {'json' | 'verbose_json'} options.responseFormat - Override Groq response_format
 * @param {typeof fetch} options.fetch - Injected fetch (tests)
 * @param {string} options.simulateError - Error to simulate in fixture mode
 * @returns {Promise<{text: string, language?: string, avgLogprob?: number, noSpeechProb?: number} | {error: string}>}
 */
export async function transcribeAudio(audioBlob, options = {}) {
  const mode = options.mode || 'fixture';

  // Fixture mode: return mock transcript without API call
  if (mode === 'fixture') {
    return fixtureTranscribe(audioBlob, options);
  }

  // Live mode: make real API call
  if (!options.apiKey) {
    return { error: 'Invalid API key' };
  }

  // Attempt transcription with retry logic
  let lastError = null;
  const maxAttempts = 1 + RETRY_DELAYS.length; // 1 initial + retries

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await attemptTranscription(audioBlob, options);
      
      // Success - return result
      if (result.text !== undefined) {
        return result;
      }
      
      // Error - check if retryable
      if (result.error) {
        lastError = result;
        
        // Don't retry permanent errors
        if (isPermanentError(result.error)) {
          return result;
        }
        
        // Retry transient errors
        if (attempt < maxAttempts - 1) {
          await sleep(RETRY_DELAYS[attempt]);
          continue;
        }
      }
    } catch (error) {
      // Network or unexpected error
      lastError = { error: 'Network failure' };
      
      if (attempt < maxAttempts - 1) {
        await sleep(RETRY_DELAYS[attempt]);
        continue;
      }
    }
  }

  return lastError || { error: 'Network failure' };
}

/**
 * Attempt a single transcription request
 * 
 * @private
 */
async function attemptTranscription(audioBlob, options) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    // Prepare multipart/form-data request
    const formData = new FormData();
    formData.append('file', audioBlob, filenameForAudioBlob(audioBlob));
    formData.append('model', WHISPER_MODEL);
    const responseFormat = resolveResponseFormat(options);
    formData.append('response_format', responseFormat);

    if (options.language) {
      formData.append('language', options.language);
    }

    const prompt = String(options.prompt || '').trim();
    if (prompt) {
      formData.append('prompt', prompt);
    }

    const fetchImpl = options.fetch || globalThis.fetch;
    const response = await fetchImpl(GROQ_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${options.apiKey}`
      },
      body: formData,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // Parse response based on status code
    if (response.ok) {
      const data = await response.json();
      const quality = extractTranscriptionQuality(data);
      const result = {
        text: data.text || '',
        language: data.language,
      };
      if (quality.avgLogprob != null) result.avgLogprob = quality.avgLogprob;
      if (quality.noSpeechProb != null) result.noSpeechProb = quality.noSpeechProb;
      if (quality.compressionRatio != null) result.compressionRatio = quality.compressionRatio;
      return result;
    }

    // Handle error responses
    if (response.status === 400) {
      return { error: 'Invalid audio format' };
    }

    if (response.status === 401 || response.status === 403) {
      return { error: 'Invalid API key' };
    }

    if (response.status === 429) {
      return { error: 'Rate limit exceeded' };
    }

    if (response.status >= 500) {
      return { error: 'Groq service unavailable' };
    }

    return { error: `Unexpected response: ${response.status}` };

  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      return { error: 'Network failure' };
    }
    
    throw error;
  }
}

function resolveResponseFormat(options) {
  if (options.responseFormat === 'json' || options.responseFormat === 'verbose_json') {
    return options.responseFormat;
  }
  return options.contextEnabled === false ? 'json' : 'verbose_json';
}

/**
 * Check if an error is permanent (should not retry)
 * 
 * @private
 */
function isPermanentError(errorMessage) {
  return errorMessage === 'Invalid API key' || 
         errorMessage === 'Invalid audio format';
}

/**
 * Sleep for specified milliseconds
 * 
 * @private
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
