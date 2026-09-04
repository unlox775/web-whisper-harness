/**
 * Versioned session audio archive (zip) export / parse / import.
 *
 * Format v1: application/zip containing manifest.json + chunks/NNN.<ext>
 * for chunks that still have audio. Optional snips/transcripts/volume-profile
 * JSON files are behind export flags that default OFF.
 */

import { getDatabase, generateId } from './db.js';
import { createSession, deleteSession, getSession } from './sessions.js';
import { getChunk, getChunksForSession, writeChunk } from './chunks.js';
import { getSnipsForSession, writeSnip } from './snips.js';
import { getTranscriptsForSession, writeTranscript } from './transcripts.js';
import { getVolumeProfile, writeVolumeProfile } from './volume-profiles.js';
import { isChunkAudioPurged } from './retention.js';
import { createZip, readZip } from './zip.js';

export const SESSION_ARCHIVE_KIND = 'web-whisper-session-archive';
export const SESSION_ARCHIVE_FORMAT_VERSION = 1;
export const SESSION_ARCHIVE_MIME = 'application/zip';
export const SESSION_ARCHIVE_MIME_ALIASES = ['application/zip', 'application/x-zip-compressed'];

const OPTIONAL_SNIPS = 'snips.json';
const OPTIONAL_TRANSCRIPTS = 'transcripts.json';
const OPTIONAL_VOLUME = 'volume-profile.json';

/**
 * Download filename: web-whisper-session-&lt;id&gt;-&lt;timestamp&gt;.zip
 * `&lt;timestamp&gt;` is Unix epoch milliseconds.
 * @param {string} sessionId
 * @param {number} [timestampMs]
 * @returns {string}
 */
export function sessionArchiveFilename(sessionId, timestampMs = Date.now()) {
  return `web-whisper-session-${sessionId}-${timestampMs}.zip`;
}

/**
 * @param {string | undefined} mime
 * @returns {string}
 */
export function extensionForMime(mime) {
  const normalized = (mime || '').toLowerCase();
  if (normalized === 'audio/mpeg' || normalized === 'audio/mp3') return 'mp3';
  if (normalized === 'audio/webm') return 'webm';
  if (normalized === 'audio/mp4' || normalized === 'audio/aac' || normalized === 'audio/x-m4a') return 'm4a';
  if (normalized === 'audio/ogg' || normalized === 'audio/opus') return 'ogg';
  if (normalized === 'audio/wav' || normalized === 'audio/wave' || normalized === 'audio/x-wav') return 'wav';
  return 'bin';
}

function padSeq(seq) {
  return String(seq ?? 0).padStart(3, '0');
}

function sessionRowFields(session) {
  return {
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    duration: session.duration,
    chunkCount: session.chunkCount,
    sizeBytes: session.sizeBytes,
    hasVolumeProfile: Boolean(session.hasVolumeProfile),
    hasSnips: Boolean(session.hasSnips),
    hasTranscript: Boolean(session.hasTranscript),
    status: session.status
  };
}

function chunkHasExportableAudio(chunk) {
  if (!chunk || isChunkAudioPurged(chunk)) return false;
  if (!chunk.blob || chunk.blob.size <= 0) return false;
  return true;
}

async function blobToUint8(blob) {
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

function decodeJsonBytes(bytes) {
  try {
    return { value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { error: 'corrupt_json' };
  }
}

function asBlobInput(input) {
  if (input instanceof Blob) return input;
  if (input instanceof Uint8Array) {
    return new Blob([input], { type: SESSION_ARCHIVE_MIME });
  }
  if (input instanceof ArrayBuffer) {
    return new Blob([input], { type: SESSION_ARCHIVE_MIME });
  }
  return null;
}

/**
 * Export a session as a versioned zip Blob (type application/zip).
 * Optional includes default false. Errors: { error: 'session_not_found' | 'database_unavailable' }.
 *
 * @param {string} sessionId
 * @param {{ includeSnips?: boolean, includeTranscripts?: boolean, includeVolumeProfile?: boolean, notes?: string }} [options]
 * @returns {Promise<Blob | { error: string }>}
 */
export async function exportSessionArchive(sessionId, options = {}) {
  const includeSnips = options.includeSnips === true;
  const includeTranscripts = options.includeTranscripts === true;
  const includeVolumeProfile = options.includeVolumeProfile === true;
  const notes = typeof options.notes === 'string' ? options.notes : undefined;

  let session;
  try {
    await getDatabase();
    session = await getSession(sessionId);
  } catch {
    return { error: 'database_unavailable' };
  }
  if (!session) {
    return { error: 'session_not_found' };
  }

  const listed = await getChunksForSession(sessionId);
  if (listed.error) {
    return { error: listed.error };
  }

  const exportedAt = new Date().toISOString();
  const encoder = new TextEncoder();
  const zipEntries = [];
  const manifestChunks = [];

  for (const meta of listed.chunks || []) {
    const full = await getChunk(meta.id);
    const mime = full?.blob?.type || 'audio/mpeg';
    const hasAudio = chunkHasExportableAudio(full);
    const ext = extensionForMime(mime);
    const file = hasAudio ? `chunks/${padSeq(meta.seq)}.${ext}` : null;
    manifestChunks.push({
      id: meta.id,
      seq: meta.seq,
      startTime: meta.startTime,
      endTime: meta.endTime,
      duration: meta.duration,
      mime,
      sizeBytes: hasAudio ? (full?.sizeBytes ?? meta.sizeBytes) : 0,
      audioPurgedAt: full?.audioPurgedAt || meta.audioPurgedAt || null,
      file
    });
    if (hasAudio && file) {
      zipEntries.push({
        name: file,
        data: await blobToUint8(full.blob)
      });
    }
  }

  const manifest = {
    formatVersion: SESSION_ARCHIVE_FORMAT_VERSION,
    exportedAt,
    kind: SESSION_ARCHIVE_KIND,
    ...sessionRowFields(session),
    chunks: manifestChunks
  };
  if (notes !== undefined) {
    manifest.notes = notes;
  }

  zipEntries.unshift({
    name: 'manifest.json',
    data: encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`)
  });

  if (includeSnips) {
    const snips = await getSnipsForSession(sessionId);
    if (snips.error) return { error: snips.error };
    zipEntries.push({
      name: OPTIONAL_SNIPS,
      data: encoder.encode(`${JSON.stringify(snips.snips || [], null, 2)}\n`)
    });
  }
  if (includeTranscripts) {
    const transcripts = await getTranscriptsForSession(sessionId);
    if (transcripts.error) return { error: transcripts.error };
    zipEntries.push({
      name: OPTIONAL_TRANSCRIPTS,
      data: encoder.encode(`${JSON.stringify(transcripts.transcripts || [], null, 2)}\n`)
    });
  }
  if (includeVolumeProfile) {
    const profile = await getVolumeProfile(sessionId);
    zipEntries.push({
      name: OPTIONAL_VOLUME,
      data: encoder.encode(`${JSON.stringify(profile, null, 2)}\n`)
    });
  }

  const zipBytes = createZip(zipEntries);
  return new Blob([zipBytes], { type: SESSION_ARCHIVE_MIME });
}

/**
 * Parse an archive without writing IndexedDB.
 * @param {Blob | Uint8Array | ArrayBuffer} blob
 * @returns {Promise<object>}
 */
export async function parseSessionArchive(blob) {
  const asBlob = asBlobInput(blob);
  if (!asBlob) {
    return { error: 'not_a_zip' };
  }

  let bytes;
  try {
    bytes = await blobToUint8(asBlob);
  } catch {
    return { error: 'not_a_zip' };
  }

  const zip = readZip(bytes);
  if (zip.error) {
    return zip;
  }

  const manifestBytes = zip.files.get('manifest.json');
  if (!manifestBytes) {
    return { error: 'missing_manifest' };
  }

  const decoded = decodeJsonBytes(manifestBytes);
  if (decoded.error) {
    return decoded;
  }
  const manifest = decoded.value;
  if (!manifest || typeof manifest !== 'object') {
    return { error: 'invalid_manifest' };
  }
  if (manifest.kind !== SESSION_ARCHIVE_KIND) {
    return { error: 'kind_mismatch' };
  }
  if (typeof manifest.formatVersion !== 'number' || !Number.isFinite(manifest.formatVersion)) {
    return { error: 'invalid_manifest' };
  }
  if (manifest.formatVersion !== SESSION_ARCHIVE_FORMAT_VERSION) {
    return { error: 'unsupported_format_version' };
  }
  if (!manifest.id || !Array.isArray(manifest.chunks)) {
    return { error: 'invalid_manifest' };
  }

  const chunks = [];
  for (const meta of manifest.chunks) {
    let audio = null;
    if (meta.file) {
      const fileBytes = zip.files.get(meta.file);
      if (fileBytes && fileBytes.length > 0) {
        const copy = new Uint8Array(fileBytes);
        audio = new Blob([copy], { type: meta.mime || 'audio/mpeg' });
      }
    }
    chunks.push({
      meta: {
        id: meta.id,
        seq: meta.seq,
        startTime: meta.startTime,
        endTime: meta.endTime,
        duration: meta.duration,
        mime: meta.mime || 'audio/mpeg',
        sizeBytes: meta.sizeBytes,
        audioPurgedAt: meta.audioPurgedAt || null,
        file: meta.file ?? null
      },
      blob: audio
    });
  }

  const result = {
    formatVersion: manifest.formatVersion,
    exportedAt: manifest.exportedAt,
    session: sessionRowFields(manifest),
    chunks
  };
  if (typeof manifest.notes === 'string') {
    result.notes = manifest.notes;
  }

  if (zip.files.has(OPTIONAL_SNIPS)) {
    const parsed = decodeJsonBytes(zip.files.get(OPTIONAL_SNIPS));
    if (parsed.error) return parsed;
    if (Array.isArray(parsed.value)) {
      result.snips = parsed.value;
    }
  }
  if (zip.files.has(OPTIONAL_TRANSCRIPTS)) {
    const parsed = decodeJsonBytes(zip.files.get(OPTIONAL_TRANSCRIPTS));
    if (parsed.error) return parsed;
    if (Array.isArray(parsed.value)) {
      result.transcripts = parsed.value;
    }
  }
  if (zip.files.has(OPTIONAL_VOLUME)) {
    const parsed = decodeJsonBytes(zip.files.get(OPTIONAL_VOLUME));
    if (parsed.error) return parsed;
    if (parsed.value && typeof parsed.value === 'object') {
      result.volumeProfile = parsed.value;
    }
  }

  return result;
}

async function sessionIdExists(sessionId) {
  return Boolean(await getSession(sessionId));
}

async function chunkIdExists(chunkId) {
  return Boolean(await getChunk(chunkId));
}

/**
 * Import a parsed archive into the current DB.
 * Default: new session + chunk IDs. Optional preserveIds keeps archive IDs
 * when they do not collide (id_collision unless overwrite === true).
 * Optional JSON files are imported when present in the zip.
 *
 * @param {Blob | Uint8Array | ArrayBuffer} blob
 * @param {{ preserveIds?: boolean, overwrite?: boolean }} [options]
 * @returns {Promise<{ sessionId: string, chunkIds: string[] } | { error: string }>}
 */
export async function importSessionArchive(blob, options = {}) {
  const parsed = await parseSessionArchive(blob);
  if (parsed.error) {
    return parsed;
  }

  const preserveIds = options.preserveIds === true;
  const overwrite = options.overwrite === true;

  try {
    await getDatabase();
  } catch {
    return { error: 'database_unavailable' };
  }

  if (preserveIds) {
    const collision =
      (await sessionIdExists(parsed.session.id)) ||
      (await Promise.all(parsed.chunks.map((entry) => chunkIdExists(entry.meta.id)))).some(Boolean);
    if (collision && !overwrite) {
      return { error: 'id_collision' };
    }
    if (collision && overwrite) {
      const deleted = await deleteSession(parsed.session.id);
      if (deleted.error && deleted.error !== 'session_not_found') {
        return deleted;
      }
    }
  }

  const chunkIdMap = new Map();
  let sessionId;
  const chunkIds = [];

  if (preserveIds) {
    sessionId = parsed.session.id;
    const now = new Date().toISOString();
    const putError = await putSessionRecord({
      ...parsed.session,
      id: sessionId,
      updatedAt: now,
      chunkCount: 0,
      sizeBytes: 0,
      hasVolumeProfile: false,
      hasSnips: false,
      hasTranscript: false
    });
    if (putError) return putError;

    for (const entry of parsed.chunks) {
      const written = await putChunkRecord(sessionId, entry, entry.meta.id);
      if (written.error) return written;
      chunkIdMap.set(entry.meta.id, entry.meta.id);
      chunkIds.push(entry.meta.id);
    }
  } else {
    const created = await createSession();
    if (created.error) return created;
    sessionId = created.id;

    for (const entry of parsed.chunks) {
      const blobForWrite = entry.blob || new Blob([], { type: entry.meta.mime || 'audio/mpeg' });
      const written = await writeChunk(sessionId, {
        seq: entry.meta.seq,
        startTime: entry.meta.startTime,
        endTime: entry.meta.endTime,
        duration: entry.meta.duration,
        blob: blobForWrite,
        sizeBytes: entry.blob ? entry.blob.size : 0
      });
      if (written.error) return written;
      chunkIdMap.set(entry.meta.id, written.chunkId);
      chunkIds.push(written.chunkId);

      if (!entry.blob || entry.meta.audioPurgedAt) {
        const patched = await patchChunkPurged(written.chunkId, entry.meta.audioPurgedAt);
        if (patched?.error) return patched;
      }
    }

    const patchedSession = await patchImportedSession(sessionId, parsed.session, {
      hasSnips: Boolean(parsed.snips?.length),
      hasTranscript: Boolean(parsed.transcripts?.length),
      hasVolumeProfile: Boolean(parsed.volumeProfile)
    });
    if (patchedSession?.error) return patchedSession;
  }

  if (Array.isArray(parsed.snips)) {
    const snipIdMap = new Map();
    for (const snip of parsed.snips) {
      const remappedChunkIds = (snip.chunkIds || []).map((id) => chunkIdMap.get(id) || id);
      if (preserveIds) {
        const putError = await putSnipRecord({
          ...snip,
          sessionId,
          chunkIds: remappedChunkIds
        });
        if (putError) return putError;
        snipIdMap.set(snip.id, snip.id);
      } else {
        const written = await writeSnip(sessionId, {
          startChunkIndex: snip.startChunkIndex,
          endChunkIndex: snip.endChunkIndex,
          startTime: snip.startTime,
          endTime: snip.endTime,
          duration: snip.duration,
          chunkIds: remappedChunkIds,
          confidence: snip.confidence
        });
        if (written.error) return written;
        snipIdMap.set(snip.id, written.snipId);
      }
    }

    if (Array.isArray(parsed.transcripts)) {
      for (const transcript of parsed.transcripts) {
        const snipId = snipIdMap.get(transcript.snipId) || transcript.snipId;
        if (preserveIds) {
          const putError = await putTranscriptRecord({
            ...transcript,
            snipId,
            sessionId
          });
          if (putError) return putError;
        } else {
          const written = await writeTranscript(snipId, transcript.text || '');
          if (written.error) return written;
        }
      }
    }
  }

  if (parsed.volumeProfile && parsed.volumeProfile.chunkVolumes) {
    const remapped = {
      chunkVolumes: parsed.volumeProfile.chunkVolumes.map((entry) => ({
        ...entry,
        chunkId: chunkIdMap.get(entry.chunkId) || entry.chunkId
      }))
    };
    if (preserveIds) {
      const putError = await putVolumeProfileRecord({
        ...parsed.volumeProfile,
        sessionId,
        chunkVolumes: remapped.chunkVolumes
      });
      if (putError) return putError;
    } else {
      const written = await writeVolumeProfile(sessionId, remapped);
      if (written.error) return written;
    }
  }

  if (preserveIds) {
    const patchedSession = await patchImportedSession(sessionId, parsed.session, {
      hasSnips: Boolean(parsed.snips?.length),
      hasTranscript: Boolean(parsed.transcripts?.length),
      hasVolumeProfile: Boolean(parsed.volumeProfile),
      chunkCount: parsed.chunks.length,
      sizeBytes: parsed.chunks.reduce((sum, entry) => sum + (entry.blob?.size || 0), 0)
    });
    if (patchedSession?.error) return patchedSession;
  }

  return { sessionId, chunkIds };
}

function idbPut(storeName, record) {
  return new Promise(async (resolve) => {
    try {
      const db = await getDatabase();
      const tx = db.transaction([storeName], 'readwrite');
      tx.objectStore(storeName).put(record);
      tx.oncomplete = () => resolve(null);
      tx.onerror = () => resolve({ error: 'database_unavailable' });
    } catch {
      resolve({ error: 'database_unavailable' });
    }
  });
}

function putSessionRecord(session) {
  return idbPut('sessions', session);
}

function putChunkRecord(sessionId, entry, chunkId) {
  const hasAudio = Boolean(entry.blob && entry.blob.size > 0);
  const chunk = {
    id: chunkId,
    sessionId,
    seq: entry.meta.seq,
    startTime: entry.meta.startTime,
    endTime: entry.meta.endTime,
    duration: entry.meta.duration,
    blob: entry.blob || new Blob([], { type: entry.meta.mime || 'audio/mpeg' }),
    sizeBytes: hasAudio ? entry.blob.size : 0
  };
  if (entry.meta.audioPurgedAt || !hasAudio) {
    chunk.audioPurgedAt = entry.meta.audioPurgedAt || Date.now();
  }
  return idbPut('chunks', chunk);
}

function putSnipRecord(snip) {
  return idbPut('snips', snip);
}

function putTranscriptRecord(transcript) {
  return idbPut('transcripts', transcript);
}

function putVolumeProfileRecord(profile) {
  return idbPut('volume-profiles', profile);
}

async function patchChunkPurged(chunkId, audioPurgedAt) {
  const chunk = await getChunk(chunkId);
  if (!chunk) return { error: 'database_unavailable' };
  chunk.blob = new Blob([], { type: chunk.blob?.type || 'audio/mpeg' });
  chunk.sizeBytes = 0;
  chunk.audioPurgedAt = audioPurgedAt || Date.now();
  return idbPut('chunks', chunk);
}

async function patchImportedSession(sessionId, archiveSession, flags) {
  const session = await getSession(sessionId);
  if (!session) return { error: 'database_unavailable' };
  const now = new Date().toISOString();
  return putSessionRecord({
    ...session,
    createdAt: archiveSession.createdAt || session.createdAt,
    updatedAt: now,
    duration: archiveSession.duration ?? session.duration,
    chunkCount: flags.chunkCount ?? session.chunkCount,
    sizeBytes: flags.sizeBytes ?? session.sizeBytes,
    status: archiveSession.status || session.status,
    hasSnips: flags.hasSnips,
    hasTranscript: flags.hasTranscript,
    hasVolumeProfile: flags.hasVolumeProfile
  });
}
