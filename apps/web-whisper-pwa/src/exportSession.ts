import type { ChunkRecord } from './types';

export type ArchiveExportError = { error: string };

export function isArchiveExportError(value: unknown): value is ArchiveExportError {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'error' in value &&
      typeof (value as { error: unknown }).error === 'string'
  );
}

export function archiveExportErrorMessage(error: string): string {
  if (error === 'session_not_found') {
    return 'Session not found. It may have been deleted.';
  }
  if (error === 'database_unavailable') {
    return 'Storage unavailable. Check browser storage permissions.';
  }
  return `Export failed: ${error}`;
}

export function chunkLooksPurged(chunk: Pick<ChunkRecord, 'audioPurgedAt' | 'sizeBytes'>): boolean {
  if (chunk.audioPurgedAt) return true;
  return typeof chunk.sizeBytes === 'number' && chunk.sizeBytes <= 0;
}

/** Empty / all-purged sessions still export; helper copy must not claim playable audio. */
export function archiveExportHelperText(
  chunks: Array<Pick<ChunkRecord, 'audioPurgedAt' | 'sizeBytes'>>
): string | null {
  if (chunks.length === 0) {
    return 'No audio chunks — export is metadata only.';
  }
  if (chunks.every(chunkLooksPurged)) {
    return 'Archive has metadata, no audio bytes.';
  }
  return null;
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
