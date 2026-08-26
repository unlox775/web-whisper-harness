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
