import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import * as sessionStore from './index.js';
import { CHUNK_BLOBS_STORE } from './db.js';

let dbSeq = 0;

async function openFreshDb(name = `web-whisper-chunk-meta-${++dbSeq}`) {
  sessionStore.closeDatabase();
  await sessionStore.init({ databaseName: name });
  return name;
}

function audioBlob(sizeBytes, fill = 7) {
  return new Blob([new Uint8Array(sizeBytes).fill(fill)], { type: 'audio/mpeg' });
}

function chunkPayload(seq, sizeBytes = 64) {
  return {
    seq,
    startTime: seq * 4,
    endTime: (seq + 1) * 4,
    duration: 4,
    blob: audioBlob(sizeBytes, seq + 1),
    sizeBytes
  };
}

function installStoreProbe() {
  const stats = {
    chunkBlobsGets: 0,
    chunkBlobsGetAlls: 0,
    chunkBlobsCursors: 0,
    chunkBlobsBytes: 0,
    chunksIndexGetAlls: 0,
    chunksIndexCursors: 0,
    chunksCursorBlobBytes: 0,
    sessionGets: 0
  };

  const storeProto = IDBObjectStore.prototype;
  const indexProto = IDBIndex.prototype;
  const origStoreGet = storeProto.get;
  const origStoreGetAll = storeProto.getAll;
  const origStoreOpenCursor = storeProto.openCursor;
  const origIndexGetAll = indexProto.getAll;
  const origIndexOpenCursor = indexProto.openCursor;

  function noteBlob(storeName, value) {
    if (storeName !== CHUNK_BLOBS_STORE) return;
    const size = value?.blob?.size || (value?.size > 0 ? value.size : 0);
    stats.chunkBlobsBytes += size || 0;
  }

  storeProto.get = function getWrapped(...args) {
    const req = origStoreGet.apply(this, args);
    const storeName = this.name;
    req.addEventListener('success', () => {
      if (storeName === CHUNK_BLOBS_STORE) {
        stats.chunkBlobsGets += 1;
        noteBlob(storeName, req.result);
      }
      if (storeName === 'sessions') stats.sessionGets += 1;
    });
    return req;
  };

  storeProto.getAll = function getAllWrapped(...args) {
    const req = origStoreGetAll.apply(this, args);
    const storeName = this.name;
    req.addEventListener('success', () => {
      if (storeName === CHUNK_BLOBS_STORE) {
        stats.chunkBlobsGetAlls += 1;
        for (const row of req.result || []) noteBlob(storeName, row);
      }
    });
    return req;
  };

  storeProto.openCursor = function openCursorWrapped(...args) {
    const req = origStoreOpenCursor.apply(this, args);
    const storeName = this.name;
    if (storeName === CHUNK_BLOBS_STORE) stats.chunkBlobsCursors += 1;
    req.addEventListener('success', () => {
      const cursor = req.result;
      if (cursor && storeName === 'chunks') {
        stats.chunksCursorBlobBytes += cursor.value?.blob?.size || 0;
      }
      if (cursor && storeName === CHUNK_BLOBS_STORE) {
        noteBlob(storeName, cursor.value);
      }
    });
    return req;
  };

  indexProto.getAll = function indexGetAllWrapped(...args) {
    const req = origIndexGetAll.apply(this, args);
    const storeName = this.objectStore.name;
    req.addEventListener('success', () => {
      if (storeName === 'chunks') {
        stats.chunksIndexGetAlls += 1;
        for (const row of req.result || []) {
          stats.chunksCursorBlobBytes += row?.blob?.size || 0;
        }
      }
    });
    return req;
  };

  indexProto.openCursor = function indexOpenCursorWrapped(...args) {
    const req = origIndexOpenCursor.apply(this, args);
    const storeName = this.objectStore.name;
    if (storeName === 'chunks') stats.chunksIndexCursors += 1;
    req.addEventListener('success', () => {
      const cursor = req.result;
      if (cursor && storeName === 'chunks') {
        stats.chunksCursorBlobBytes += cursor.value?.blob?.size || 0;
      }
    });
    return req;
  };

  return {
    stats,
    restore() {
      storeProto.get = origStoreGet;
      storeProto.getAll = origStoreGetAll;
      storeProto.openCursor = origStoreOpenCursor;
      indexProto.getAll = origIndexGetAll;
      indexProto.openCursor = origIndexOpenCursor;
    }
  };
}

describe('chunk metadata reads without blobs', () => {
  beforeEach(async () => {
    await openFreshDb();
  });

  afterEach(() => {
    sessionStore.closeDatabase();
  });

  it('getChunksForSession returns 357 metas and does not deserialize 64 KB blobs', async () => {
    const session = await sessionStore.createSession();
    const sizeBytes = 64 * 1024;
    for (let seq = 0; seq < 357; seq += 1) {
      const written = await sessionStore.writeChunk(session.id, chunkPayload(seq, sizeBytes));
      assert.ok(written.chunkId, written.error);
    }

    const probe = installStoreProbe();
    const listed = await sessionStore.getChunksForSession(session.id);
    probe.restore();

    assert.equal(listed.error, undefined, listed.error);
    assert.equal(listed.chunks.length, 357);
    for (const chunk of listed.chunks) {
      assert.equal(Object.prototype.hasOwnProperty.call(chunk, 'blob'), false);
      assert.equal(chunk.blob, undefined);
      assert.equal(chunk.sizeBytes, sizeBytes);
    }
    assert.equal(probe.stats.chunkBlobsGets, 0);
    assert.equal(probe.stats.chunkBlobsGetAlls, 0);
    assert.equal(probe.stats.chunkBlobsCursors, 0);
    assert.equal(probe.stats.chunkBlobsBytes, 0);
    assert.equal(probe.stats.chunksCursorBlobBytes, 0);
    assert.ok(
      probe.stats.chunkBlobsBytes < sizeBytes,
      `blob-store accounted ${probe.stats.chunkBlobsBytes} bytes; expected none of ~${357 * sizeBytes}`
    );

    const full = await sessionStore.getChunk(listed.chunks[0].id);
    assert.ok(full);
    assert.equal(full.blob.size, sizeBytes);
    assert.equal(full.seq, 0);
  });

  it('getChunkCoverage is a session-row read and updates after filling a gap', async () => {
    const session = await sessionStore.createSession();
    const present = [0, 1, 2, 3, 5, 6, 8, 9];
    for (const seq of present) {
      const written = await sessionStore.writeChunk(session.id, chunkPayload(seq, 16));
      assert.ok(written.chunkId, written.error);
    }

    const probe = installStoreProbe();
    const coverage = await sessionStore.getChunkCoverage(session.id);
    probe.restore();

    assert.equal(coverage.error, undefined, coverage.error);
    assert.deepEqual(coverage.missingSeqs, [4, 7]);
    assert.equal(coverage.savedCount, 8);
    assert.equal(coverage.lastSeq, 9);
    assert.equal(coverage.savedDurationMs, 8 * 4000);
    assert.equal(probe.stats.chunkBlobsGets, 0);
    assert.equal(probe.stats.chunkBlobsBytes, 0);
    assert.equal(probe.stats.chunksIndexGetAlls, 0);
    assert.equal(probe.stats.chunksIndexCursors, 0);
    assert.equal(probe.stats.chunksCursorBlobBytes, 0);

    const listed = await sessionStore.listSessions();
    const row = listed.sessions.find((item) => item.id === session.id);
    assert.ok(row);
    assert.deepEqual(row.missingSeqs, [4, 7]);
    assert.equal(row.savedDurationMs, 8 * 4000);
    assert.equal(row.savedCount, 8);

    const filled = await sessionStore.writeChunk(session.id, chunkPayload(4, 16));
    assert.ok(filled.chunkId, filled.error);
    const after = await sessionStore.getChunkCoverage(session.id);
    assert.deepEqual(after.missingSeqs, [7]);
    assert.equal(after.savedCount, 9);
    assert.equal(after.savedDurationMs, 9 * 4000);
  });

  it('v3 blob-on-chunk rows migrate without losing audio', async () => {
    sessionStore.closeDatabase();
    const name = `web-whisper-v3-upgrade-${++dbSeq}`;
    const v3 = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 3);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const sessionsStore = db.createObjectStore('sessions', { keyPath: 'id' });
        sessionsStore.createIndex('by-createdAt', 'createdAt', { unique: false });
        const chunksStore = db.createObjectStore('chunks', { keyPath: 'id' });
        chunksStore.createIndex('by-sessionId', 'sessionId', { unique: false });
        chunksStore.createIndex('by-sessionId-seq', ['sessionId', 'seq'], { unique: false });
        db.createObjectStore('volume-profiles', { keyPath: 'sessionId' });
        const snipsStore = db.createObjectStore('snips', { keyPath: 'id' });
        snipsStore.createIndex('by-sessionId', 'sessionId', { unique: false });
        const transcriptsStore = db.createObjectStore('transcripts', { keyPath: 'snipId' });
        transcriptsStore.createIndex('by-sessionId', 'sessionId', { unique: false });
        const logsStore = db.createObjectStore('logs', { keyPath: 'id' });
        logsStore.createIndex('by-sessionId', 'sessionId', { unique: false });
        logsStore.createIndex('by-packageId', 'packageId', { unique: false });
        logsStore.createIndex('by-createdAt', 'createdAt', { unique: false });
        logsStore.createIndex('by-sessionId-createdAt', ['sessionId', 'createdAt'], {
          unique: false
        });
        db.createObjectStore('meta', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    const sessionId = 'ses_v3_legacy';
    const now = new Date().toISOString();
    const bytes = new Uint8Array(2048).fill(42);
    await new Promise((resolve, reject) => {
      const tx = v3.transaction(['sessions', 'chunks'], 'readwrite');
      tx.objectStore('sessions').put({
        id: sessionId,
        createdAt: now,
        updatedAt: now,
        duration: 4,
        chunkCount: 1,
        sizeBytes: 2048,
        hasVolumeProfile: false,
        hasSnips: false,
        hasTranscript: false,
        status: 'ready'
      });
      tx.objectStore('chunks').put({
        id: 'chunk_v3_0',
        sessionId,
        seq: 0,
        startTime: 0,
        endTime: 4,
        duration: 4,
        blob: new Blob([bytes], { type: 'audio/mpeg' }),
        sizeBytes: 2048
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    v3.close();

    await sessionStore.init({ databaseName: name });
    const migrated = await sessionStore.migrateLegacyChunkBlobs();
    assert.equal(migrated.done, true);

    const listed = await sessionStore.getChunksForSession(sessionId);
    assert.equal(listed.chunks.length, 1);
    assert.equal(listed.chunks[0].blob, undefined);
    assert.equal(listed.chunks[0].sizeBytes, 2048);

    const full = await sessionStore.getChunk('chunk_v3_0');
    assert.ok(full);
    assert.equal(full.blob.size, 2048);
    assert.deepEqual(new Uint8Array(await full.blob.arrayBuffer()), bytes);

    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const storedMeta = await new Promise((resolve, reject) => {
      const tx = db.transaction(['chunks'], 'readonly');
      const req = tx.objectStore('chunks').get('chunk_v3_0');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    assert.equal(storedMeta.blob, undefined);
    const blobRow = await new Promise((resolve, reject) => {
      const tx = db.transaction([CHUNK_BLOBS_STORE], 'readonly');
      const req = tx.objectStore(CHUNK_BLOBS_STORE).get('chunk_v3_0');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    assert.ok(blobRow);
    assert.equal(blobRow.blob.size, 2048);
    db.close();

    const coverage = await sessionStore.getChunkCoverage(sessionId);
    assert.equal(coverage.savedCount, 1);
    assert.equal(coverage.lastSeq, 0);
    assert.deepEqual(coverage.missingSeqs, []);
    assert.equal(coverage.savedDurationMs, 4000);

    const again = await sessionStore.migrateLegacyChunkBlobs();
    assert.equal(again.done, true);
    const still = await sessionStore.getChunk('chunk_v3_0');
    assert.equal(still.blob.size, 2048);
  });
});
