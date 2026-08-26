/**
 * Volume profile operations
 */

import { getDatabase } from './db.js';
import { getSession } from './sessions.js';

/**
 * Write volume profile for session
 * @param {string} sessionId
 * @param {Object} volumeProfile
 * @param {Array} volumeProfile.chunkVolumes - Array of {chunkId, peakDb}
 * @returns {Promise<{written: boolean} | {error: string}>}
 */
export async function writeVolumeProfile(sessionId, volumeProfile) {
  try {
    const db = await getDatabase();
    
    // Validate session exists
    const session = await getSession(sessionId);
    if (!session) {
      return { error: 'session_not_found' };
    }
    
    const now = new Date().toISOString();
    const profile = {
      sessionId,
      chunkVolumes: volumeProfile.chunkVolumes,
      createdAt: now
    };
    
    return new Promise((resolve) => {
      const transaction = db.transaction(['volume-profiles', 'sessions'], 'readwrite');
      const profilesStore = transaction.objectStore('volume-profiles');
      const sessionsStore = transaction.objectStore('sessions');
      
      // Write/replace volume profile (sessionId is the key, so put overwrites)
      profilesStore.put(profile);
      
      // Update session metadata
      const sessionRequest = sessionsStore.get(sessionId);
      sessionRequest.onsuccess = () => {
        const updatedSession = sessionRequest.result;
        updatedSession.hasVolumeProfile = true;
        updatedSession.updatedAt = now;
        sessionsStore.put(updatedSession);
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
 * Get volume profile for session
 * @param {string} sessionId
 * @returns {Promise<Object | null>}
 */
export async function getVolumeProfile(sessionId) {
  try {
    const db = await getDatabase();
    
    return new Promise((resolve) => {
      const transaction = db.transaction(['volume-profiles'], 'readonly');
      const store = transaction.objectStore('volume-profiles');
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
