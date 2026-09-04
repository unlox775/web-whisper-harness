/**
 * Isolation Demo glue: turn a session-store archive into one transcribe blob.
 * Uses parseSessionArchive only — does not reimplement zip/manifest or write IDB.
 */

export const NO_AUDIO_IN_ARCHIVE = 'No audio in archive to transcribe';

/**
 * Map parseSessionArchive error codes to the spec's user-visible copy.
 * @param {string} errorCode
 * @returns {string}
 */
export function archiveParseErrorMessage(errorCode) {
  if (errorCode === 'not_a_zip' || errorCode === 'corrupt_json') {
    return 'Cannot read archive';
  }
  if (
    errorCode === 'unsupported_format_version' ||
    errorCode === 'kind_mismatch' ||
    errorCode === 'missing_manifest' ||
    errorCode === 'invalid_manifest'
  ) {
    return 'Unsupported or invalid archive';
  }
  return 'Cannot read archive';
}

/**
 * Non-null chunk blobs in seq order (purged / empty skipped).
 * @param {{ chunks?: Array<{ meta?: { seq?: number }, blob?: Blob | null }> }} parsed
 * @returns {Blob[]}
 */
export function collectArchiveAudioBlobs(parsed) {
  const entries = [...(parsed?.chunks || [])].sort(
    (a, b) => (a.meta?.seq ?? 0) - (b.meta?.seq ?? 0)
  );
  return entries
    .map((entry) => entry.blob)
    .filter((blob) => blob && blob.size > 0);
}

/**
 * Same concatenation model as live mic: one Blob for transcribeAudio.
 * @param {Blob[]} blobs
 * @returns {Blob}
 */
export function concatArchiveAudio(blobs) {
  const mime = blobs[0]?.type || 'audio/mpeg';
  return new Blob(blobs, { type: mime });
}

/**
 * @param {Blob} file
 * @param {(blob: Blob) => Promise<object>} parseArchive
 * @returns {Promise<{ blob: Blob, sessionId?: string, chunkCount: number, totalChunks: number } | { error: string }>}
 */
export async function loadSessionArchiveForTranscribe(file, parseArchive) {
  let parsed;
  try {
    parsed = await parseArchive(file);
  } catch {
    return { error: 'Cannot read archive' };
  }

  if (!parsed || parsed.error) {
    return { error: archiveParseErrorMessage(parsed?.error) };
  }

  const blobs = collectArchiveAudioBlobs(parsed);
  if (blobs.length === 0) {
    return { error: NO_AUDIO_IN_ARCHIVE };
  }

  return {
    blob: concatArchiveAudio(blobs),
    sessionId: parsed.session?.id,
    chunkCount: blobs.length,
    totalChunks: parsed.chunks?.length ?? blobs.length,
  };
}
