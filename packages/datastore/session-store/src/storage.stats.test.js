import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import * as sessionStore from './index.js';
import { META_STATS_ID, UNKNOWN_USED_BYTES, IDB_OVERHEAD } from './constants.js';
import { getStatsCache, resetStatsCache } from './stats-cache.js';

let dbSeq = 0;
let currentDbName = '';

async function openFreshDb() {
  dbSeq += 1;
  currentDbName = `web-whisper-stats-test-${dbSeq}`;
  sessionStore.closeDatabase();
  await sessionStore.init({ databaseName: currentDbName });
}

async function reopenSameDb() {
  sessionStore.closeDatabase();
  await sessionStore.init({ databaseName: currentDbName });
}

function audioBlob(sizeBytes) {
  return new Blob([new Uint8Array(sizeBytes)], { type: 'audio/mpeg' });
}

async function writeAudioChunk(sessionId, seq, sizeBytes) {
  const result = await sessionStore.writeChunk(sessionId, {
    seq,
    startTime: seq * 4,
    endTime: (seq + 1) * 4,
    duration: 4,
    blob: audioBlob(sizeBytes),
    sizeBytes
  });
  assert.ok(result.chunkId, result.error);
  return result.chunkId;
}

function spyBlobStoreCursors() {
  const original = IDBObjectStore.prototype.openCursor;
  let chunks = 0;
  let chunkBlobs = 0;
  IDBObjectStore.prototype.openCursor = function openCursorSpy(...args) {
    if (this.name === 'chunks') chunks += 1;
    if (this.name === 'chunk-blobs') chunkBlobs += 1;
    return original.apply(this, args);
  };
  return {
    chunks: () => chunks,
    chunkBlobs: () => chunkBlobs,
    count: () => chunks + chunkBlobs,
    restore() {
      IDBObjectStore.prototype.openCursor = original;
    }
  };
}

function spyBlobStoreReadwrite() {
  const original = IDBDatabase.prototype.transaction;
  let count = 0;
  IDBDatabase.prototype.transaction = function transactionSpy(storeNames, mode) {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    if (
      mode === 'readwrite' &&
      (names.includes('chunks') || names.includes('chunk-blobs'))
    ) {
      count += 1;
    }
    return original.apply(this, arguments);
  };
  return {
    count: () => count,
    restore() {
      IDBDatabase.prototype.transaction = original;
    }
  };
}

async function sumChunkBlobStoreBytes(dbName) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('chunk-blobs')) {
        db.close();
        resolve(0);
        return;
      }
      let total = 0;
      const tx = db.transaction(['chunk-blobs'], 'readonly');
      const cursorReq = tx.objectStore('chunk-blobs').openCursor();
      cursorReq.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        const blob = cursor.value?.blob;
        if (blob && blob.size > 0) total += blob.size;
        cursor.continue();
      };
      tx.oncomplete = () => {
        db.close();
        resolve(total);
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

async function simulateUpgradedZeroedTotals(dbName, sessionId) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['meta', 'sessions', 'chunks'], 'readwrite');
      tx.objectStore('meta').delete(META_STATS_ID);
      const sessReq = tx.objectStore('sessions').get(sessionId);
      sessReq.onsuccess = () => {
        const row = sessReq.result;
        if (row) {
          row.sizeBytes = 0;
          tx.objectStore('sessions').put(row);
        }
      };
      const chunkCur = tx.objectStore('chunks').openCursor();
      chunkCur.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        const chunk = cursor.value;
        if (chunk.sessionId === sessionId) {
          chunk.sizeBytes = 0;
          cursor.update(chunk);
        }
        cursor.continue();
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

function deletePersistedStats() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(currentDbName);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['meta'], 'readwrite');
      tx.objectStore('meta').delete(META_STATS_ID);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

describe('getStorageStats — O(1) running totals, no blob cursor', () => {
  beforeEach(async () => {
    await openFreshDb();
  });

  afterEach(() => {
    sessionStore.closeDatabase();
  });

  it('with a valid cache, getStorageStats opens no IndexedDB transaction', async () => {
    const session = await sessionStore.createSession();
    await writeAudioChunk(session.id, 0, 1024);
    const warmed = await sessionStore.getStorageStats();
    assert.equal(warmed.chunkCount, 1);

    let txCount = 0;
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function transactionSpy() {
      txCount += 1;
      return original.apply(this, arguments);
    };
    try {
      const stats = await sessionStore.getStorageStats();
      assert.equal(txCount, 0, 'valid-cache getStorageStats must not open IndexedDB');
      assert.equal(stats.chunkCount, 1);
      assert.equal(stats.usedBytes, warmed.usedBytes);
    } finally {
      IDBDatabase.prototype.transaction = original;
    }
  });

  it('after N chunk writes, usedBytes matches sizeBytes sums without a chunks cursor or readwrite', async () => {
    const session = await sessionStore.createSession();
    const sizes = [1200, 3400, 5600, 64, 65536];
    for (let seq = 0; seq < sizes.length; seq += 1) {
      await writeAudioChunk(session.id, seq, sizes[seq]);
    }
    await sessionStore.log('session-store', 'info', 'stats check', {
      sessionId: session.id
    });

    const expectedChunkBytes = sizes.reduce((sum, n) => sum + n, 0);
    const cursorSpy = spyBlobStoreCursors();
    const rwSpy = spyBlobStoreReadwrite();
    try {
      const stats = await sessionStore.getStorageStats();
      assert.equal(cursorSpy.chunks(), 0, 'getStorageStats opened a chunks object-store cursor');
      assert.equal(cursorSpy.chunkBlobs(), 0, 'getStorageStats opened a chunk-blobs cursor');
      assert.equal(rwSpy.count(), 0, 'getStorageStats opened a chunks/chunk-blobs readwrite transaction');
      assert.equal(stats.chunkCount, sizes.length);
      assert.equal(stats.sessionCount, 1);
      assert.equal(stats.usedBytes, Math.round(expectedChunkBytes * 1.1) + stats.logBytes);
      assert.ok(stats.logEntryCount >= 1);
      assert.equal(
        stats.usedBytes,
        Math.round(getStatsCache().chunkBytes * 1.1) + stats.logBytes
      );
    } finally {
      cursorSpy.restore();
      rwSpy.restore();
    }
  });

  it('writeChunk and deleteSession keep cache and getStorageStats aligned', async () => {
    const keep = await sessionStore.createSession();
    const drop = await sessionStore.createSession();
    await writeAudioChunk(keep.id, 0, 2000);
    await writeAudioChunk(keep.id, 1, 3000);
    await writeAudioChunk(drop.id, 0, 4000);
    await sessionStore.log('capture-engine', 'info', 'drop logs', { sessionId: drop.id });
    await sessionStore.log('capture-engine', 'info', 'keep logs', { sessionId: keep.id });

    const before = await sessionStore.getStorageStats();
    assert.equal(before.sessionCount, 2);
    assert.equal(before.chunkCount, 3);
    assert.equal(before.usedBytes, Math.round((2000 + 3000 + 4000) * 1.1) + before.logBytes);
    assert.equal(before.logBytesByPackage['capture-engine'].count, 2);

    const deleted = await sessionStore.deleteSession(drop.id);
    assert.equal(deleted.deleted, true);

    const cursorSpy = spyBlobStoreCursors();
    try {
      const after = await sessionStore.getStorageStats();
      assert.equal(cursorSpy.chunks(), 0);
      assert.equal(cursorSpy.chunkBlobs(), 0);
      assert.equal(after.sessionCount, 1);
      assert.equal(after.chunkCount, 2);
      assert.equal(after.usedBytes, Math.round((2000 + 3000) * 1.1) + after.logBytes);
      assert.equal(after.logEntryCount, 1);
      assert.equal(after.logBytesByPackage['capture-engine'].count, 1);
    } finally {
      cursorSpy.restore();
    }
  });

  it('rehydrates persisted totals on init without scanning chunks', async () => {
    const session = await sessionStore.createSession();
    await writeAudioChunk(session.id, 0, 8000);
    await writeAudioChunk(session.id, 1, 2000);
    const before = await sessionStore.getStorageStats();

    await reopenSameDb();

    const cursorSpy = spyBlobStoreCursors();
    try {
      const after = await sessionStore.getStorageStats();
      assert.equal(cursorSpy.chunks(), 0);
      assert.equal(cursorSpy.chunkBlobs(), 0);
      assert.equal(after.usedBytes, before.usedBytes);
      assert.equal(after.chunkCount, 2);
      assert.equal(after.sessionCount, 1);
    } finally {
      cursorSpy.restore();
    }
  });

  it('never exposes the retention sentinel in getStorageStats when the cache is invalid', async () => {
    const session = await sessionStore.createSession();
    await writeAudioChunk(session.id, 0, 5000);

    sessionStore.closeDatabase();
    await deletePersistedStats();

    resetStatsCache();
    await sessionStore.init({ databaseName: currentDbName });

    const cursorSpy = spyBlobStoreCursors();
    try {
      const stats = await sessionStore.getStorageStats();
      assert.equal(cursorSpy.chunks(), 0);
      assert.equal(cursorSpy.chunkBlobs(), 0);
      if (!getStatsCache().valid) {
        assert.equal(stats.usedBytesKnown, false);
        assert.equal(stats.usedBytes, null);
        assert.notEqual(stats.usedBytes, UNKNOWN_USED_BYTES);
        assert.ok(['unknown', 'rebuilding'].includes(stats.usedBytesStatus));
      } else {
        assert.equal(stats.usedBytesKnown, true);
        assert.equal(stats.chunkCount, 1);
        assert.ok(stats.usedBytes >= Math.round(5000 * 1.1));
      }
    } finally {
      cursorSpy.restore();
    }
  });

  it('rebuilds real totals for upgraded rows missing session sizeBytes', async () => {
    const session = await sessionStore.createSession();
    await writeAudioChunk(session.id, 0, 12_000);
    await writeAudioChunk(session.id, 1, 8000);

    await new Promise((resolve, reject) => {
      const req = indexedDB.open(currentDbName);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['sessions', 'meta'], 'readwrite');
        tx.objectStore('meta').delete(META_STATS_ID);
        const getReq = tx.objectStore('sessions').get(session.id);
        getReq.onsuccess = () => {
          const row = getReq.result;
          if (row) {
            row.sizeBytes = 0;
            row.chunkCount = 2;
            tx.objectStore('sessions').put(row);
          }
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    sessionStore.closeDatabase();
    resetStatsCache();
    await sessionStore.init({ databaseName: currentDbName });

    const ready = await sessionStore.waitForStatsCacheValid(30_000);
    assert.equal(ready, true);
    const stats = await sessionStore.getStorageStats();
    assert.equal(stats.usedBytesKnown, true);
    assert.ok(stats.usedBytes >= Math.round(20_000 * 1.1));
    assert.notEqual(stats.usedBytes, UNKNOWN_USED_BYTES);

    const reopened = await sessionStore.getSession(session.id);
    assert.ok(reopened.sizeBytes >= 20_000);
  });

  it('rebuilt usedBytes matches chunk-blobs total when session and chunk sizeBytes were zeroed', async () => {
    const session = await sessionStore.createSession();
    await writeAudioChunk(session.id, 0, 48_000);
    await writeAudioChunk(session.id, 1, 32_000);
    const blobTotal = await sumChunkBlobStoreBytes(currentDbName);
    assert.ok(blobTotal >= 80_000);

    sessionStore.closeDatabase();
    await simulateUpgradedZeroedTotals(currentDbName, session.id);
    resetStatsCache();
    await sessionStore.init({ databaseName: currentDbName });

    const ready = await sessionStore.waitForStatsCacheValid(30_000);
    assert.equal(ready, true);
    const stats = await sessionStore.getStorageStats();
    const expectedUsed = Math.round(blobTotal * IDB_OVERHEAD);
    assert.equal(stats.usedBytesKnown, true);
    assert.equal(stats.usedBytes, expectedUsed);

    const reopened = await sessionStore.getSession(session.id);
    assert.equal(reopened.sizeBytes, blobTotal);
  });

  it('does not purge untranscribed audio when the stats cache is invalid', async () => {
    const session = await sessionStore.createSession();
    const chunkId = await writeAudioChunk(session.id, 0, 50_000);
    await sessionStore.writeSnip(session.id, {
      startChunkIndex: 0,
      endChunkIndex: 0,
      startTime: 0,
      endTime: 4,
      duration: 4,
      chunkIds: [chunkId],
      confidence: 0.9
    });

    sessionStore.closeDatabase();
    await deletePersistedStats();
    resetStatsCache();
    await sessionStore.init({ databaseName: currentDbName });

    const result = await sessionStore.enforceRetentionPolicy(1000);
    assert.equal(result.error, undefined, result.error);
    assert.ok(!result.purgedChunkIds || !result.purgedChunkIds.includes(chunkId));
    const chunk = await sessionStore.getChunk(chunkId);
    assert.equal(chunk.sizeBytes, 50_000);
    assert.equal(chunk.blob.size, 50_000);
    assert.equal(sessionStore.isChunkAudioPurged(chunk), false);
  });
});
