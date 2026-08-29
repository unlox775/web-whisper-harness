/**
 * IndexedDB database initialization and management
 */

let dbInstance = null;
let dbName = 'web-whisper-db';

const DB_VERSION = 1;

/**
 * Close the current database connection (tests / switching DB names).
 */
export function closeDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Initialize IndexedDB database
 * @param {string} databaseName - Database name
 * @returns {Promise<IDBDatabase>}
 */
export async function initDatabase(databaseName) {
  if (dbInstance && dbName === databaseName) {
    return dbInstance;
  }
  if (dbInstance) {
    closeDatabase();
  }
  dbName = databaseName;
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, DB_VERSION);
    
    request.onerror = () => {
      reject(new Error('Failed to open database'));
    };
    
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // sessions object store
      if (!db.objectStoreNames.contains('sessions')) {
        const sessionsStore = db.createObjectStore('sessions', { keyPath: 'id' });
        sessionsStore.createIndex('by-createdAt', 'createdAt', { unique: false });
      }
      
      // chunks object store
      if (!db.objectStoreNames.contains('chunks')) {
        const chunksStore = db.createObjectStore('chunks', { keyPath: 'id' });
        chunksStore.createIndex('by-sessionId', 'sessionId', { unique: false });
        chunksStore.createIndex('by-sessionId-seq', ['sessionId', 'seq'], { unique: false });
      }
      
      // volume-profiles object store
      if (!db.objectStoreNames.contains('volume-profiles')) {
        db.createObjectStore('volume-profiles', { keyPath: 'sessionId' });
      }
      
      // snips object store
      if (!db.objectStoreNames.contains('snips')) {
        const snipsStore = db.createObjectStore('snips', { keyPath: 'id' });
        snipsStore.createIndex('by-sessionId', 'sessionId', { unique: false });
      }
      
      // transcripts object store
      if (!db.objectStoreNames.contains('transcripts')) {
        const transcriptsStore = db.createObjectStore('transcripts', { keyPath: 'snipId' });
        transcriptsStore.createIndex('by-sessionId', 'sessionId', { unique: false });
      }
    };
  });
}

/**
 * Get database instance
 * @returns {Promise<IDBDatabase>}
 */
export async function getDatabase() {
  if (!dbInstance) {
    await initDatabase(dbName);
  }
  return dbInstance;
}

/**
 * Generate unique ID with prefix
 * @param {string} prefix - ID prefix (e.g., 'ses', 'chunk', 'snip')
 * @returns {string}
 */
export function generateId(prefix) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${timestamp}_${random}`;
}
