/**
 * Isolation Demo glue for session-store parseSessionArchive.
 * Maps parsed archive rows onto the same ChunkWithBlob shape live/fixture use.
 * Does not reimplement zip/manifest parsing.
 */

import type { ChunkWithBlob } from './volumeAnalyzer';

export const ARCHIVE_ERROR_CANNOT_READ = 'Cannot read archive';
export const ARCHIVE_ERROR_UNSUPPORTED = 'Not a supported session archive';
export const ARCHIVE_ERROR_NO_AUDIO = 'No audio in archive to analyze';

export type ArchiveChunkEntry = {
  meta: {
    id: string;
    seq: number;
    startTime: number;
    endTime: number;
    duration: number;
  };
  blob: Blob | null;
};

export type ParsedSessionArchive = {
  error?: string;
  formatVersion?: number;
  exportedAt?: string;
  session?: { id: string; chunkCount?: number; duration?: number };
  notes?: string;
  chunks?: ArchiveChunkEntry[];
};

const UNSUPPORTED_PARSE_ERRORS = new Set([
  'kind_mismatch',
  'unsupported_format_version',
  'invalid_manifest',
  'missing_manifest',
  'corrupt_json',
]);

/**
 * Map parseSessionArchive error codes to the spec's user-visible copy.
 */
export function messageForArchiveParseError(error: string | undefined): string {
  if (error && UNSUPPORTED_PARSE_ERRORS.has(error)) {
    return ARCHIVE_ERROR_UNSUPPORTED;
  }
  return ARCHIVE_ERROR_CANNOT_READ;
}

/**
 * Keep playable (non-null blob) chunks, in seq order, as ChunkWithBlob.
 * Purged rows (blob: null) are skipped.
 */
export function mapArchiveChunksToAnalyze(parsed: ParsedSessionArchive): ChunkWithBlob[] {
  const entries = parsed.chunks ?? [];
  return entries
    .filter((entry): entry is ArchiveChunkEntry & { blob: Blob } => entry.blob != null)
    .map((entry) => ({
      id: String(entry.meta.id),
      seq: Number(entry.meta.seq),
      startTime: Number(entry.meta.startTime),
      endTime: Number(entry.meta.endTime),
      duration: Number(entry.meta.duration),
      blob: entry.blob,
    }))
    .sort((a, b) => a.seq - b.seq);
}
