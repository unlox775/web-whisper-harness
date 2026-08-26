/**
 * Fixture mode support for transcription
 * Provides mock transcripts without making real API calls
 */

const FIXTURE_TRANSCRIPT = "This is a test transcription from fixture audio";

/**
 * Return a mock transcript immediately (fixture mode)
 * 
 * @param {Blob} audioBlob - The audio blob (unused in fixture mode)
 * @param {Object} options - Fixture options
 * @param {string} options.simulateError - Optional error to simulate
 * @returns {Promise<{text: string, language?: string} | {error: string}>}
 */
export async function fixtureTranscribe(audioBlob, options = {}) {
  // Simulate errors if requested
  if (options.simulateError) {
    switch (options.simulateError) {
      case 'network_failure':
        return { error: 'Network failure: fetch timeout' };
      case 'rate_limit':
        return { error: 'Rate limit: 429 Too Many Requests' };
      case 'invalid_audio':
        return { error: 'Invalid audio format: unsupported encoding' };
      default:
        return { error: `Unknown error simulation: ${options.simulateError}` };
    }
  }

  // Return mock transcript immediately
  return {
    text: FIXTURE_TRANSCRIPT,
    language: 'en'
  };
}

/**
 * Create a small fixture audio blob for testing
 * This creates a minimal valid MP3 file (silent audio, ~1 second)
 * 
 * @returns {Blob} A small MP3 audio blob
 */
export function createFixtureAudioBlob() {
  // Minimal MP3 header for 1 second of silence at 44.1kHz
  // This is a simplified MP3 frame that most decoders will accept
  const mp3Data = new Uint8Array([
    0xFF, 0xFB, 0x90, 0x00, // MP3 sync word and header
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
  ]);

  return new Blob([mp3Data], { type: 'audio/mpeg' });
}
