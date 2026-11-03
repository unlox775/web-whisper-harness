/**
 * Chunk operations
 */

import { getDatabase, generateId } from './db.js';
import { getSession } from './sessions.js';
import { enqueueCustomer } from './scheduler.js';
import { addChunkBytes, ensureStatsCache, getStatsCache } from './stats-cache.js';
import { WRITE_WAIT_BUDGET_MS } from './constants.js';
import { runRetentionUnlocked } from './retention.js';

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

function chunkDurationMs(chunk) {
  if (typeof chunk.duration === 'number' && Number.isFinite(chunk.duration)) {
    return chunk.duration * 1000;
  }
  const start = typeof chunk.startTime === 'number' ? chunk.startTime : 0;
  const end = typeof chunk.endTime === 'number' ? chunk.endTime : start;
  return Math.max(0, (end - start) * 1000);
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
    const transaction = db.transaction(['chunks', 'sessions'], 'readwrite');
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
        chunksStore.add({
          id: chunkId,
          sessionId,
          seq: chunkData.seq,
          startTime: chunkData.startTime,
          endTime: chunkData.endTime,
          duration: chunkData.duration,
          blob: chunkData.blob,
          sizeBytes: chunkData.sizeBytes
        });
        session.chunkCount += 1;
        session.sizeBytes += chunkData.sizeBytes;
        session.duration = Math.max(session.duration || 0, chunkData.endTime);
        session.updatedAt = now;
        sessionsStore.put(session);
        result = { chunkId };
      };
    };

    transaction.oncomplete = () => {
      if (result && result.chunkId && !result.idempotent) {
        addChunkBytes(chunkData.sizeBytes || 0, 1);
      }
      finish(result || { error: 'database_unavailable', class: 'permanent' });
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
 * Does not increment session metadata per row.
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
      for (let i = 0; i < records.length; i += BATCH) {
        const slice = records.slice(i, i + BATCH);
        await new Promise((resolve, reject) => {
          const transaction = db.transaction(['chunks'], 'readwrite');
          const store = transaction.objectStore('chunks');
          for (const record of slice) {
            store.put(record);
          }
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        });
        let bytes = 0;
        for (const record of slice) {
          bytes += record.sizeBytes || 0;
        }
        addChunkBytes(bytes, slice.length);
        written += slice.length;
      }
      return { written };
    } catch {
      return { error: 'database_unavailable', class: 'permanent' };
    }
  });
}

/**
 * Get chunk by ID
 * @param {string} chunkId
 * @returns {Promise<Object | null>}
 */
export async function getChunk(chunkId) {
  try {
    const db = await getDatabase();

    return new Promise((resolve) => {
      const transaction = db.transaction(['chunks'], 'readonly');
      const store = transaction.objectStore('chunks');
      const request = store.get(chunkId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        resolve(null);
      };
    });
  } catch (err) {
    return null;
  }
}

/**
 * Get all chunks for a session (metadata only, no blobs)
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
      const request = index.openCursor(IDBKeyRange.bound([sessionId, 0], [sessionId, Infinity]));

      const chunks = [];

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const chunk = cursor.value;
          chunks.push({
            id: chunk.id,
            sessionId: chunk.sessionId,
            seq: chunk.seq,
            startTime: chunk.startTime,
            endTime: chunk.endTime,
            duration: chunk.duration,
            sizeBytes: chunk.sizeBytes,
            audioPurgedAt: chunk.audioPurgedAt || null
          });
          cursor.continue();
        } else {
          resolve({ chunks });
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

/**
 * Gap + saved-duration coverage for a session.
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
    const listed = await getChunksForSession(sessionId);
    if (listed.error) {
      return { error: listed.error, class: 'permanent' };
    }
    const chunks = listed.chunks || [];
    const seqs = chunks
      .map((chunk) => chunk.seq)
      .filter((seq) => typeof seq === 'number')
      .sort((a, b) => a - b);
    const expectedFirstSeq = 0;
    const lastSeq = seqs.length > 0 ? seqs[seqs.length - 1] : -1;
    const saved = new Set(seqs);
    const missingSeqs = [];
    if (lastSeq >= expectedFirstSeq) {
      for (let seq = expectedFirstSeq; seq <= lastSeq; seq += 1) {
        if (!saved.has(seq)) missingSeqs.push(seq);
      }
    }
    const savedDurationMs = chunks.reduce((sum, chunk) => sum + chunkDurationMs(chunk), 0);
    return {
      expectedFirstSeq,
      lastSeq,
      savedCount: chunks.length,
      missingSeqs,
      savedDurationMs,
      lostChunks: Array.isArray(session.lostChunks) ? session.lostChunks.slice() : []
    };
  } catch {
    return { error: 'database_unavailable', class: 'permanent' };
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
