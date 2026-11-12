/**
 * Storage management operations
 */

import { getDatabase } from './db.js';
import { enforceRetentionPolicy } from './retention.js';
import { enqueueCustomer } from './scheduler.js';
import { DEFAULT_CAP_BYTES } from './constants.js';
import {
  flushStatsPersist,
  getStatsCache,
  hydrateStatsCache,
  rebuildStatsCache,
  resetCacheToEmpty,
  scheduleStatsRebuild,
  statsToPublic,
  waitForStatsCacheValid
} from './stats-cache.js';

/**
 * Get storage statistics.
 *
 * O(1) when the stats cache is valid: running totals, same 1.1 overhead as
 * before. Does not openCursor `chunk-blobs` (or `chunks`); blob bytes come
 * from the cache / metadata `sizeBytes`. If the cache is invalid, the public
 * payload reports `usedBytesKnown: false` and `usedBytes: null` (never the
 * internal retention sentinel).
 *
 * `usedBytes` includes chunk bytes **and** log bytes, each with the same 1.1
 * IndexedDB overhead factor already used for chunks. `logBytes` is the
 * overhead-adjusted log total so Settings size lines stay honest.
 *
 * @returns {Promise<{usedBytes: number, capBytes: number, sessionCount: number, chunkCount: number, logBytes: number, logEntryCount: number, logWriteFailures: number, logBytesByPackage?: object} | {error: string}>}
 */
export async function getStorageStats() {
  try {
    if (!getStatsCache().valid) {
      await flushStatsPersist();
      await hydrateStatsCache();
      if (!getStatsCache().valid) {
        scheduleStatsRebuild();
      }
    }
    return statsToPublic(DEFAULT_CAP_BYTES);
  } catch (err) {
    return { error: 'database_unavailable' };
  }
}

export { waitForStatsCacheValid };

export { enforceRetentionPolicy };

const ALL_STORES = ['meta', 'logs', 'transcripts', 'snips', 'volume-profiles', 'chunk-blobs', 'chunks', 'sessions'];

/**
 * Dump every record from an object store (developer console).
 * @param {string} storeName
 * @returns {Promise<{records: Array} | {error: string}>}
 */
export async function dumpStore(storeName) {
  try {
    const db = await getDatabase();
    if (!db.objectStoreNames.contains(storeName)) {
      return { error: 'store_not_found' };
    }
    return new Promise((resolve) => {
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => {
        resolve({ records: request.result || [] });
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
 * Delete every session and related record.
 * @returns {Promise<{cleared: boolean} | {error: string}>}
 */
export async function clearAll() {
  return enqueueCustomer(() => clearAllUnlocked());
}

async function clearAllUnlocked() {
  try {
    const db = await getDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction(ALL_STORES, 'readwrite');
      for (const name of ALL_STORES) {
        if (db.objectStoreNames.contains(name)) {
          transaction.objectStore(name).clear();
        }
      }
      transaction.oncomplete = () => {
        resetCacheToEmpty()
          .catch(() => {})
          .then(() => resolve({ cleared: true }));
      };
      transaction.onerror = () => {
        resolve({ error: 'database_unavailable' });
      };
    });
  } catch (err) {
    return { error: 'database_unavailable' };
  }
}

/**
 * Remove chunks/snips/transcripts/volume profiles whose session no longer exists.
 * @returns {Promise<{removed: number} | {error: string}>}
 */
export async function cleanupOrphans() {
  return enqueueCustomer(() => cleanupOrphansUnlocked());
}

async function cleanupOrphansUnlocked() {
  try {
    const sessionsDump = await dumpStore('sessions');
    if (sessionsDump.error) {
      return sessionsDump;
    }
    const sessionIds = new Set((sessionsDump.records || []).map((session) => session.id));
    const db = await getDatabase();
    let removed = 0;

    const deleteOrphans = (storeName, getSessionId) => new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(storeName)) {
        resolve();
        return;
      }
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) {
          return;
        }
        const sessionId = getSessionId(cursor.value);
        if (sessionId && !sessionIds.has(sessionId)) {
          cursor.delete();
          removed += 1;
        }
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });

    await deleteOrphans('chunks', (record) => record.sessionId);
    await deleteOrphans('chunk-blobs', (record) => record.sessionId);
    await deleteOrphans('snips', (record) => record.sessionId);
    await deleteOrphans('transcripts', (record) => record.sessionId);
    await deleteOrphans('volume-profiles', (record) => record.sessionId);
    await deleteOrphans('logs', (record) => record.sessionId);

    await rebuildStatsCache(async () => {});
    return { removed };
  } catch (err) {
    return { error: 'database_unavailable' };
  }
}
