/**
 * Transcript operations
 */

import { getDatabase } from './db.js';
import { getSnip } from './snips.js';
import { getSession } from './sessions.js';

/**
 * Write transcript for snip
 * @param {string} snipId
 * @param {string} transcriptText
 * @returns {Promise<{written: boolean} | {error: string}>}
 */
export async function writeTranscript(snipId, transcriptText) {
  try {
    const db = await getDatabase();
    
    // Validate snip exists and get sessionId
    const snip = await getSnip(snipId);
    if (!snip) {
      return { error: 'snip_not_found' };
    }
    
    const now = new Date().toISOString();
    const transcript = {
      snipId,
      sessionId: snip.sessionId,
      text: transcriptText,
      createdAt: now,
      updatedAt: now
    };
    
    return new Promise((resolve) => {
      const transaction = db.transaction(['transcripts', 'sessions'], 'readwrite');
      const transcriptsStore = transaction.objectStore('transcripts');
      const sessionsStore = transaction.objectStore('sessions');
      
      // Write/replace transcript (snipId is the key, so put overwrites)
      transcriptsStore.put(transcript);
      
      // Update session metadata
      const sessionRequest = sessionsStore.get(snip.sessionId);
      sessionRequest.onsuccess = () => {
        const session = sessionRequest.result;
        if (session) {
          session.hasTranscript = true;
          session.updatedAt = now;
          sessionsStore.put(session);
        }
      };
      
      transaction.oncomplete = () => {
        resolve({ written: true });
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
 * Get transcript for snip
 * @param {string} snipId
 * @returns {Promise<Object | null>}
 */
export async function getTranscript(snipId) {
  try {
    const db = await getDatabase();
    
    return new Promise((resolve) => {
      const transaction = db.transaction(['transcripts'], 'readonly');
      const store = transaction.objectStore('transcripts');
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

/**
 * Get all transcripts for a session
 * @param {string} sessionId
 * @returns {Promise<{transcripts: Array} | {error: string}>}
 */
export async function getTranscriptsForSession(sessionId) {
  try {
    const db = await getDatabase();
    
    return new Promise((resolve) => {
      const transaction = db.transaction(['transcripts'], 'readonly');
      const store = transaction.objectStore('transcripts');
      const index = store.index('by-sessionId');
      const request = index.openCursor(IDBKeyRange.only(sessionId));
      
      const transcripts = [];
      
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          transcripts.push(cursor.value);
          cursor.continue();
        } else {
          resolve({ transcripts });
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
