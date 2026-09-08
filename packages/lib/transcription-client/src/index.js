/**
 * Groq Whisper API client for Web Whisper
 * 
 * Provides API key validation and audio transcription via Groq Whisper API.
 */

export { validateKey } from './validateKey.js';
export { transcribeAudio, filenameForAudioBlob } from './transcribeAudio.js';
export { TranscriptionError } from './errors.js';
