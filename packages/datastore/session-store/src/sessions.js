/**
 * Session operations
 */

import { getDatabase, generateId, CHUNK_BLOBS_STORE } from './db.js';
import { enqueueCustomer } from './scheduler.js';
import { addSessionCount, rebuildStatsCache, subtractSessionCount } from './stats-cache.js';
import { emptyCoverageFields, assignCoverageToSession, computeCoverageFromChunkMetas, publicChunkMeta } from './chunk-coverage.js';
import { deleteBlobInTransaction, hasChunkBlobsStore } from './chunk-blobs.js';

/**
 * Create new session
 * @returns {Promise<{id: string} | {error: string}>}
 */
export async function createSession() {
  return enqueueCustomer(() => createSessionUnlocked());
}

async function createSessionUnlocked() {
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
      hasTranscript: false,
      status: 'recording',
      ...emptyCoverageFields()
    };
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sessions'], 'readwrite');
      const store = transaction.objectStore('sessions');
      const request = store.add(session);
      
      request.onsuccess = () => {
        addSessionCount(1);
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
  return enqueueCustomer(() => deleteSessionUnlocked(sessionId));
}

async function deleteSessionUnlocked(sessionId) {
  try {
    const db = await getDatabase();
    
    // Check if session exists first
    const session = await getSession(sessionId);
    if (!session) {
      return { error: 'session_not_found' };
    }
    
    return new Promise((resolve) => {
      const storeNames = ['transcripts', 'snips', 'volume-profiles', 'chunks', 'sessions'];
      if (db.objectStoreNames.contains('logs')) {
        storeNames.unshift('logs');
      }
      if (hasChunkBlobsStore(db)) {
        storeNames.push(CHUNK_BLOBS_STORE);
      }
      const transaction = db.transaction(storeNames, 'readwrite');
      
      // Delete logs for this session (cascade; after transcripts/snips/volume/chunks or same tx)
      if (db.objectStoreNames.contains('logs')) {
        const logsStore = transaction.objectStore('logs');
        const logsIndex = logsStore.index('by-sessionId');
        const logsRequest = logsIndex.openCursor(IDBKeyRange.only(sessionId));
        logsRequest.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
      }

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
      
      // Delete chunks + audio blobs for this session
      const chunksStore = transaction.objectStore('chunks');
      const chunksIndex = chunksStore.index('by-sessionId');
      const chunksRequest = chunksIndex.openCursor(IDBKeyRange.only(sessionId));
      
      chunksRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          deleteBlobInTransaction(transaction, cursor.value.id);
          cursor.delete();
          cursor.continue();
        }
      };

      if (hasChunkBlobsStore(db)) {
        const blobsStore = transaction.objectStore(CHUNK_BLOBS_STORE);
        const blobsIndex = blobsStore.index('by-sessionId');
        const blobsRequest = blobsIndex.openCursor(IDBKeyRange.only(sessionId));
        blobsRequest.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
      }
      
      // Delete session itself
      const sessionsStore = transaction.objectStore('sessions');
      sessionsStore.delete(sessionId);
      
      transaction.oncomplete = () => {
        subtractSessionCount(1);
        rebuildStatsCache()
          .catch(() => {})
          .then(() => resolve({ deleted: true }));
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
 * Recompute session duration/chunkCount/size from persisted chunks and mark
 * the session ready (has audio) or error (no chunks). Does not delete audio.
 * @param {string} sessionId
 * @returns {Promise<{session: Object} | {error: string}>}
 */
export async function finalizeSession(sessionId) {
  return enqueueCustomer(() => finalizeSessionUnlocked(sessionId));
}

async function finalizeSessionUnlocked(sessionId) {
  try {
    const db = await getDatabase();
    const session = await getSession(sessionId);
    if (!session) {
      return { error: 'session_not_found' };
    }

    return new Promise((resolve) => {
      const transaction = db.transaction(['chunks', 'sessions'], 'readwrite');
      const chunksStore = transaction.objectStore('chunks');
      const sessionsStore = transaction.objectStore('sessions');
      const index = chunksStore.index('by-sessionId-seq');
      const request = index.openCursor(IDBKeyRange.bound([sessionId, 0], [sessionId, Infinity]));

      let chunkCount = 0;
      let sizeBytes = 0;
      let duration = 0;
      const metas = [];

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const chunk = cursor.value;
          chunkCount += 1;
          sizeBytes += chunk.sizeBytes || 0;
          duration = Math.max(duration, chunk.endTime || 0);
          metas.push(publicChunkMeta(chunk));
          cursor.continue();
        }
      };

      transaction.oncomplete = () => {
        const now = new Date().toISOString();
        const updated = {
          ...session,
          chunkCount,
          sizeBytes,
          duration,
          updatedAt: now,
          status: chunkCount > 0 ? 'ready' : 'error'
        };
        assignCoverageToSession(
          updated,
          computeCoverageFromChunkMetas(metas, session.lostChunks)
        );
        const putTx = db.transaction(['sessions'], 'readwrite');
        putTx.objectStore('sessions').put(updated);
        putTx.oncomplete = () => resolve({ session: updated });
        putTx.onerror = () => resolve({ error: 'database_unavailable' });
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
 * Finalize any sessions still marked recording (page killed, cancel, crash).
 * Keeps every session and its chunks; never deletes on abort.
 * @returns {Promise<{reconciled: number} | {error: string}>}
 */
export async function reconcileDanglingSessions() {
  const listed = await listSessions({ limit: 500, offset: 0 });
  if (listed.error) {
    return { error: listed.error };
  }
  let reconciled = 0;
  for (const session of listed.sessions || []) {
    if (session.status === 'recording') {
      await finalizeSession(session.id);
      reconciled += 1;
    }
  }
  return { reconciled };
}
