/**
 * @web-whisper/session-store
 * 
 * IndexedDB datastore authority for Web Whisper data.
 * Owns sessions, chunks, volume profiles, snips, transcripts.
 * Enforces retention policy (storage cap: purge transcribed audio, keep text).
 */

import { initDatabase, closeDatabase } from './db.js';
import {
  createSession,
  getSession,
  listSessions,
  deleteSession,
  finalizeSession,
  reconcileDanglingSessions
} from './sessions.js';
import {
  writeChunk,
  getChunk,
  getChunksForSession
} from './chunks.js';
import {
  writeVolumeProfile,
  getVolumeProfile
} from './volume-profiles.js';
import {
  writeSnip,
  getSnipsForSession,
  getSnip
} from './snips.js';
import {
  writeTranscript,
  getTranscript,
  getTranscriptsForSession
} from './transcripts.js';
import {
  getStorageStats,
  enforceRetentionPolicy,
  dumpStore,
  clearAll,
  cleanupOrphans
} from './storage.js';
import {
  isChunkAudioPurged,
  hasValidTranscriptText,
  RETENTION_APPROACH_RATIO
} from './retention.js';
import {
  exportSessionArchive,
  parseSessionArchive,
  importSessionArchive,
  sessionArchiveFilename,
  extensionForMime,
  SESSION_ARCHIVE_KIND,
  SESSION_ARCHIVE_FORMAT_VERSION,
  SESSION_ARCHIVE_MIME,
  SESSION_ARCHIVE_MIME_ALIASES
} from './archive.js';

/**
 * Initialize session-store with database name
 * @param {Object} config
 * @param {string} config.databaseName - Database name ('web-whisper-db' for production, 'web-whisper-isolation-demo-session-store' for the Isolation Demo)
 * @returns {Promise<{initialized: boolean}>}
 */
export async function init(config = {}) {
  const databaseName = config.databaseName || 'web-whisper-db';
  await initDatabase(databaseName);
  return { initialized: true };
}

// Session Operations
export {
  createSession,
  getSession,
  listSessions,
  deleteSession,
  finalizeSession,
  reconcileDanglingSessions
};

// Chunk Operations
export {
  writeChunk,
  getChunk,
  getChunksForSession
};

// Volume Profile Operations
export {
  writeVolumeProfile,
  getVolumeProfile
};

// Snip Operations
export {
  writeSnip,
  getSnipsForSession,
  getSnip
};

// Transcript Operations
export {
  writeTranscript,
  getTranscript,
  getTranscriptsForSession
};

// Storage Management
export {
  getStorageStats,
  enforceRetentionPolicy,
  dumpStore,
  clearAll,
  cleanupOrphans,
  closeDatabase,
  isChunkAudioPurged,
  hasValidTranscriptText,
  RETENTION_APPROACH_RATIO
};

// Session audio archive (zip export / parse / import)
export {
  exportSessionArchive,
  parseSessionArchive,
  importSessionArchive,
  sessionArchiveFilename,
  extensionForMime,
  SESSION_ARCHIVE_KIND,
  SESSION_ARCHIVE_FORMAT_VERSION,
  SESSION_ARCHIVE_MIME,
  SESSION_ARCHIVE_MIME_ALIASES
};
