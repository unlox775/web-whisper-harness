/**
 * Structured error types for transcription operations
 */

export class TranscriptionError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'TranscriptionError';
    this.code = code;
    this.details = details;
  }
}

export const ERROR_CODES = {
  INVALID_API_KEY: 'invalid_api_key',
  NETWORK_FAILURE: 'network_failure',
  RATE_LIMIT: 'rate_limit',
  INVALID_AUDIO: 'invalid_audio',
  GROQ_ERROR: 'groq_error',
  TIMEOUT: 'timeout'
};
