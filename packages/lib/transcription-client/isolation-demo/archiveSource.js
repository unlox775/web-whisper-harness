/**
 * Isolation Demo glue: turn a session-store archive into transcribe units.
 * Uses parseSessionArchive only — does not reimplement zip/manifest or write IDB.
 *
 * Step unit choice: prefer snips when snips.json / snipsWithTranscripts has
 * assemble-able audio. Slim zip (chunks only, or hasSnips flag without
 * snips.json) steps through playable chunks.
 */

export const NO_AUDIO_IN_ARCHIVE = 'No audio in archive to transcribe';
export const ARCHIVE_MOCK_REFUSE =
  'Switch to Live Groq API to transcribe this archive';

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
 * Snip rows from parseSessionArchive optional payload.
 * Prefers snipsWithTranscripts; otherwise snips.json.
 * @param {{ snips?: Array<object>, snipsWithTranscripts?: Array<object> }} parsed
 * @returns {Array<{ id: string, startTime: number, endTime: number, duration: number, chunkIds: string[] }>}
 */
export function collectArchiveSnips(parsed) {
  const joined = Array.isArray(parsed?.snipsWithTranscripts)
    ? parsed.snipsWithTranscripts
    : null;
  const rows =
    joined && joined.length > 0
      ? joined
      : Array.isArray(parsed?.snips)
        ? parsed.snips
        : [];

  return rows
    .filter((row) => row && (row.id != null || row.snipId != null))
    .map((row) => ({
      id: String(row.id ?? row.snipId),
      startTime: Number(row.startTime),
      endTime: Number(row.endTime),
      duration: Number(row.duration),
      chunkIds: Array.isArray(row.chunkIds) ? row.chunkIds.map(String) : [],
    }))
    .sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
}

/**
 * Chunks covering a snip: PWA live path uses chunkIds; empty chunkIds
 * fall back to time overlap (same idea as volume-analyzer assemble).
 * @param {{ chunkIds: string[], startTime: number, endTime: number }} snip
 * @param {Array<{ meta?: { id?: string, startTime?: number, endTime?: number, duration?: number }, blob?: Blob | null }>} chunks
 * @returns {Blob[]}
 */
export function blobsForSnip(snip, chunks) {
  const list = Array.isArray(chunks) ? chunks : [];
  let entries = [];
  if (snip.chunkIds.length > 0) {
    const byId = new Map(list.map((entry) => [String(entry.meta?.id), entry]));
    entries = snip.chunkIds.map((id) => byId.get(id)).filter(Boolean);
  } else if (Number.isFinite(snip.startTime) && Number.isFinite(snip.endTime)) {
    entries = list.filter((entry) => {
      const start = Number(entry.meta?.startTime ?? 0);
      const end = Number(
        entry.meta?.endTime ?? start + (entry.meta?.duration ?? 0)
      );
      return start < snip.endTime && end > snip.startTime;
    });
  }
  return entries.map((entry) => entry.blob).filter((blob) => blob && blob.size > 0);
}

/**
 * Prefer snips when present and assemble-able; else one unit per playable chunk.
 * @param {{ chunks?: Array<object>, snips?: Array<object>, snipsWithTranscripts?: Array<object> }} parsed
 * @returns {{ kind: 'snip' | 'chunk', units: Array<{ kind: string, id: string, label: string, startTime?: number, endTime?: number, blob: Blob }> }}
 */
export function buildArchiveTranscribeUnits(parsed) {
  const chunks = [...(parsed?.chunks || [])].sort(
    (a, b) => (a.meta?.seq ?? 0) - (b.meta?.seq ?? 0)
  );
  const snipUnits = [];
  for (const snip of collectArchiveSnips(parsed)) {
    const blobs = blobsForSnip(snip, chunks);
    if (blobs.length === 0) continue;
    snipUnits.push({
      kind: 'snip',
      id: snip.id,
      label: `snip ${snip.id}`,
      startTime: snip.startTime,
      endTime: snip.endTime,
      blob: concatArchiveAudio(blobs),
    });
  }
  if (snipUnits.length > 0) {
    return { kind: 'snip', units: snipUnits };
  }

  const chunkUnits = chunks
    .filter((entry) => entry.blob && entry.blob.size > 0)
    .map((entry) => ({
      kind: 'chunk',
      id: String(entry.meta?.id ?? `seq-${entry.meta?.seq ?? 0}`),
      label: `chunk ${entry.meta?.seq ?? entry.meta?.id ?? ''}`,
      startTime: entry.meta?.startTime,
      endTime: entry.meta?.endTime,
      blob: entry.blob,
    }));
  return { kind: 'chunk', units: chunkUnits };
}

export function describeArchiveStepUnits(result) {
  if (!result || result.error) return '';
  if (result.unitKind === 'snip') {
    return `Stepping by snips (${result.units.length}). Prefer snips when snips.json is present.`;
  }
  if (result.hasSnipsFlag) {
    return `Slim archive — hasSnips is a flag only; stepping by chunks (${result.units.length}).`;
  }
  return `Slim archive — no snips.json; stepping by chunks (${result.units.length}).`;
}

/**
 * @param {Blob} file
 * @param {(blob: Blob) => Promise<object>} parseArchive
 * @returns {Promise<{ blob: Blob, sessionId?: string, chunkCount: number, totalChunks: number, unitKind: 'snip' | 'chunk', units: Array<object>, hasSnipsJson: boolean, hasSnipsFlag: boolean } | { error: string }>}
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
  const { kind, units } = buildArchiveTranscribeUnits(parsed);
  if (units.length === 0) {
    return { error: NO_AUDIO_IN_ARCHIVE };
  }

  return {
    blob: blobs.length ? concatArchiveAudio(blobs) : units[0].blob,
    sessionId: parsed.session?.id,
    chunkCount: blobs.length,
    totalChunks: parsed.chunks?.length ?? blobs.length,
    unitKind: kind,
    units,
    hasSnipsJson: Array.isArray(parsed.snips) && parsed.snips.length > 0,
    hasSnipsFlag: Boolean(parsed.session?.hasSnips),
  };
}
