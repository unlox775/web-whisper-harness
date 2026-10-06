/**
 * Chunk operations
 */

import { getDatabase, generateId } from './db.js';
import { getSession } from './sessions.js';
import { isRetentionWriteInFlight } from './retention.js';

/**
 * Write chunk to session
 * @param {string} sessionId
 * @param {Object} chunkData
 * @param {number} chunkData.seq - Sequential chunk number
 * @param {number} chunkData.startTime - Start time in seconds
 * @param {number} chunkData.endTime - End time in seconds
 * @param {number} chunkData.duration - Duration in seconds
 * @param {Blob} chunkData.blob - MP3 audio blob
 * @param {number} chunkData.sizeBytes - Blob size in bytes
 * @returns {Promise<{chunkId: string} | {error: string, usedBytes?: number, capBytes?: number}>}
 */
export async function writeChunk(sessionId, chunkData) {
  try {
    if (isRetentionWriteInFlight()) {
      return { error: 'transaction_conflict', sessionId };
    }

    const db = await getDatabase();
    
    // Validate session exists
    const session = await getSession(sessionId);
    if (!session) {
      return { error: 'session_not_found' };
    }

    // Re-check after awaits: a long retention readwrite may have started.
    if (isRetentionWriteInFlight()) {
      return { error: 'transaction_conflict', sessionId };
    }
    
    // Generate chunk ID
    const chunkId = generateId('chunk');
    const now = new Date().toISOString();
    
    const chunk = {
      id: chunkId,
      sessionId,
      seq: chunkData.seq,
      startTime: chunkData.startTime,
      endTime: chunkData.endTime,
      duration: chunkData.duration,
      blob: chunkData.blob,
      sizeBytes: chunkData.sizeBytes
    };
    
    return new Promise((resolve) => {
      const transaction = db.transaction(['chunks', 'sessions'], 'readwrite');
      const chunksStore = transaction.objectStore('chunks');
      const sessionsStore = transaction.objectStore('sessions');
      
      // Add chunk
      const chunkRequest = chunksStore.add(chunk);
      
      chunkRequest.onsuccess = () => {
        // Update session metadata
        const sessionRequest = sessionsStore.get(sessionId);
        
        sessionRequest.onsuccess = () => {
          const updatedSession = sessionRequest.result;
          updatedSession.chunkCount += 1;
          updatedSession.sizeBytes += chunkData.sizeBytes;
          updatedSession.duration = Math.max(updatedSession.duration || 0, chunkData.endTime);
          updatedSession.updatedAt = now;
          
          sessionsStore.put(updatedSession);
        };
      };
      
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      transaction.oncomplete = () => {
        finish({ chunkId });
      };

      const conflictOrUnavailable = () => {
        const name = transaction.error?.name || '';
        const message = String(transaction.error?.message || '');
        if (name === 'AbortError' || name === 'InvalidStateError' || /abort/i.test(message)) {
          finish({ error: 'transaction_conflict', sessionId });
          return;
        }
        if (name === 'QuotaExceededError' || /quota/i.test(message)) {
          finish({ error: 'quota_exceeded' });
          return;
        }
        finish({ error: 'database_unavailable' });
      };
      
      transaction.onerror = conflictOrUnavailable;
      transaction.onabort = conflictOrUnavailable;
    });
  } catch (err) {
    return { error: 'database_unavailable' };
  }
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
          // Exclude blob for performance
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
