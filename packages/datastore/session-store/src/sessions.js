/**
 * Session operations
 */

import { getDatabase, generateId } from './db.js';

/**
 * Create new session
 * @returns {Promise<{id: string} | {error: string}>}
 */
export async function createSession() {
  try {
    const db = await getDatabase();
    const sessionId = generateId('ses');
    const now = new Date().toISOString();
    
    const session = {
      id: sessionId,
      createdAt: now,
      updatedAt: now,
      duration: 0,
      chunkCount: 0,
      sizeBytes: 0,
      hasVolumeProfile: false,
      hasSnips: false,
      hasTranscript: false
    };
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sessions'], 'readwrite');
      const store = transaction.objectStore('sessions');
      const request = store.add(session);
      
      request.onsuccess = () => {
        resolve({ id: sessionId });
      };
      
      request.onerror = () => {
        resolve({ error: 'database_unavailable' });
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
 * Get session by ID
 * @param {string} sessionId
 * @returns {Promise<Object | null>}
 */
export async function getSession(sessionId) {
  try {
    const db = await getDatabase();
    
    return new Promise((resolve) => {
      const transaction = db.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      const request = store.get(sessionId);
      
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
 * List sessions
 * @param {Object} options
 * @param {number} options.limit - Max sessions to return (default 100)
 * @param {number} options.offset - Offset for pagination (default 0)
 * @returns {Promise<{sessions: Array, total: number} | {error: string}>}
 */
export async function listSessions(options = {}) {
  const limit = options.limit || 100;
  const offset = options.offset || 0;
  
  try {
    const db = await getDatabase();
    
    return new Promise((resolve) => {
      const transaction = db.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      const index = store.index('by-createdAt');
      
      // Get all sessions sorted by createdAt DESC
      const request = index.openCursor(null, 'prev');
      const sessions = [];
      let skipped = 0;
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (skipped < offset) {
            skipped++;
            cursor.continue();
          } else if (sessions.length < limit) {
            sessions.push(cursor.value);
            cursor.continue();
          } else {
            // Have enough sessions, done
            resolve({ sessions, total: sessions.length + offset });
          }
        } else {
          // No more sessions
          resolve({ sessions, total: sessions.length + offset });
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
 * Delete session and all related data (cascade)
 * @param {string} sessionId
 * @returns {Promise<{deleted: boolean} | {error: string}>}
 */
export async function deleteSession(sessionId) {
  try {
    const db = await getDatabase();
    
    // Check if session exists first
    const session = await getSession(sessionId);
    if (!session) {
      return { error: 'session_not_found' };
    }
    
    return new Promise((resolve) => {
      const transaction = db.transaction(
        ['transcripts', 'snips', 'volume-profiles', 'chunks', 'sessions'],
        'readwrite'
      );
      
      // Delete transcripts for this session
      const transcriptsStore = transaction.objectStore('transcripts');
      const transcriptsIndex = transcriptsStore.index('by-sessionId');
      const transcriptsRequest = transcriptsIndex.openCursor(IDBKeyRange.only(sessionId));
      
      transcriptsRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      
      // Delete snips for this session
      const snipsStore = transaction.objectStore('snips');
      const snipsIndex = snipsStore.index('by-sessionId');
      const snipsRequest = snipsIndex.openCursor(IDBKeyRange.only(sessionId));
      
      snipsRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      
      // Delete volume profile for this session
      const volumeProfilesStore = transaction.objectStore('volume-profiles');
      volumeProfilesStore.delete(sessionId);
      
      // Delete chunks for this session
      const chunksStore = transaction.objectStore('chunks');
      const chunksIndex = chunksStore.index('by-sessionId');
      const chunksRequest = chunksIndex.openCursor(IDBKeyRange.only(sessionId));
      
      chunksRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      
      // Delete session itself
      const sessionsStore = transaction.objectStore('sessions');
      sessionsStore.delete(sessionId);
      
      transaction.oncomplete = () => {
        resolve({ deleted: true });
      };
      
      transaction.onerror = () => {
        resolve({ error: 'database_unavailable' });
      };
    });
  } catch (err) {
    return { error: 'database_unavailable' };
  }
}
