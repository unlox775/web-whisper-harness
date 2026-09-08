/**
 * Isolation Demo glue: turn a session-store archive into transcribe units.
 * Uses parseSessionArchive only — does not reimplement zip/manifest or write IDB.
 *
 * Step unit choice: prefer snips when snips.json / snipsWithTranscripts has
 * assemble-able audio. Slim zip (chunks only, or hasSnips flag without
 * snips.json) steps through playable chunks.
 *
 * Snip audio is assembled with the shared PWA helper (time-trim to
 * [startTime, endTime], exclusive-chunk MP3 fallback). Do not send
 * concatenated overlapping ~4s chunk blobs to Groq.
 */

import {
  assembleSnipTranscriptionBlob,
  chunksOverlappingSnip,
} from '../src/assembleSnipAudio.js';

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
 * Archive chunk entries → session chunk rows for assembleSnipTranscriptionBlob.
 * @param {Array<{ meta?: { id?: string, seq?: number, startTime?: number, endTime?: number, duration?: number }, blob?: Blob | null }>} chunks
 */
export function archiveEntriesToSessionChunks(chunks) {
  return (Array.isArray(chunks) ? chunks : []).map((entry, index) => {
    const start = Number(entry.meta?.startTime ?? 0);
    const duration = Number(entry.meta?.duration ?? 0);
    const end = Number(
      entry.meta?.endTime ?? (Number.isFinite(duration) ? start + duration : start)
    );
    return {
      id: String(entry.meta?.id ?? `seq-${entry.meta?.seq ?? index}`),
      startTime: start,
      endTime: end,
      duration: Number.isFinite(duration) && duration > 0 ? duration : Math.max(0, end - start),
      blob: entry.blob,
    };
  });
}

/**
 * Chunks covering a snip. Used only to decide whether a snip is assemble-able
 * (skip purged / empty). Groq audio comes from assembleArchiveUnitBlob.
 * @param {{ chunkIds: string[], startTime: number, endTime: number }} snip
 * @param {Array<{ meta?: { id?: string, startTime?: number, endTime?: number, duration?: number }, blob?: Blob | null }>} chunks
 * @returns {Blob[]}
 */
export function blobsForSnip(snip, chunks) {
  const sessionChunks = archiveEntriesToSessionChunks(chunks);
  return chunksOverlappingSnip(snip, sessionChunks)
    .map((chunk) => chunk.blob)
    .filter((blob) => blob && blob.size > 0);
}

function snipHasAudio(snip, sessionChunks) {
  return chunksOverlappingSnip(snip, sessionChunks).some(
    (chunk) => chunk.blob && chunk.blob.size > 0
  );
}

/**
 * Time-trim (or exclusive-chunk fallback) the Groq blob for one archive unit.
 * Snip units use the shared PWA assembler. Chunk units pass the raw blob.
 * @param {{ kind: string, id?: string, startTime?: number, endTime?: number, snip?: object, archiveChunks?: object[], blob?: Blob }} unit
 * @param {{ decode?: (blob: Blob) => Promise<object> }} [options]
 */
export async function assembleArchiveUnitBlob(unit, options = {}) {
  if (!unit) {
    return { blob: new Blob([], { type: 'audio/mpeg' }), kind: 'concat-mp3', slices: [] };
  }
  if (unit.kind === 'chunk') {
    return {
      blob: unit.blob || new Blob([], { type: 'audio/mpeg' }),
      kind: 'chunk',
      slices: [],
    };
  }
  return assembleSnipTranscriptionBlob(
    {
      id: unit.snip?.id ?? unit.id,
      startTime: unit.snip?.startTime ?? unit.startTime,
      endTime: unit.snip?.endTime ?? unit.endTime,
      chunkIds: unit.snip?.chunkIds ?? unit.chunkIds ?? [],
    },
    {
      sessionChunks: archiveEntriesToSessionChunks(unit.archiveChunks || []),
      decode: options.decode,
    }
  );
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
  const sessionChunks = archiveEntriesToSessionChunks(chunks);
  const snipUnits = [];
  for (const snip of collectArchiveSnips(parsed)) {
    if (!snipHasAudio(snip, sessionChunks)) continue;
    snipUnits.push({
      kind: 'snip',
      id: snip.id,
      label: `snip ${snip.id}`,
      startTime: snip.startTime,
      endTime: snip.endTime,
      snip,
      archiveChunks: chunks,
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
    return `Stepping by snips (${result.units.length}). Audio is time-trimmed to each snip range (same as PWA).`;
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
    blob: blobs.length
      ? concatArchiveAudio(blobs)
      : units[0].blob || new Blob([], { type: 'audio/mpeg' }),
    sessionId: parsed.session?.id,
    chunkCount: blobs.length,
    totalChunks: parsed.chunks?.length ?? blobs.length,
    unitKind: kind,
    units,
    hasSnipsJson: Array.isArray(parsed.snips) && parsed.snips.length > 0,
    hasSnipsFlag: Boolean(parsed.session?.hasSnips),
  };
}
