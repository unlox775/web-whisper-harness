/**
 * Audio bytes live in `chunk-blobs` (keyed by chunk id). Chunk metadata
 * stays in `chunks` so list/coverage/detail metadata reads do not
 * deserialize MP3 blobs.
 *
 * v3 → v4 copies legacy `chunks.blob` into this store, then strips the
 * property from the metadata row. Copy-then-strip, batched, resumable,
 * idempotent. Audio is never deleted by this migration.
 */

import { getDatabase, CHUNK_BLOBS_STORE, META_CHUNK_BLOB_MIGRATION_ID } from './db.js';
import { enqueueHousekeeping } from './scheduler.js';
import {
  assignCoverageToSession,
  computeCoverageFromChunkMetas,
  hasPersistedCoverage,
  publicChunkMeta,
  stripBlob
} from './chunk-coverage.js';

const MIGRATION_BATCH = 16;

function emptyMigrationState() {
  return {
    id: META_CHUNK_BLOB_MIGRATION_ID,
    done: false,
    lastKey: null,
    coverageDone: false
  };
}

function readMeta(db, id) {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains('meta')) {
      resolve(null);
      return;
    }
    const tx = db.transaction(['meta'], 'readonly');
    const request = tx.objectStore('meta').get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function writeMeta(db, record) {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains('meta')) {
      resolve();
      return;
    }
    const tx = db.transaction(['meta'], 'readwrite');
    tx.objectStore('meta').put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function readChunkPage(db, afterId, limit) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['chunks'], 'readonly');
    const store = tx.objectStore('chunks');
    const range = afterId ? IDBKeyRange.lowerBound(afterId, true) : null;
    const request = range ? store.openCursor(range) : store.openCursor();
    const rows = [];
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor || rows.length >= limit) return;
      rows.push(cursor.value);
      cursor.continue();
    };
    tx.oncomplete = () => resolve(rows);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Copy blob to chunk-blobs (if present and not already copied), then strip
 * `blob` from the metadata row in the same transaction. Never deletes audio:
 * an abort leaves the original blob on the chunk row.
 *
 * @param {IDBDatabase} db
 * @param {object} chunk
 */
function migrateOneChunk(db, chunk) {
  return new Promise((resolve, reject) => {
    const hasBlobStore = db.objectStoreNames.contains(CHUNK_BLOBS_STORE);
    const storeNames = hasBlobStore ? ['chunks', CHUNK_BLOBS_STORE] : ['chunks'];
    const tx = db.transaction(storeNames, 'readwrite');
    const chunksStore = tx.objectStore('chunks');
    const blob = chunk.blob;
    const hasAudio = Boolean(blob && typeof blob.size === 'number' && blob.size > 0);

    const finishPutMeta = () => {
      chunksStore.put(stripBlob(chunk));
    };

    if (hasAudio && hasBlobStore) {
      const blobsStore = tx.objectStore(CHUNK_BLOBS_STORE);
      const existing = blobsStore.get(chunk.id);
      existing.onsuccess = () => {
        if (!existing.result) {
          blobsStore.put({
            id: chunk.id,
            sessionId: chunk.sessionId,
            blob,
            mime: blob.type || 'audio/mpeg'
          });
        }
        finishPutMeta();
      };
      existing.onerror = () => {
        // Leave the original row intact; retry on the next pass.
      };
    } else {
      finishPutMeta();
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function listSessionIds(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['sessions'], 'readonly');
    const request = tx.objectStore('sessions').getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function listChunkMetasForSession(db, sessionId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['chunks'], 'readonly');
    const index = tx.objectStore('chunks').index('by-sessionId-seq');
    const request = index.getAll(IDBKeyRange.bound([sessionId, 0], [sessionId, Infinity]));
    request.onsuccess = () => resolve((request.result || []).map(publicChunkMeta));
    request.onerror = () => reject(request.error);
  });
}

function putSession(db, session) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['sessions'], 'readwrite');
    tx.objectStore('sessions').put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function backfillSessionCoverage(db, yieldToCustomer) {
  const sessions = await listSessionIds(db);
  for (const session of sessions) {
    if (hasPersistedCoverage(session)) {
      if (yieldToCustomer) await yieldToCustomer();
      continue;
    }
    const metas = await listChunkMetasForSession(db, session.id);
    const coverage = computeCoverageFromChunkMetas(metas, session.lostChunks);
    assignCoverageToSession(session, coverage);
    session.updatedAt = new Date().toISOString();
    await putSession(db, session);
    if (yieldToCustomer) await yieldToCustomer();
  }
}

async function runChunkBlobMigration(yieldToCustomer = async () => {}) {
  const db = await getDatabase();
  if (!db.objectStoreNames.contains('chunks')) {
    return { migrated: 0, done: true };
  }

  let state = (await readMeta(db, META_CHUNK_BLOB_MIGRATION_ID)) || emptyMigrationState();
  if (state.done && state.coverageDone) {
    return { migrated: 0, done: true };
  }

  let migrated = 0;
  while (!state.done) {
    const batch = await readChunkPage(db, state.lastKey, MIGRATION_BATCH);
    if (batch.length === 0) {
      state.done = true;
      state.lastKey = null;
      await writeMeta(db, state);
      break;
    }
    for (const chunk of batch) {
      await migrateOneChunk(db, chunk);
      migrated += 1;
      state.lastKey = chunk.id;
    }
    await writeMeta(db, state);
    await yieldToCustomer();
  }

  if (!state.coverageDone) {
    await backfillSessionCoverage(db, yieldToCustomer);
    state.coverageDone = true;
    await writeMeta(db, state);
  }

  return { migrated, done: true };
}

/**
 * Resume or finish v4 blob split + coverage backfill.
 * With no argument (tests / callers) this is owner-serialized housekeeping.
 *
 * @param {() => Promise<void>} [yieldToCustomer]
 * @returns {Promise<{ migrated: number, done: boolean }>}
 */
export async function migrateLegacyChunkBlobs(yieldToCustomer) {
  if (typeof yieldToCustomer === 'function') {
    return runChunkBlobMigration(yieldToCustomer);
  }
  return enqueueHousekeeping((yieldFn) => runChunkBlobMigration(yieldFn));
}

let migrationScheduled = false;

/**
 * Housekeeping: copy leftover v3 blobs off the metadata store. Fresh v4
 * databases mark migration done in onupgradeneeded, so this is a no-op.
 */
export function scheduleChunkBlobMigration() {
  if (migrationScheduled) return;
  migrationScheduled = true;
  enqueueHousekeeping((yieldToCustomer) => migrateLegacyChunkBlobs(yieldToCustomer)).catch(
    () => {}
  );
}

export function resetChunkBlobMigrationSchedule() {
  migrationScheduled = false;
}

export function hasChunkBlobsStore(db) {
  return Boolean(db?.objectStoreNames?.contains(CHUNK_BLOBS_STORE));
}

/**
 * @param {IDBTransaction} transaction
 * @param {object} record
 */
export function putBlobInTransaction(transaction, record) {
  if (!record?.id) return;
  const blob = record.blob;
  if (!blob || !(blob.size > 0)) return;
  if (!transaction.objectStoreNames.contains(CHUNK_BLOBS_STORE)) return;
  transaction.objectStore(CHUNK_BLOBS_STORE).put({
    id: record.id,
    sessionId: record.sessionId,
    blob,
    mime: blob.type || 'audio/mpeg'
  });
}

/**
 * @param {IDBTransaction} transaction
 * @param {string} chunkId
 */
export function deleteBlobInTransaction(transaction, chunkId) {
  if (!chunkId) return;
  if (!transaction.objectStoreNames.contains(CHUNK_BLOBS_STORE)) return;
  transaction.objectStore(CHUNK_BLOBS_STORE).delete(chunkId);
}
