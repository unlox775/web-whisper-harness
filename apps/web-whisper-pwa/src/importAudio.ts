/**
 * Import audio file (Home → CAPTURE). Pure helpers; the flow lives in context.tsx.
 * Spec: docs/specs/20261127053801-feedback-import-audio-file.md
 */
import { formatDuration } from './format';

/** iOS Safari needs explicit extensions for the Files / Voice Memos picker. */
export const AUDIO_IMPORT_ACCEPT = 'audio/*,.m4a,.mp3,.wav,.webm,.aac,.mp4';

export type AudioImportProgress = {
  phase: 'decoding' | 'encoding' | 'saving';
  chunksEncoded: number;
  chunksSaved: number;
  totalChunks: number;
  duration: number;
};

export function shortFileName(name: string, max = 28): string {
  const clean = (name || 'audio file').trim() || 'audio file';
  if (clean.length <= max) return clean;
  const dot = clean.lastIndexOf('.');
  const ext = dot > 0 && clean.length - dot <= 6 ? clean.slice(dot) : '';
  return `${clean.slice(0, max - ext.length - 1)}…${ext}`;
}

export function audioImportStatusCopy(name: string, progress: AudioImportProgress | null): string {
  const label = shortFileName(name);
  if (!progress || progress.phase === 'decoding' || progress.totalChunks === 0) {
    return `Importing ${label}… decoding audio`;
  }
  return `Importing ${label}… ${progress.chunksSaved} / ${progress.totalChunks} chunks saved`;
}

export function audioImportSuccessCopy(
  name: string,
  durationSeconds: number,
  canTranscribe: boolean
): string {
  const label = shortFileName(name);
  const tail = canTranscribe ? 'Transcribing…' : 'Add a Groq key in Settings to transcribe.';
  return `Imported ${label} (${formatDuration(durationSeconds)}). ${tail}`;
}

export function audioImportErrorCopy(name: string, code: string | undefined, message?: string): string {
  const label = shortFileName(name);
  if (code === 'decode_failed') {
    return `Could not read ${label}. This browser can't decode that audio format.`;
  }
  if (code === 'empty_audio') {
    return `${label} has no audio to import.`;
  }
  if (code === 'audio_context_unavailable') {
    return 'This browser cannot decode audio files (Web Audio unavailable).';
  }
  if (code === 'database_unavailable') {
    return 'Storage unavailable. Check browser storage permissions.';
  }
  return `Import failed for ${label}: ${message || code || 'unknown error'}`;
}

/** Codes where capture-engine wrote nothing, so the empty session may be removed. */
export function importWroteNothing(code: string | undefined): boolean {
  return code === 'decode_failed' || code === 'empty_audio' || code === 'audio_context_unavailable';
}
