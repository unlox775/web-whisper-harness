export type ArchiveImportError = { error: string };

export type ImportedArchiveKind = 'slim' | 'debug' | 'partial';

export type ImportedArchiveFlags = {
  hasSnips?: boolean;
  hasTranscript?: boolean;
  hasVolumeProfile?: boolean;
};

export const ARCHIVE_IMPORT_ACCEPT = '.zip,application/zip,application/x-zip-compressed';

export const ARCHIVE_IMPORT_HELP =
  'Slim zip (chunks + manifest) imports as a playable session. Debug zip also restores snips, transcripts, and volume profile when those files are present. Import always creates a new session id so an existing recording is never overwritten.';

export function isArchiveImportError(value: unknown): value is ArchiveImportError {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'error' in value &&
      typeof (value as { error: unknown }).error === 'string'
  );
}

/**
 * Map session-store import/parse error codes to Isolation Demo-style copy.
 */
export function archiveImportErrorMessage(error: string): string {
  if (error === 'unsupported_format_version') {
    return 'Import failed: unsupported formatVersion (this app reads v1 only).';
  }
  if (
    error === 'kind_mismatch' ||
    error === 'missing_manifest' ||
    error === 'not_a_zip' ||
    error === 'corrupt_json' ||
    error === 'invalid_manifest'
  ) {
    return `Import failed: ${error}. Choose a web-whisper session zip.`;
  }
  if (error === 'database_unavailable') {
    return 'Storage unavailable. Check browser storage permissions.';
  }
  if (error === 'id_collision') {
    return 'Import failed: a session with this id already exists. Import creates a new session id.';
  }
  return `Archive error: ${error}`;
}

export function importedArchiveKind(flags: ImportedArchiveFlags): ImportedArchiveKind {
  const hasSnips = Boolean(flags.hasSnips);
  const hasTranscript = Boolean(flags.hasTranscript);
  const hasVolumeProfile = Boolean(flags.hasVolumeProfile);
  if (hasSnips && hasTranscript && hasVolumeProfile) return 'debug';
  if (!hasSnips && !hasTranscript && !hasVolumeProfile) return 'slim';
  return 'partial';
}

export function importedArchiveSuccessMessage(flags: ImportedArchiveFlags): string {
  const kind = importedArchiveKind(flags);
  if (kind === 'debug') {
    return 'Imported session with chunks, snips, transcripts, and volume profile.';
  }
  if (kind === 'slim') {
    return 'Imported session. Slim zip: playable audio only. Snips, transcripts, and volume profile are absent until re-analyzed.';
  }
  const extras = [
    flags.hasSnips ? 'snips' : null,
    flags.hasTranscript ? 'transcripts' : null,
    flags.hasVolumeProfile ? 'volume profile' : null,
  ].filter(Boolean);
  return `Imported session. Restored ${extras.join(', ')} from the zip. Missing extras stay absent until re-analyzed.`;
}

/**
 * Import a session-store v1 zip into the current PWA DB.
 * Always new IDs — never preserveIds / overwrite.
 */
export async function importSessionZipFile(
  file: Blob,
  importArchive: (blob: Blob) => Promise<{ sessionId: string; chunkIds: string[] } | ArchiveImportError>
): Promise<{ sessionId: string; chunkIds: string[] } | ArchiveImportError> {
  const result = await importArchive(file);
  if (isArchiveImportError(result)) return result;
  if (!result?.sessionId) {
    return { error: 'invalid_manifest' };
  }
  return result;
}
