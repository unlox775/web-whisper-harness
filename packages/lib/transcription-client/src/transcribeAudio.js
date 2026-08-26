/**
 * Transcribe audio using Groq Whisper API
 */

import { fixtureTranscribe } from './fixture.js';

const GROQ_API_ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-large-v3';
const REQUEST_TIMEOUT = 30000; // 30 seconds
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff: 1s, 2s, 4s

/**
 * Transcribe audio to text using Groq Whisper API
 * 
 * @param {Blob} audioBlob - MP3 audio data to transcribe
 * @param {Object} options - Transcription options
 * @param {string} options.apiKey - Groq API key (required for live mode)
 * @param {'fixture' | 'live'} options.mode - Operation mode (default: 'fixture')
 * @param {string} options.language - Optional language hint (ISO 639-1 code)
 * @param {string} options.simulateError - Error to simulate in fixture mode
 * @returns {Promise<{text: string, language?: string} | {error: string}>}
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
    formData.append('file', audioBlob, 'audio.mp3');
    formData.append('model', WHISPER_MODEL);
    formData.append('response_format', 'json');
    
    if (options.language) {
      formData.append('language', options.language);
    }

    const response = await fetch(GROQ_API_ENDPOINT, {
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
      return {
        text: data.text || '',
        language: data.language
      };
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
