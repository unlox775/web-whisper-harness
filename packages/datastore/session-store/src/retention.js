/**
 * Storage-pressure retention: purge transcribed audio, keep text.
 *
 * Matches original web-whisper applyRetentionPolicy (manifest.ts):
 * never delete a snip's audio without a successful transcript; oldest
 * fully-transcribed audio first; transcripts stay.
 */

import { getDatabase } from './db.js';

/** Start purging when usage exceeds this fraction of the cap (headroom for capture). */
export const RETENTION_APPROACH_RATIO = 0.9;

/**
 * @param {unknown} text
 * @returns {boolean}
 */
export function hasValidTranscriptText(text) {
  return typeof text === 'string' && text.trim().length > 0;
}

/**
 * @param {object | null | undefined} chunk
 * @returns {boolean}
 */
export function isChunkAudioPurged(chunk) {
  if (!chunk) return false;
  if (chunk.audioPurgedAt) return true;
  if (chunk.blob && chunk.blob.size <= 0) return true;
  if (typeof chunk.sizeBytes === 'number' && chunk.sizeBytes <= 0 && chunk.blob) {
    return chunk.blob.size <= 0;
  }
  return false;
}

function chunkHasAudio(chunk) {
  if (!chunk || chunk.audioPurgedAt) return false;
  if (typeof chunk.sizeBytes === 'number' && chunk.sizeBytes <= 0) return false;
  if (chunk.blob && chunk.blob.size <= 0) return false;
  return true;
}

function usedBytesFromChunks(chunks) {
  const totalSize = chunks.reduce((sum, chunk) => sum + (chunk.sizeBytes || 0), 0);
  return Math.round(totalSize * 1.1);
}

async function currentUsedBytes() {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['chunks'], 'readonly');
    const store = transaction.objectStore('chunks');
    let totalSize = 0;
    const request = store.openCursor();
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        totalSize += cursor.value.sizeBytes || 0;
        cursor.continue();
      }
    };
    transaction.oncomplete = () => resolve(Math.round(totalSize * 1.1));
    transaction.onerror = () => reject(transaction.error);
  });
}

function getAllFromStore(db, storeName) {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) {
      resolve([]);
      return;
    }
    const transaction = db.transaction([storeName], 'readonly');
    const request = transaction.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function snipsCoveringChunk(chunk, snips) {
  const byId = snips.filter(
    (snip) => snip.sessionId === chunk.sessionId && Array.isArray(snip.chunkIds) && snip.chunkIds.includes(chunk.id)
  );
  if (byId.length > 0) return byId;
  return snips.filter((snip) => {
    if (snip.sessionId !== chunk.sessionId) return false;
    const start = typeof snip.startTime === 'number' ? snip.startTime : -Infinity;
    const end = typeof snip.endTime === 'number' ? snip.endTime : Infinity;
    return start < chunk.endTime && end > chunk.startTime;
  });
}

/**
 * Enforce storage cap by deleting audio (and volume/waveform data) for
 * snips that already have a successful transcript. Sessions and transcript
 * text are kept. Untranscribed audio is never deleted.
 *
 * @param {number} capBytes
 * @param {{ now?: number, approachRatio?: number }} [options]
 * @returns {Promise<object>}
 */
export async function enforceRetentionPolicy(capBytes, options = {}) {
  try {
    const now = typeof options.now === 'number' ? options.now : Date.now();
    const approachRatio =
      typeof options.approachRatio === 'number' ? options.approachRatio : RETENTION_APPROACH_RATIO;
    const usedBefore = await currentUsedBytes();

    const empty = {
      deletedSessions: 0,
      reclaimedBytes: 0,
      newUsedBytes: usedBefore,
      purgedChunkIds: [],
      purgedSnipIds: [],
      droppedVolumeProfiles: 0,
    };

    const safeCap = Number.isFinite(capBytes) ? Math.max(0, capBytes) : usedBefore;
    const targetBytes = Math.floor(safeCap * approachRatio);
    if (usedBefore <= targetBytes) {
      return empty;
    }

    const db = await getDatabase();
    const [chunks, snips, transcripts, sessions, volumeProfiles] = await Promise.all([
      getAllFromStore(db, 'chunks'),
      getAllFromStore(db, 'snips'),
      getAllFromStore(db, 'transcripts'),
      getAllFromStore(db, 'sessions'),
      getAllFromStore(db, 'volume-profiles'),
    ]);

    const transcriptBySnip = new Map();
    for (const record of transcripts) {
      transcriptBySnip.set(record.snipId, record);
    }
    const sessionById = new Map(sessions.map((session) => [session.id, session]));
    const profileBySession = new Map(volumeProfiles.map((profile) => [profile.sessionId, profile]));

    const eligible = [];
    for (const chunk of chunks) {
      if (!chunkHasAudio(chunk)) continue;
      const covering = snipsCoveringChunk(chunk, snips);
      if (covering.length === 0) continue;
      const allTranscribed = covering.every((snip) =>
        hasValidTranscriptText(transcriptBySnip.get(snip.id)?.text)
      );
      if (!allTranscribed) continue;
      eligible.push({ chunk, snipIds: covering.map((snip) => snip.id) });
    }

    eligible.sort((a, b) => {
      const sessionA = sessionById.get(a.chunk.sessionId);
      const sessionB = sessionById.get(b.chunk.sessionId);
      const createdA = sessionA?.createdAt || '';
      const createdB = sessionB?.createdAt || '';
      if (createdA !== createdB) return createdA < createdB ? -1 : 1;
      const seqA = a.chunk.seq ?? a.chunk.startTime ?? 0;
      const seqB = b.chunk.seq ?? b.chunk.startTime ?? 0;
      return seqA - seqB;
    });

    let usedBytes = usedBytesFromChunks(chunks);
    if (usedBytes <= targetBytes) {
      return { ...empty, newUsedBytes: usedBytes };
    }

    const purgedChunkIds = [];
    const purgedSnipIds = new Set();
    const sessionDelta = new Map();
    const sessionPurgedChunkIds = new Map();
    let reclaimedBytes = 0;

    for (const entry of eligible) {
      if (usedBytes <= targetBytes) break;
      const chunk = entry.chunk;
      const removedBytes = chunk.sizeBytes || chunk.blob?.size || 0;
      if (removedBytes <= 0) continue;

      chunk.blob = new Blob([], { type: chunk.blob?.type || 'audio/mpeg' });
      chunk.sizeBytes = 0;
      chunk.audioPurgedAt = now;
      purgedChunkIds.push(chunk.id);
      reclaimedBytes += removedBytes;
      usedBytes = Math.max(0, usedBytes - Math.round(removedBytes * 1.1));
      sessionDelta.set(
        chunk.sessionId,
        (sessionDelta.get(chunk.sessionId) || 0) + removedBytes
      );
      const sessionChunks = sessionPurgedChunkIds.get(chunk.sessionId) || new Set();
      sessionChunks.add(chunk.id);
      sessionPurgedChunkIds.set(chunk.sessionId, sessionChunks);
      entry.snipIds.forEach((id) => purgedSnipIds.add(id));
    }

    if (purgedChunkIds.length === 0) {
      return { ...empty, newUsedBytes: usedBytes };
    }

    const remainingAudioBySession = new Map();
    for (const chunk of chunks) {
      if (chunkHasAudio(chunk)) {
        remainingAudioBySession.set(
          chunk.sessionId,
          (remainingAudioBySession.get(chunk.sessionId) || 0) + 1
        );
      }
    }

    const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
    const snipsToMark = [];
    for (const snip of snips) {
      if (snip.audioPurgedAt) continue;
      if (!hasValidTranscriptText(transcriptBySnip.get(snip.id)?.text)) continue;
      const ids = Array.isArray(snip.chunkIds) ? snip.chunkIds : [];
      if (ids.length === 0) continue;
      const allGone = ids.every((chunkId) => {
        const chunk = chunkById.get(chunkId);
        return !chunk || isChunkAudioPurged(chunk);
      });
      if (allGone) {
        snip.audioPurgedAt = now;
        snipsToMark.push(snip);
        purgedSnipIds.add(snip.id);
      }
    }

    const profilesToPut = [];
    const profilesToDelete = [];
    const sessionsToPut = [];

    for (const [sessionId, removed] of sessionDelta.entries()) {
      const session = sessionById.get(sessionId);
      if (!session) continue;
      const fullyPurged = !remainingAudioBySession.get(sessionId);
      session.sizeBytes = Math.max(0, (session.sizeBytes || 0) - removed);
      session.updatedAt = new Date(now).toISOString();
      if (fullyPurged) {
        session.hasVolumeProfile = false;
      }
      sessionsToPut.push(session);

      const profile = profileBySession.get(sessionId);
      if (!profile) continue;
      if (fullyPurged) {
        profilesToDelete.push(sessionId);
        continue;
      }
      const purgedIds = sessionPurgedChunkIds.get(sessionId) || new Set();
      profile.chunkVolumes = (profile.chunkVolumes || []).filter((entry) => !purgedIds.has(entry.chunkId));
      profilesToPut.push(profile);
    }

    await new Promise((resolve, reject) => {
      const transaction = db.transaction(
        ['chunks', 'snips', 'volume-profiles', 'sessions'],
        'readwrite'
      );
      const chunkStore = transaction.objectStore('chunks');
      for (const chunk of chunks) {
        if (purgedChunkIds.includes(chunk.id)) {
          chunkStore.put(chunk);
        }
      }
      const snipStore = transaction.objectStore('snips');
      for (const snip of snipsToMark) {
        snipStore.put(snip);
      }
      const profileStore = transaction.objectStore('volume-profiles');
      for (const profile of profilesToPut) {
        profileStore.put(profile);
      }
      for (const sessionId of profilesToDelete) {
        profileStore.delete(sessionId);
      }
      const sessionStore = transaction.objectStore('sessions');
      for (const session of sessionsToPut) {
        sessionStore.put(session);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });

    return {
      deletedSessions: 0,
      reclaimedBytes,
      newUsedBytes: usedBytesFromChunks(chunks),
      purgedChunkIds,
      purgedSnipIds: Array.from(purgedSnipIds),
      droppedVolumeProfiles: profilesToDelete.length,
    };
  } catch (err) {
    return { error: 'database_unavailable' };
  }
}
