/**
 * Snip operations
 */

import { getDatabase, generateId } from './db.js';
import { getSession } from './sessions.js';

/**
 * Write snip for session
 * @param {string} sessionId
 * @param {Object} snipData
 * @param {number} snipData.startChunkIndex
 * @param {number} snipData.endChunkIndex
 * @param {number} snipData.startTime
 * @param {number} snipData.endTime
 * @param {number} snipData.duration
 * @param {Array<string>} snipData.chunkIds
 * @param {number} snipData.confidence
 * @returns {Promise<{snipId: string} | {error: string}>}
 */
export async function writeSnip(sessionId, snipData) {
  try {
    const db = await getDatabase();
    
    // Validate session exists
    const session = await getSession(sessionId);
    if (!session) {
      return { error: 'session_not_found' };
    }
    
    const snipId = generateId('snip');
    const now = new Date().toISOString();
    
    const snip = {
      id: snipId,
      sessionId,
      startChunkIndex: snipData.startChunkIndex,
      endChunkIndex: snipData.endChunkIndex,
      startTime: snipData.startTime,
      endTime: snipData.endTime,
      duration: snipData.duration,
      chunkIds: snipData.chunkIds,
      confidence: snipData.confidence,
      createdAt: now
    };
    
    return new Promise((resolve) => {
      const transaction = db.transaction(['snips', 'sessions'], 'readwrite');
      const snipsStore = transaction.objectStore('snips');
      const sessionsStore = transaction.objectStore('sessions');
      
      // Add snip
      snipsStore.add(snip);
      
      // Update session metadata
      const sessionRequest = sessionsStore.get(sessionId);
      sessionRequest.onsuccess = () => {
        const updatedSession = sessionRequest.result;
        updatedSession.hasSnips = true;
        updatedSession.updatedAt = now;
        sessionsStore.put(updatedSession);
      };
      
      transaction.oncomplete = () => {
        resolve({ snipId });
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
 * Get all snips for a session
 * @param {string} sessionId
 * @returns {Promise<{snips: Array} | {error: string}>}
 */
export async function getSnipsForSession(sessionId) {
  try {
    const db = await getDatabase();
    
    return new Promise((resolve) => {
      const transaction = db.transaction(['snips'], 'readonly');
      const store = transaction.objectStore('snips');
      const index = store.index('by-sessionId');
      const request = index.openCursor(IDBKeyRange.only(sessionId));
      
      const snips = [];
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          snips.push(cursor.value);
          cursor.continue();
        } else {
          // Sort by startTime
          snips.sort((a, b) => a.startTime - b.startTime);
          resolve({ snips });
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
 * Get snip by ID
 * @param {string} snipId
 * @returns {Promise<Object | null>}
 */
export async function getSnip(snipId) {
  try {
    const db = await getDatabase();
    
    return new Promise((resolve) => {
      const transaction = db.transaction(['snips'], 'readonly');
      const store = transaction.objectStore('snips');
      const request = store.get(snipId);
      
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
