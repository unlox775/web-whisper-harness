/**
 * Chunk operations
 *
 * Metadata lives in `chunks`. Audio bytes live in `chunk-blobs`.
 * `getChunksForSession` / `getChunkCoverage` never deserialize audio.
 */

import { getDatabase, generateId, CHUNK_BLOBS_STORE } from './db.js';
import { getSession } from './sessions.js';
import { enqueueCustomer } from './scheduler.js';
import {
  addChunkBytes,
  ensureStatsCache,
  getStatsCache,
  persistStatsCache,
  subtractChunkBytes
} from './stats-cache.js';
import { WRITE_WAIT_BUDGET_MS } from './constants.js';
import { runRetentionUnlocked } from './retention.js';
import {
  applySavedChunkToCoverage,
  assignCoverageToSession,
  chunkDurationMs,
  computeCoverageFromChunkMetas,
  coverageFromSession,
  hasPersistedCoverage,
  publicChunkMeta,
  stripBlob
} from './chunk-coverage.js';
import { deleteBlobInTransaction, hasChunkBlobsStore, putBlobInTransaction } from './chunk-blobs.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function classifyTxnError(error) {
  const name = error?.name || '';
  const message = String(error?.message || '');
  if (name === 'QuotaExceededError' || /quota/i.test(message)) {
    return 'quota';
  }
  if (name === 'AbortError' || name === 'InvalidStateError' || /abort/i.test(message)) {
    return 'transient';
  }
  if (name === 'NotFoundError' || /not found|closing|closed/i.test(message)) {
    return 'unavailable';
  }
  return 'transient';
}

function chunkWriteStores(db) {
  const names = ['chunks', 'sessions'];
  if (hasChunkBlobsStore(db)) names.push(CHUNK_BLOBS_STORE);
  return names;
}

function assembleChunk(meta, blobRow) {
  if (!meta) return null;
  const leftover = meta.blob;
  const mime = blobRow?.mime || leftover?.type || 'audio/mpeg';
  let blob = blobRow?.blob;
  if (!blob && leftover && leftover.size > 0) blob = leftover;
  if (!blob) blob = new Blob([], { type: mime });
  return { ...stripBlob(meta), blob };
}

/**
 * Look up an existing chunk by (sessionId, seq).
 * @param {string} sessionId
 * @param {number} seq
 * @returns {Promise<object | null>}
 */
export async function getChunkBySessionSeq(sessionId, seq) {
  try {
    const db = await getDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction(['chunks'], 'readonly');
      const index = transaction.objectStore('chunks').index('by-sessionId-seq');
      const request = index.get(IDBKeyRange.only([sessionId, seq]));
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function persistChunk(sessionId, chunkData) {
  const db = await getDatabase();
  const now = new Date().toISOString();

  return new Promise((resolve) => {
    const transaction = db.transaction(chunkWriteStores(db), 'readwrite');
    const chunksStore = transaction.objectStore('chunks');
    const sessionsStore = transaction.objectStore('sessions');
    const seqIndex = chunksStore.index('by-sessionId-seq');

    let settled = false;
    let result = null;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const existingReq = seqIndex.get(IDBKeyRange.only([sessionId, chunkData.seq]));
    existingReq.onsuccess = () => {
      const existing = existingReq.result;
      if (existing) {
        result = { chunkId: existing.id, idempotent: true };
        return;
      }

      const sessionReq = sessionsStore.get(sessionId);
      sessionReq.onsuccess = () => {
        const session = sessionReq.result;
        if (!session) {
          result = { error: 'session_not_found', sessionId, class: 'permanent' };
          return;
        }
        const chunkId = generateId('chunk');
        const meta = {
          id: chunkId,
          sessionId,
          seq: chunkData.seq,
          startTime: chunkData.startTime,
          endTime: chunkData.endTime,
          duration: chunkData.duration,
          sizeBytes: chunkData.sizeBytes
        };
        if (chunkData.audioPurgedAt) {
          meta.audioPurgedAt = chunkData.audioPurgedAt;
        }
        chunksStore.add(meta);
        putBlobInTransaction(transaction, {
          id: chunkId,
          sessionId,
          blob: chunkData.blob
        });
        session.chunkCount += 1;
        session.sizeBytes += chunkData.sizeBytes;
        session.duration = Math.max(session.duration || 0, chunkData.endTime);
        session.updatedAt = now;
        applySavedChunkToCoverage(session, chunkData);
        sessionsStore.put(session);
        result = { chunkId };
      };
    };

    transaction.oncomplete = () => {
      const done = () => finish(result || { error: 'database_unavailable', class: 'permanent' });
      if (result && result.chunkId && !result.idempotent) {
        Promise.resolve(addChunkBytes(chunkData.sizeBytes || 0, 1))
          .then(() => persistStatsCache())
          .catch(() => {})
          .then(done);
        return;
      }
      done();
    };

    const onFail = () => {
      const kind = classifyTxnError(transaction.error);
      if (kind === 'quota') {
        finish({ error: 'quota_exceeded', class: 'permanent' });
        return;
      }
      if (kind === 'unavailable') {
        finish({ error: 'database_unavailable', class: 'permanent' });
        return;
      }
      finish({ error: 'store_busy', class: 'transient', retryable: true });
    };

    transaction.onerror = onFail;
    transaction.onabort = onFail;
  });
}

async function writeChunkUnlocked(sessionId, chunkData) {
  await ensureStatsCache();

  const started = Date.now();
  let delay = 15;
  let attemptedRetention = false;

  while (true) {
    const result = await persistChunk(sessionId, chunkData);
    if (!result.error) {
      return result;
    }
    if (result.error === 'session_not_found') {
      return result;
    }
    if (result.error === 'quota_exceeded') {
      if (!attemptedRetention) {
        attemptedRetention = true;
        const cache = getStatsCache();
        await runRetentionUnlocked(cache.capBytes, {}, async () => {});
        continue;
      }
      const cache = getStatsCache();
      return {
        error: 'quota_exceeded',
        class: 'permanent',
        usedBytes: cache.valid
          ? Math.round(cache.chunkBytes * 1.1) + Math.round(cache.logBytes * 1.1)
          : undefined,
        capBytes: cache.capBytes
      };
    }
    if (result.error === 'database_unavailable' && Date.now() - started >= WRITE_WAIT_BUDGET_MS) {
      return result;
    }
    if (Date.now() - started >= WRITE_WAIT_BUDGET_MS) {
      return { error: 'store_busy', class: 'transient' };
    }
    await sleep(delay);
    delay = Math.min(delay * 2, 200);
  }
}

/**
 * Write chunk to session. Owner-serialized; waits for housekeeping; never
 * returns `transaction_conflict`. Idempotent by `(sessionId, seq)`.
 *
 * @param {string} sessionId
 * @param {Object} chunkData
 * @param {number} chunkData.seq
 * @param {number} chunkData.startTime
 * @param {number} chunkData.endTime
 * @param {number} chunkData.duration
 * @param {Blob} chunkData.blob
 * @param {number} chunkData.sizeBytes
 * @returns {Promise<{chunkId: string} | {error: string, class: string, usedBytes?: number, capBytes?: number}>}
 */
export async function writeChunk(sessionId, chunkData) {
  return enqueueCustomer(() => writeChunkUnlocked(sessionId, chunkData));
}

/**
 * Bulk-insert chunk rows (test seed / import). Updates the stats cache.
 * Does not increment session metadata per row. Splits blobs into chunk-blobs.
 *
 * @param {object[]} records
 * @returns {Promise<{written: number} | {error: string, class: string}>}
 */
export async function putChunkRecordsBulk(records) {
  return enqueueCustomer(async () => {
    try {
      const db = await getDatabase();
      if (!Array.isArray(records) || records.length === 0) {
        return { written: 0 };
      }
      const BATCH = 100;
      let written = 0;
      const storeNames = ['chunks'];
      if (hasChunkBlobsStore(db)) storeNames.push(CHUNK_BLOBS_STORE);
      for (let i = 0; i < records.length; i += BATCH) {
        const slice = records.slice(i, BATCH + i);
        await new Promise((resolve, reject) => {
          const transaction = db.transaction(storeNames, 'readwrite');
          const store = transaction.objectStore('chunks');
          for (const record of slice) {
            store.put(stripBlob(record));
            putBlobInTransaction(transaction, record);
          }
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        });
        let bytes = 0;
        for (const record of slice) {
          bytes += record.sizeBytes || 0;
        }
        await addChunkBytes(bytes, slice.length);
        await persistStatsCache();
        written += slice.length;
      }
      return { written };
    } catch {
      return { error: 'database_unavailable', class: 'permanent' };
    }
  });
}

/**
 * Write one already-identified chunk row (archive preserveIds). Splits blob.
 * Does not go through the customer queue — caller serializes.
 *
 * @param {object} record
 * @returns {Promise<null | {error: string}>}
 */
export async function putSplitChunkRecord(record) {
  try {
    const db = await getDatabase();
    return new Promise((resolve) => {
      const storeNames = ['chunks'];
      if (hasChunkBlobsStore(db)) storeNames.push(CHUNK_BLOBS_STORE);
      const transaction = db.transaction(storeNames, 'readwrite');
      transaction.objectStore('chunks').put(stripBlob(record));
      putBlobInTransaction(transaction, record);
      transaction.oncomplete = () => {
        Promise.resolve(addChunkBytes(record.sizeBytes || 0, 1))
          .then(() => persistStatsCache())
          .catch(() => {})
          .then(() => resolve(null));
      };
      transaction.onerror = () => resolve({ error: 'database_unavailable' });
    });
  } catch {
    return { error: 'database_unavailable' };
  }
}

/**
 * Mark a chunk's audio purged: metadata stays, blob row is deleted.
 *
 * @param {string} chunkId
 * @param {number | string} [audioPurgedAt]
 * @returns {Promise<null | {error: string}>}
 */
export async function purgeChunkAudioRecord(chunkId, audioPurgedAt) {
  try {
    const db = await getDatabase();
    const meta = await new Promise((resolve) => {
      const tx = db.transaction(['chunks'], 'readonly');
      const req = tx.objectStore('chunks').get(chunkId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
    if (!meta) return { error: 'database_unavailable' };
    const previous = meta.sizeBytes || 0;
    meta.sizeBytes = 0;
    meta.audioPurgedAt = audioPurgedAt || Date.now();
    return new Promise((resolve) => {
      const storeNames = ['chunks'];
      if (hasChunkBlobsStore(db)) storeNames.push(CHUNK_BLOBS_STORE);
      const transaction = db.transaction(storeNames, 'readwrite');
      transaction.objectStore('chunks').put(stripBlob(meta));
      deleteBlobInTransaction(transaction, chunkId);
      transaction.oncomplete = () => {
        const done = () => resolve(null);
        if (previous > 0) {
          Promise.resolve(subtractChunkBytes(previous, 0))
            .then(() => persistStatsCache())
            .catch(() => {})
            .then(done);
          return;
        }
        done();
      };
      transaction.onerror = () => resolve({ error: 'database_unavailable' });
    });
  } catch {
    return { error: 'database_unavailable' };
  }
}

/**
 * Get chunk by ID (metadata + blob). Blob comes from chunk-blobs, with a
 * fallback to a leftover v3 `chunks.blob` during migration.
 *
 * @param {string} chunkId
 * @returns {Promise<Object | null>}
 */
export async function getChunk(chunkId) {
  try {
    const db = await getDatabase();

    return new Promise((resolve) => {
      const storeNames = ['chunks'];
      if (hasChunkBlobsStore(db)) storeNames.push(CHUNK_BLOBS_STORE);
      const transaction = db.transaction(storeNames, 'readonly');
      const metaReq = transaction.objectStore('chunks').get(chunkId);
      let meta = null;
      let blobRow = null;

      metaReq.onsuccess = () => {
        meta = metaReq.result || null;
        if (!meta) return;
        if (meta.blob && meta.blob.size > 0) return;
        if (!hasChunkBlobsStore(db)) return;
        const blobReq = transaction.objectStore(CHUNK_BLOBS_STORE).get(chunkId);
        blobReq.onsuccess = () => {
          blobRow = blobReq.result || null;
        };
      };

      transaction.oncomplete = () => {
        resolve(assembleChunk(meta, blobRow));
      };
      transaction.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

/**
 * Get all chunks for a session (metadata only, no blobs — in storage, not
 * just in the returned DTO).
 * @param {string} sessionId
 * @returns {Promise<{chunks: Array} | {error: string}>}
 */
export async function getChunksForSession(sessionId) {
  try {
    const db = await getDatabase();

    return new Promise((resolve) => {
      const transaction = db.transaction(['chunks'], 'readonly');
      const store = transaction.objectStore('chunks');
      const index = store.index('by-sessionId-seq');
      const range = IDBKeyRange.bound([sessionId, 0], [sessionId, Infinity]);

      const finish = (rows) => {
        resolve({ chunks: (rows || []).map(publicChunkMeta) });
      };

      if (typeof index.getAll === 'function') {
        const request = index.getAll(range);
        request.onsuccess = () => finish(request.result || []);
        request.onerror = () => resolve({ error: 'database_unavailable' });
        return;
      }

      const request = index.openCursor(range);
      const chunks = [];
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          chunks.push(publicChunkMeta(cursor.value));
          cursor.continue();
        } else {
          finish(chunks);
        }
      };
      request.onerror = () => {
        resolve({ error: 'database_unavailable' });
      };
    });
  } catch (err) {
    return { error: 'database_unavailable' };
  }
}

async function persistCoverage(session, coverage) {
  assignCoverageToSession(session, coverage);
  session.updatedAt = new Date().toISOString();
  const db = await getDatabase();
  return new Promise((resolve) => {
    const transaction = db.transaction(['sessions'], 'readwrite');
    transaction.objectStore('sessions').put(session);
    transaction.oncomplete = () => resolve(coverageFromSession(session));
    transaction.onerror = () => resolve(coverageFromSession(session));
  });
}

/**
 * Gap + saved-duration coverage for a session. O(1) in chunk count when the
 * session row has persisted coverage fields.
 *
 * @param {string} sessionId
 * @returns {Promise<{
 *   expectedFirstSeq: number,
 *   lastSeq: number,
 *   savedCount: number,
 *   missingSeqs: number[],
 *   savedDurationMs: number,
 *   lostChunks: Array<{seq: number, startMs: number, endMs: number, reason: string}>
 * } | {error: string, class: string}>}
 */
export async function getChunkCoverage(sessionId) {
  try {
    const session = await getSession(sessionId);
    if (!session) {
      return { error: 'session_not_found', class: 'permanent' };
    }
    if (hasPersistedCoverage(session)) {
      return coverageFromSession(session);
    }
    const listed = await getChunksForSession(sessionId);
    if (listed.error) {
      return { error: listed.error, class: 'permanent' };
    }
    const coverage = computeCoverageFromChunkMetas(listed.chunks, session.lostChunks);
    enqueueCustomer(() => persistCoverage(session, coverage)).catch(() => {});
    return coverage;
  } catch {
    return { error: 'database_unavailable', class: 'permanent' };
  }
}

/**
 * Recompute coverage from metadata (no blobs) and persist it on the session.
 *
 * @param {string} sessionId
 * @returns {Promise<object | {error: string}>}
 */
export async function recomputeSessionCoverage(sessionId) {
  const session = await getSession(sessionId);
  if (!session) {
    return { error: 'session_not_found', class: 'permanent' };
  }
  const listed = await getChunksForSession(sessionId);
  if (listed.error) return listed;
  const coverage = computeCoverageFromChunkMetas(listed.chunks, session.lostChunks);
  assignCoverageToSession(session, coverage);
  session.updatedAt = new Date().toISOString();
  try {
    const db = await getDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction(['sessions'], 'readwrite');
      transaction.objectStore('sessions').put(session);
      transaction.oncomplete = () => resolve(coverageFromSession(session));
      transaction.onerror = () => resolve({ error: 'database_unavailable' });
    });
  } catch {
    return { error: 'database_unavailable' };
  }
}

/**
 * Persist a permanent chunk-loss record on the session.
 *
 * @param {string} sessionId
 * @param {{ seq: number, startMs: number, endMs: number, reason: string }} loss
 * @returns {Promise<{recorded: true} | {error: string, class: string}>}
 */
export async function recordChunkLost(sessionId, loss) {
  return enqueueCustomer(async () => {
    try {
      const session = await getSession(sessionId);
      if (!session) {
        return { error: 'session_not_found', class: 'permanent' };
      }
      const record = {
        seq: loss.seq,
        startMs: loss.startMs,
        endMs: loss.endMs,
        reason: loss.reason
      };
      const lostChunks = Array.isArray(session.lostChunks) ? session.lostChunks.slice() : [];
      const idx = lostChunks.findIndex((row) => row.seq === record.seq);
      if (idx >= 0) {
        lostChunks[idx] = record;
      } else {
        lostChunks.push(record);
      }
      lostChunks.sort((a, b) => a.seq - b.seq);
      session.lostChunks = lostChunks;
      session.updatedAt = new Date().toISOString();

      const db = await getDatabase();
      return new Promise((resolve) => {
        const transaction = db.transaction(['sessions'], 'readwrite');
        transaction.objectStore('sessions').put(session);
        transaction.oncomplete = () => resolve({ recorded: true });
        transaction.onerror = () =>
          resolve({ error: 'database_unavailable', class: 'permanent' });
      });
    } catch {
      return { error: 'database_unavailable', class: 'permanent' };
    }
  });
}

export { chunkDurationMs };
