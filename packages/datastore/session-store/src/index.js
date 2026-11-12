/**
 * @web-whisper/session-store
 * 
 * IndexedDB datastore authority for Web Whisper data.
 * Owns sessions, chunks, volume profiles, snips, transcripts, and durable logs.
 * Enforces retention policy (storage cap: purge transcribed audio, keep text;
 * age-prune logs).
 */

import { initDatabase, closeDatabase as closeDatabaseRaw, CHUNK_BLOBS_STORE } from './db.js';
import { resetScheduler } from './scheduler.js';
import { rebuildStatsCache, resetStatsCache } from './stats-cache.js';
import {
  migrateLegacyChunkBlobs,
  resetChunkBlobMigrationSchedule,
  scheduleChunkBlobMigration
} from './chunk-blobs.js';
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
  getChunksForSession,
  getChunkCoverage,
  recordChunkLost,
  putChunkRecordsBulk,
  recomputeSessionCoverage
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
  RETENTION_APPROACH_RATIO,
  isRetentionWriteInFlight
} from './retention.js';
import {
  exportSessionArchive,
  parseSessionArchive,
  importSessionArchive,
  sessionArchiveFilename,
  extensionForMime,
  resolveArchiveIncludeFlags,
  joinSnipsWithTranscripts,
  SESSION_ARCHIVE_KIND,
  SESSION_ARCHIVE_FORMAT_VERSION,
  SESSION_ARCHIVE_MIME,
  SESSION_ARCHIVE_MIME_ALIASES
} from './archive.js';
import {
  configureLogger,
  getLoggerConfig,
  log,
  queryLogs,
  getLogByteSizes,
  putLogRecord,
  putLogRecordsBulk,
  setLogWriteFailureForTests,
  PACKAGE_IDS,
  LOG_LEVELS,
  LEVEL_RANK,
  MAX_LOG_AGE_MS,
  resetLoggerConfig
} from './logs.js';
import {
  DEFAULT_CAP_BYTES,
  WRITE_WAIT_BUDGET_MS,
  RETENTION_YIELD_BUDGET_MS,
  RETENTION_BATCH_SIZE,
  MAX_LOG_COUNT
} from './constants.js';

/**
 * Initialize session-store with database name
 * @param {Object} config
 * @param {string} config.databaseName - Database name ('web-whisper-db' for production, 'web-whisper-isolation-demo-session-store' for the Isolation Demo)
 * @returns {Promise<{initialized: boolean}>}
 */
export async function init(config = {}) {
  resetScheduler();
  resetStatsCache();
  resetChunkBlobMigrationSchedule();
  setLogWriteFailureForTests(false);
  const databaseName = config.databaseName || 'web-whisper-db';
  await initDatabase(databaseName);
  await rebuildStatsCache();
  scheduleChunkBlobMigration();
  return { initialized: true };
}

/**
 * Close the current database and drop in-memory scheduler / stats.
 */
export function closeDatabase() {
  resetScheduler();
  resetStatsCache();
  resetChunkBlobMigrationSchedule();
  setLogWriteFailureForTests(false);
  closeDatabaseRaw();
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
  getChunksForSession,
  getChunkCoverage,
  recordChunkLost,
  putChunkRecordsBulk,
  recomputeSessionCoverage,
  migrateLegacyChunkBlobs,
  CHUNK_BLOBS_STORE
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
  isChunkAudioPurged,
  hasValidTranscriptText,
  RETENTION_APPROACH_RATIO,
  isRetentionWriteInFlight
};

// Durable per-package logs
export {
  configureLogger,
  getLoggerConfig,
  log,
  queryLogs,
  getLogByteSizes,
  putLogRecord,
  putLogRecordsBulk,
  setLogWriteFailureForTests,
  PACKAGE_IDS,
  LOG_LEVELS,
  LEVEL_RANK,
  MAX_LOG_AGE_MS,
  resetLoggerConfig,
  DEFAULT_CAP_BYTES,
  WRITE_WAIT_BUDGET_MS,
  RETENTION_YIELD_BUDGET_MS,
  RETENTION_BATCH_SIZE,
  MAX_LOG_COUNT
};

// Session audio archive (zip export / parse / import)
export {
  exportSessionArchive,
  parseSessionArchive,
  importSessionArchive,
  sessionArchiveFilename,
  extensionForMime,
  resolveArchiveIncludeFlags,
  joinSnipsWithTranscripts,
  SESSION_ARCHIVE_KIND,
  SESSION_ARCHIVE_FORMAT_VERSION,
  SESSION_ARCHIVE_MIME,
  SESSION_ARCHIVE_MIME_ALIASES
};
