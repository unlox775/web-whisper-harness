/**
 * Storage management operations
 */

import { getDatabase } from './db.js';
import { deleteSession } from './sessions.js';

/**
 * Get storage statistics
 * @returns {Promise<{usedBytes: number, capBytes: number, sessionCount: number, chunkCount: number} | {error: string}>}
 */
export async function getStorageStats() {
  try {
    const db = await getDatabase();
    
    return new Promise((resolve) => {
      const transaction = db.transaction(['sessions', 'chunks'], 'readonly');
      const sessionsStore = transaction.objectStore('sessions');
      const chunksStore = transaction.objectStore('chunks');
      
      let sessionCount = 0;
      let chunkCount = 0;
      let totalSize = 0;
      
      // Count sessions
      const sessionsRequest = sessionsStore.count();
      sessionsRequest.onsuccess = () => {
        sessionCount = sessionsRequest.result;
      };
      
      // Count chunks and sum sizes
      const chunksRequest = chunksStore.openCursor();
      chunksRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          chunkCount++;
          totalSize += cursor.value.sizeBytes || 0;
          cursor.continue();
        }
      };
      
      transaction.oncomplete = () => {
        // Add 10% overhead for IndexedDB structures
        const usedBytes = Math.round(totalSize * 1.1);
        
        // Default cap: 200 MB (can be overridden by caller in enforceRetentionPolicy)
        const capBytes = 200 * 1024 * 1024;
        
        resolve({
          usedBytes,
          capBytes,
          sessionCount,
          chunkCount
        });
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
 * Enforce retention policy by deleting oldest sessions until under cap
 * @param {number} capBytes - Storage cap in bytes
 * @returns {Promise<{deletedSessions: number, reclaimedBytes: number, newUsedBytes: number} | {error: string}>}
 */
export async function enforceRetentionPolicy(capBytes) {
  try {
    const db = await getDatabase();
    
    // Calculate current usage
    const stats = await getStorageStats();
    if (stats.error) {
      return stats;
    }
    
    let usedBytes = stats.usedBytes;
    
    // If already under cap, nothing to do
    if (usedBytes <= capBytes) {
      return {
        deletedSessions: 0,
        reclaimedBytes: 0,
        newUsedBytes: usedBytes
      };
    }
    
    // Get all sessions sorted by createdAt ascending (oldest first)
    return new Promise((resolve) => {
      const transaction = db.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      const index = store.index('by-createdAt');
      const request = index.openCursor(null, 'next'); // ASC order
      
      const sessionsToDelete = [];
      let reclaimedBytes = 0;
      
      request.onsuccess = async (event) => {
        const cursor = event.target.result;
        
        if (cursor && usedBytes > capBytes) {
          const session = cursor.value;
          sessionsToDelete.push(session.id);
          reclaimedBytes += session.sizeBytes;
          usedBytes -= session.sizeBytes;
          cursor.continue();
        } else {
          // Done collecting sessions to delete, now delete them
          for (const sessionId of sessionsToDelete) {
            await deleteSession(sessionId);
          }
          
          resolve({
            deletedSessions: sessionsToDelete.length,
            reclaimedBytes,
            newUsedBytes: usedBytes
          });
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

const ALL_STORES = ['transcripts', 'snips', 'volume-profiles', 'chunks', 'sessions'];

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
        resolve({ cleared: true });
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
    await deleteOrphans('snips', (record) => record.sessionId);
    await deleteOrphans('transcripts', (record) => record.sessionId);
    await deleteOrphans('volume-profiles', (record) => record.sessionId);

    return { removed };
  } catch (err) {
    return { error: 'database_unavailable' };
  }
}
