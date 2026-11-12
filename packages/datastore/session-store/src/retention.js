/**
 * Storage-pressure retention: purge transcribed audio, keep text.
 *
 * Owner-serialized housekeeping. Cheap-exits under cap with no transaction
 * and no in-flight flag. When over cap, deletes in small batches and yields
 * to queued customer writes between batches.
 */

import { getDatabase, CHUNK_BLOBS_STORE } from './db.js';
import { deleteBlobInTransaction, hasChunkBlobsStore } from './chunk-blobs.js';
import { stripBlob } from './chunk-coverage.js';
import {
  getLogByteSizes,
  pruneLogsByAgeBatched,
  pruneOldestLogsBatched,
  pruneLogsOverCountBatched,
  MAX_LOG_AGE_MS
} from './logs.js';
import { enqueueHousekeeping } from './scheduler.js';
import {
  cachedUsedBytes,
  ensureStatsCache,
  getStatsCache,
  setCapBytes,
  subtractChunkBytes,
  usedBytesFromSizes
} from './stats-cache.js';
import {
  DEFAULT_CAP_BYTES,
  MAX_LOG_COUNT,
  RETENTION_BATCH_SIZE
} from './constants.js';
/** True only while a retention readwrite batch is open. Never set on cheap exit. */
let retentionWriteInFlight = false;

/**
 * True while a retention readwrite batch is open.
 * @returns {boolean}
 */
export function isRetentionWriteInFlight() {
  return retentionWriteInFlight;
}

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

function emptyResult(usedBytes, prunedLogCount = 0, prunedLogBytes = 0) {
  return {
    deletedSessions: 0,
    reclaimedBytes: prunedLogBytes,
    newUsedBytes: usedBytes,
    purgedChunkIds: [],
    purgedSnipIds: [],
    droppedVolumeProfiles: 0,
    prunedLogCount,
    prunedLogBytes
  };
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

async function readChunkBatch(db, afterId, limit) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['chunks'], 'readonly');
    const store = transaction.objectStore('chunks');
    const range = afterId ? IDBKeyRange.lowerBound(afterId, true) : null;
    const request = range ? store.openCursor(range) : store.openCursor();
    const chunks = [];
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor || chunks.length >= limit) return;
      chunks.push(cursor.value);
      cursor.continue();
    };
    transaction.oncomplete = () => resolve(chunks);
    transaction.onerror = () => reject(transaction.error);
  });
}

async function collectEligible(db, snips, transcriptBySnip, sessionById, yieldToCustomer) {
  const eligible = [];
  let afterId = null;
  while (true) {
    const batch = await readChunkBatch(db, afterId, RETENTION_BATCH_SIZE);
    if (batch.length === 0) break;
    afterId = batch[batch.length - 1].id;
    for (const chunk of batch) {
      if (!chunkHasAudio(chunk)) continue;
      const covering = snipsCoveringChunk(chunk, snips);
      if (covering.length === 0) continue;
      const allTranscribed = covering.every((snip) =>
        hasValidTranscriptText(transcriptBySnip.get(snip.id)?.text)
      );
      if (!allTranscribed) continue;
      eligible.push({ chunk, snipIds: covering.map((snip) => snip.id) });
    }
    if (yieldToCustomer) await yieldToCustomer();
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
  return eligible;
}

async function putPurgeBatch(db, {
  chunksToPut,
  blobIdsToDelete = [],
  snipsToPut,
  profilesToPut,
  profilesToDelete,
  sessionsToPut
}) {
  if (
    chunksToPut.length === 0 &&
    blobIdsToDelete.length === 0 &&
    snipsToPut.length === 0 &&
    profilesToPut.length === 0 &&
    profilesToDelete.length === 0 &&
    sessionsToPut.length === 0
  ) {
    return;
  }
  retentionWriteInFlight = true;
  try {
    await new Promise((resolve, reject) => {
      const storeNames = ['chunks', 'snips', 'volume-profiles', 'sessions'];
      if (hasChunkBlobsStore(db)) storeNames.push(CHUNK_BLOBS_STORE);
      const transaction = db.transaction(storeNames, 'readwrite');
      const chunkStore = transaction.objectStore('chunks');
      for (const chunk of chunksToPut) chunkStore.put(stripBlob(chunk));
      for (const chunkId of blobIdsToDelete) deleteBlobInTransaction(transaction, chunkId);
      const snipStore = transaction.objectStore('snips');
      for (const snip of snipsToPut) snipStore.put(snip);
      const profileStore = transaction.objectStore('volume-profiles');
      for (const profile of profilesToPut) profileStore.put(profile);
      for (const sessionId of profilesToDelete) profileStore.delete(sessionId);
      const sessionStore = transaction.objectStore('sessions');
      for (const session of sessionsToPut) sessionStore.put(session);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    retentionWriteInFlight = false;
  }
}

async function pruneLogsOnly(options, yieldToCustomer) {
  const now = typeof options.now === 'number' ? options.now : Date.now();
  const agePrune = await pruneLogsByAgeBatched(
    { now, maxLogAgeMs: options.maxLogAgeMs },
    yieldToCustomer
  );
  if (agePrune.error) return agePrune;
  let prunedLogCount = agePrune.prunedLogCount || 0;
  let prunedLogBytes = agePrune.prunedLogBytes || 0;
  const countPrune = await pruneLogsOverCountBatched(MAX_LOG_COUNT, yieldToCustomer);
  if (!countPrune.error) {
    prunedLogCount += countPrune.prunedLogCount || 0;
    prunedLogBytes += countPrune.prunedLogBytes || 0;
  }
  return emptyResult(cachedUsedBytes(), prunedLogCount, prunedLogBytes);
}

/**
 * Retention work that may be invoked from the housekeeping queue or inline
 * from a customer write that hit QuotaExceededError. Must not enqueue.
 *
 * @param {number} capBytes
 * @param {{ now?: number, approachRatio?: number, maxLogAgeMs?: number }} options
 * @param {() => Promise<void>} yieldToCustomer
 */
export async function runRetentionUnlocked(capBytes, options = {}, yieldToCustomer = async () => {}) {
  await ensureStatsCache();
  const now = typeof options.now === 'number' ? options.now : Date.now();
  const approachRatio =
    typeof options.approachRatio === 'number' ? options.approachRatio : RETENTION_APPROACH_RATIO;
  const maxLogAgeMs =
    typeof options.maxLogAgeMs === 'number' ? options.maxLogAgeMs : MAX_LOG_AGE_MS;

  setCapBytes(Number.isFinite(capBytes) ? capBytes : DEFAULT_CAP_BYTES);

  const usedBefore = cachedUsedBytes();
  const safeCap = Number.isFinite(capBytes) ? Math.max(0, capBytes) : usedBefore;
  const targetBytes = Math.floor(safeCap * approachRatio);
  const needsAge = getStatsCache().oldestLogCreatedAt
    ? getStatsCache().oldestLogCreatedAt < new Date(now - maxLogAgeMs).toISOString()
    : false;
  const needsCount = getStatsCache().logEntryCount > MAX_LOG_COUNT;

  if (usedBefore <= targetBytes && !needsAge && !needsCount) {
    return emptyResult(usedBefore);
  }

  if (usedBefore <= targetBytes) {
    return pruneLogsOnly({ now, maxLogAgeMs }, yieldToCustomer);
  }

  const agePrune = await pruneLogsByAgeBatched({ now, maxLogAgeMs }, yieldToCustomer);
  if (agePrune.error) return agePrune;
  let prunedLogCount = agePrune.prunedLogCount || 0;
  let prunedLogBytes = agePrune.prunedLogBytes || 0;

  const countPrune = await pruneLogsOverCountBatched(MAX_LOG_COUNT, yieldToCustomer);
  if (!countPrune.error) {
    prunedLogCount += countPrune.prunedLogCount || 0;
    prunedLogBytes += countPrune.prunedLogBytes || 0;
  }

  let usedBytes = cachedUsedBytes();
  if (usedBytes <= targetBytes) {
    return emptyResult(usedBytes, prunedLogCount, prunedLogBytes);
  }

  const db = await getDatabase();
  const [snips, transcripts, sessions, volumeProfiles] = await Promise.all([
    getAllFromStore(db, 'snips'),
    getAllFromStore(db, 'transcripts'),
    getAllFromStore(db, 'sessions'),
    getAllFromStore(db, 'volume-profiles')
  ]);
  if (yieldToCustomer) await yieldToCustomer();

  const transcriptBySnip = new Map();
  for (const record of transcripts) {
    transcriptBySnip.set(record.snipId, record);
  }
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const profileBySession = new Map(volumeProfiles.map((profile) => [profile.sessionId, profile]));

  const eligible = await collectEligible(db, snips, transcriptBySnip, sessionById, yieldToCustomer);

  const logSizes = await getLogByteSizes();
  const logBytesRaw = logSizes.error ? 0 : logSizes.logBytes;
  const allChunksForSize = [];
  {
    let afterId = null;
    while (true) {
      const batch = await readChunkBatch(db, afterId, 200);
      if (batch.length === 0) break;
      afterId = batch[batch.length - 1].id;
      allChunksForSize.push(...batch);
      if (yieldToCustomer) await yieldToCustomer();
    }
  }
  usedBytes = usedBytesFromSizes(
    allChunksForSize.reduce((sum, chunk) => sum + (chunk.sizeBytes || 0), 0),
    logBytesRaw
  );

  const purgedChunkIds = [];
  const purgedSnipIds = new Set();
  const sessionPurgedChunkIds = new Map();
  const droppedProfileIds = new Set();
  let reclaimedBytes = prunedLogBytes;
  const chunkById = new Map(allChunksForSize.map((chunk) => [chunk.id, chunk]));

  for (let i = 0; i < eligible.length && usedBytes > targetBytes; i += RETENTION_BATCH_SIZE) {
    const slice = eligible.slice(i, i + RETENTION_BATCH_SIZE);
    const sessionDelta = new Map();
    const chunksToPut = [];
    const blobIdsToDelete = [];
    for (const entry of slice) {
      if (usedBytes <= targetBytes) break;
      const chunk = chunkById.get(entry.chunk.id) || entry.chunk;
      const removedBytes = chunk.sizeBytes || chunk.blob?.size || 0;
      if (removedBytes <= 0) continue;
      delete chunk.blob;
      chunk.sizeBytes = 0;
      chunk.audioPurgedAt = now;
      chunksToPut.push(chunk);
      blobIdsToDelete.push(chunk.id);
      purgedChunkIds.push(chunk.id);
      reclaimedBytes += removedBytes;
      usedBytes = Math.max(0, usedBytes - Math.round(removedBytes * 1.1));
      subtractChunkBytes(removedBytes, 0);
      sessionDelta.set(chunk.sessionId, (sessionDelta.get(chunk.sessionId) || 0) + removedBytes);
      const sessionChunks = sessionPurgedChunkIds.get(chunk.sessionId) || new Set();
      sessionChunks.add(chunk.id);
      sessionPurgedChunkIds.set(chunk.sessionId, sessionChunks);
      entry.snipIds.forEach((id) => purgedSnipIds.add(id));
    }

    const remainingAudioBySession = new Map();
    for (const chunk of allChunksForSize) {
      if (chunkHasAudio(chunk)) {
        remainingAudioBySession.set(
          chunk.sessionId,
          (remainingAudioBySession.get(chunk.sessionId) || 0) + 1
        );
      }
    }

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
      if (fullyPurged) session.hasVolumeProfile = false;
      if (!sessionsToPut.includes(session)) sessionsToPut.push(session);

      const profile = profileBySession.get(sessionId);
      if (!profile) continue;
      if (fullyPurged) {
        if (!profilesToDelete.includes(sessionId)) {
          profilesToDelete.push(sessionId);
          droppedProfileIds.add(sessionId);
        }
        continue;
      }
      const purgedIds = sessionPurgedChunkIds.get(sessionId) || new Set();
      profile.chunkVolumes = (profile.chunkVolumes || []).filter((entry) => !purgedIds.has(entry.chunkId));
      if (!profilesToPut.includes(profile)) profilesToPut.push(profile);
    }

    // Only persist this slice's chunk puts; session/snip/profile updates
    // are applied once at the end of all slices via the last iteration's
    // accumulated maps. Re-put is idempotent.
    await putPurgeBatch(db, {
      chunksToPut,
      blobIdsToDelete,
      snipsToPut: snipsToMark,
      profilesToPut,
      profilesToDelete,
      sessionsToPut
    });
    if (yieldToCustomer) await yieldToCustomer();
  }

  usedBytes = cachedUsedBytes();
  if (usedBytes > targetBytes) {
    const rawNeed = Math.ceil((usedBytes - targetBytes) / 1.1);
    const capPrune = await pruneOldestLogsBatched(rawNeed, yieldToCustomer);
    if (!capPrune.error) {
      prunedLogCount += capPrune.prunedLogCount || 0;
      prunedLogBytes += capPrune.prunedLogBytes || 0;
      reclaimedBytes += capPrune.prunedLogBytes || 0;
    }
  }

  return {
    deletedSessions: 0,
    reclaimedBytes,
    newUsedBytes: cachedUsedBytes(),
    purgedChunkIds,
    purgedSnipIds: Array.from(purgedSnipIds),
    droppedVolumeProfiles: droppedProfileIds.size,
    prunedLogCount,
    prunedLogBytes
  };
}

/**
 * Enforce storage cap by deleting audio (and volume/waveform data) for
 * snips that already have a successful transcript. Sessions and transcript
 * text are kept. Untranscribed audio is never deleted.
 *
 * Safe to call any time. Under cap (and with no stale / over-count logs)
 * this returns immediately — no in-flight flag, no transaction.
 *
 * @param {number} capBytes
 * @param {{ now?: number, approachRatio?: number, maxLogAgeMs?: number }} [options]
 * @returns {Promise<object>}
 */
export async function enforceRetentionPolicy(capBytes, options = {}) {
  try {
    await ensureStatsCache();
    const now = typeof options.now === 'number' ? options.now : Date.now();
    const approachRatio =
      typeof options.approachRatio === 'number' ? options.approachRatio : RETENTION_APPROACH_RATIO;
    const maxLogAgeMs =
      typeof options.maxLogAgeMs === 'number' ? options.maxLogAgeMs : MAX_LOG_AGE_MS;

    setCapBytes(Number.isFinite(capBytes) ? capBytes : DEFAULT_CAP_BYTES);

    const usedBefore = cachedUsedBytes();
    const safeCap = Number.isFinite(capBytes) ? Math.max(0, capBytes) : usedBefore;
    const targetBytes = Math.floor(safeCap * approachRatio);
    const cache = getStatsCache();
    const needsAge = cache.oldestLogCreatedAt
      ? cache.oldestLogCreatedAt < new Date(now - maxLogAgeMs).toISOString()
      : false;
    const needsCount = cache.logEntryCount > MAX_LOG_COUNT;

    if (usedBefore <= targetBytes && !needsAge && !needsCount) {
      return emptyResult(usedBefore);
    }

    return enqueueHousekeeping((yieldToCustomer) =>
      runRetentionUnlocked(capBytes, options, yieldToCustomer)
    );
  } catch {
    return { error: 'database_unavailable', class: 'permanent' };
  }
}
