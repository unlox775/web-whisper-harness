/**
 * Running storage totals so retention can cheap-exit under cap with no
 * transaction and no in-flight flag. Updated on every write/delete.
 */

import { getDatabase } from './db.js';
import { DEFAULT_CAP_BYTES, IDB_OVERHEAD, META_RUNTIME_ID } from './constants.js';

const empty = () => ({
  valid: false,
  chunkBytes: 0,
  chunkCount: 0,
  logBytes: 0,
  logEntryCount: 0,
  oldestLogCreatedAt: null,
  sessionCount: 0,
  logWriteFailures: 0,
  capBytes: DEFAULT_CAP_BYTES
});

let cache = empty();

export function resetStatsCache() {
  cache = empty();
}

export function getStatsCache() {
  return cache;
}

export function usedBytesFromSizes(chunkBytes, logBytes) {
  return Math.round((chunkBytes || 0) * IDB_OVERHEAD) + Math.round((logBytes || 0) * IDB_OVERHEAD);
}

export function cachedUsedBytes() {
  return usedBytesFromSizes(cache.chunkBytes, cache.logBytes);
}

export function setCapBytes(capBytes) {
  if (Number.isFinite(capBytes) && capBytes >= 0) {
    cache.capBytes = capBytes;
  }
}

export function addChunkBytes(sizeBytes, count = 1) {
  cache.chunkBytes += sizeBytes || 0;
  cache.chunkCount += count;
}

export function subtractChunkBytes(sizeBytes, count = 0) {
  cache.chunkBytes = Math.max(0, cache.chunkBytes - (sizeBytes || 0));
  cache.chunkCount = Math.max(0, cache.chunkCount - count);
}

export function addSessionCount(n = 1) {
  cache.sessionCount += n;
}

export function subtractSessionCount(n = 1) {
  cache.sessionCount = Math.max(0, cache.sessionCount - n);
}

function noteOldestLog(createdAt) {
  if (typeof createdAt !== 'string' || createdAt.length === 0) return;
  if (!cache.oldestLogCreatedAt || createdAt < cache.oldestLogCreatedAt) {
    cache.oldestLogCreatedAt = createdAt;
  }
}

export function addLogRow(sizeBytes, createdAt) {
  cache.logBytes += sizeBytes || 0;
  cache.logEntryCount += 1;
  noteOldestLog(createdAt);
}

export function subtractLogRows(count, bytes, nextOldestCreatedAt = null) {
  cache.logEntryCount = Math.max(0, cache.logEntryCount - (count || 0));
  cache.logBytes = Math.max(0, cache.logBytes - (bytes || 0));
  if (nextOldestCreatedAt !== undefined) {
    cache.oldestLogCreatedAt = nextOldestCreatedAt;
  }
}

export function setOldestLogCreatedAt(createdAt) {
  cache.oldestLogCreatedAt = createdAt;
}

export function incrementLogWriteFailures() {
  cache.logWriteFailures += 1;
  persistLogWriteFailures();
  return cache.logWriteFailures;
}

export function getLogWriteFailures() {
  return cache.logWriteFailures;
}

export function cacheNeedsAgePrune(now, maxLogAgeMs) {
  if (!cache.oldestLogCreatedAt) return false;
  const cutoff = new Date(now - maxLogAgeMs).toISOString();
  return cache.oldestLogCreatedAt < cutoff;
}

export function cacheNeedsCountPrune(maxLogCount) {
  return cache.logEntryCount > maxLogCount;
}

function persistLogWriteFailures() {
  getDatabase()
    .then((db) => {
      if (!db.objectStoreNames.contains('meta')) return;
      const tx = db.transaction(['meta'], 'readwrite');
      tx.objectStore('meta').put({
        id: META_RUNTIME_ID,
        logWriteFailures: cache.logWriteFailures
      });
    })
    .catch(() => {
      // Counter stays in memory; next successful persist will write it.
    });
}

/**
 * Rebuild totals from IndexedDB. Readonly. Called on init and after
 * operations that are cheaper to rescan than to track incrementally.
 */
export async function rebuildStatsCache() {
  const db = await getDatabase();
  return new Promise((resolve) => {
    const storeNames = ['sessions', 'chunks'];
    if (db.objectStoreNames.contains('logs')) storeNames.push('logs');
    if (db.objectStoreNames.contains('meta')) storeNames.push('meta');

    const transaction = db.transaction(storeNames, 'readonly');
    let chunkBytes = 0;
    let chunkCount = 0;
    let logBytes = 0;
    let logEntryCount = 0;
    let oldestLogCreatedAt = null;
    let sessionCount = 0;
    let logWriteFailures = 0;

    const sessionsReq = transaction.objectStore('sessions').count();
    sessionsReq.onsuccess = () => {
      sessionCount = sessionsReq.result || 0;
    };

    const chunksReq = transaction.objectStore('chunks').openCursor();
    chunksReq.onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) return;
      chunkCount += 1;
      chunkBytes += cursor.value.sizeBytes || 0;
      cursor.continue();
    };

    if (db.objectStoreNames.contains('logs')) {
      const logsReq = transaction.objectStore('logs').openCursor();
      logsReq.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        const row = cursor.value;
        logEntryCount += 1;
        logBytes += row.sizeBytes || 0;
        if (row.createdAt && (!oldestLogCreatedAt || row.createdAt < oldestLogCreatedAt)) {
          oldestLogCreatedAt = row.createdAt;
        }
        cursor.continue();
      };
    }

    if (db.objectStoreNames.contains('meta')) {
      const metaReq = transaction.objectStore('meta').get(META_RUNTIME_ID);
      metaReq.onsuccess = () => {
        const row = metaReq.result;
        if (row && typeof row.logWriteFailures === 'number') {
          logWriteFailures = row.logWriteFailures;
        }
      };
    }

    transaction.oncomplete = () => {
      cache = {
        valid: true,
        chunkBytes,
        chunkCount,
        logBytes,
        logEntryCount,
        oldestLogCreatedAt,
        sessionCount,
        logWriteFailures,
        capBytes: cache.capBytes || DEFAULT_CAP_BYTES
      };
      resolve(cache);
    };
    transaction.onerror = () => {
      cache.valid = false;
      resolve(cache);
    };
  });
}

export async function ensureStatsCache() {
  if (cache.valid) return cache;
  return rebuildStatsCache();
}

export function markCacheValid() {
  cache.valid = true;
}

export function resetCacheToEmpty() {
  const capBytes = cache.capBytes;
  cache = empty();
  cache.valid = true;
  cache.capBytes = capBytes;
}
