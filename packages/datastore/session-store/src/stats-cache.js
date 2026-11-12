/**
 * Running storage totals so retention can cheap-exit under cap with no
 * transaction and no in-flight flag. Updated on every write/delete.
 *
 * When valid, getStorageStats is O(1) and never opens a `chunk-blobs` or
 * `chunks` cursor. Totals are persisted in `meta` so boot hydrates without
 * walking audio. Rebuild uses session-row `sizeBytes` / `chunkCount`, never
 * the blob store. If the cache is invalid, usedBytes is treated as
 * unknown/high — never as 0 — so retention cannot cheap-exit under cap from
 * a stale-low total.
 */

import { getDatabase } from './db.js';
import { enqueueHousekeeping } from './scheduler.js';
import {
  DEFAULT_CAP_BYTES,
  IDB_OVERHEAD,
  META_RUNTIME_ID,
  META_STATS_ID,
  UNKNOWN_USED_BYTES
} from './constants.js';

const emptyByPackage = () => ({});

const empty = () => ({
  valid: false,
  chunkBytes: 0,
  chunkCount: 0,
  logBytes: 0,
  logEntryCount: 0,
  oldestLogCreatedAt: null,
  sessionCount: 0,
  logWriteFailures: 0,
  logBytesByPackage: emptyByPackage(),
  capBytes: DEFAULT_CAP_BYTES
});

let cache = empty();
let mutationSeq = 0;
let persistChain = Promise.resolve();
let persistDirty = false;
let rebuildScheduled = false;
let generation = 0;

export function resetStatsCache() {
  generation += 1;
  cache = empty();
  mutationSeq = 0;
  persistDirty = false;
  rebuildScheduled = false;
  persistChain = Promise.resolve();
}

export function getStatsCache() {
  return cache;
}

export function usedBytesFromSizes(chunkBytes, logBytes) {
  return Math.round((chunkBytes || 0) * IDB_OVERHEAD) + Math.round((logBytes || 0) * IDB_OVERHEAD);
}

export function cachedUsedBytes() {
  if (!cache.valid) return UNKNOWN_USED_BYTES;
  return usedBytesFromSizes(cache.chunkBytes, cache.logBytes);
}

export function setCapBytes(capBytes) {
  if (Number.isFinite(capBytes) && capBytes >= 0) {
    cache.capBytes = capBytes;
  }
}

function cloneByPackage(byPackage) {
  const out = {};
  if (!byPackage || typeof byPackage !== 'object') return out;
  for (const [key, row] of Object.entries(byPackage)) {
    out[key] = {
      bytes: row?.bytes || 0,
      count: row?.count || 0
    };
  }
  return out;
}

function addPackageBytes(packageId, sizeBytes, count = 1) {
  const key = packageId || 'unknown';
  if (!cache.logBytesByPackage[key]) {
    cache.logBytesByPackage[key] = { bytes: 0, count: 0 };
  }
  cache.logBytesByPackage[key].bytes += sizeBytes || 0;
  cache.logBytesByPackage[key].count += count;
}

function subtractPackageBytes(packageId, sizeBytes, count = 1) {
  const key = packageId || 'unknown';
  const row = cache.logBytesByPackage[key];
  if (!row) return;
  row.bytes = Math.max(0, row.bytes - (sizeBytes || 0));
  row.count = Math.max(0, row.count - count);
  if (row.bytes === 0 && row.count === 0) {
    delete cache.logBytesByPackage[key];
  }
}

function afterMutation() {
  mutationSeq += 1;
  if (!cache.valid) return Promise.resolve();
  return persistStatsCache();
}

export function addChunkBytes(sizeBytes, count = 1) {
  if (cache.valid) {
    cache.chunkBytes += sizeBytes || 0;
    cache.chunkCount += count;
  }
  return afterMutation();
}

export function subtractChunkBytes(sizeBytes, count = 0) {
  if (cache.valid) {
    cache.chunkBytes = Math.max(0, cache.chunkBytes - (sizeBytes || 0));
    cache.chunkCount = Math.max(0, cache.chunkCount - count);
  }
  return afterMutation();
}

export function addSessionCount(n = 1) {
  if (cache.valid) {
    cache.sessionCount += n;
  }
  return afterMutation();
}

export function subtractSessionCount(n = 1) {
  if (cache.valid) {
    cache.sessionCount = Math.max(0, cache.sessionCount - n);
  }
  return afterMutation();
}

function noteOldestLog(createdAt) {
  if (typeof createdAt !== 'string' || createdAt.length === 0) return;
  if (!cache.oldestLogCreatedAt || createdAt < cache.oldestLogCreatedAt) {
    cache.oldestLogCreatedAt = createdAt;
  }
}

export function addLogRow(sizeBytes, createdAt, packageId) {
  if (cache.valid) {
    cache.logBytes += sizeBytes || 0;
    cache.logEntryCount += 1;
    noteOldestLog(createdAt);
    addPackageBytes(packageId, sizeBytes || 0, 1);
  }
  return afterMutation();
}

export function subtractLogRows(count, bytes, nextOldestCreatedAt = undefined, byPackage = null) {
  if (cache.valid) {
    cache.logEntryCount = Math.max(0, cache.logEntryCount - (count || 0));
    cache.logBytes = Math.max(0, cache.logBytes - (bytes || 0));
    if (nextOldestCreatedAt !== undefined) {
      cache.oldestLogCreatedAt = nextOldestCreatedAt;
    }
    if (byPackage && typeof byPackage === 'object') {
      for (const [packageId, delta] of Object.entries(byPackage)) {
        subtractPackageBytes(packageId, delta?.bytes || 0, delta?.count || 0);
      }
    }
  }
  return afterMutation();
}

export function setOldestLogCreatedAt(createdAt) {
  cache.oldestLogCreatedAt = createdAt;
  return afterMutation();
}

export function incrementLogWriteFailures() {
  cache.logWriteFailures += 1;
  persistLogWriteFailures();
  afterMutation();
  return cache.logWriteFailures;
}

export function getLogWriteFailures() {
  return cache.logWriteFailures;
}

export function cacheNeedsAgePrune(now, maxLogAgeMs) {
  if (!cache.oldestLogCreatedAt) return false;
  const cutoff = new Date(now - maxLogAgeMs).toISOString();
  return cache.oldestLogCreatedAt < cutoff;
}

export function cacheNeedsCountPrune(maxLogCount) {
  return cache.logEntryCount > maxLogCount;
}

function persistLogWriteFailures() {
  getDatabase()
    .then((db) => {
      if (!db.objectStoreNames.contains('meta')) return;
      const tx = db.transaction(['meta'], 'readwrite');
      tx.objectStore('meta').put({
        id: META_RUNTIME_ID,
        logWriteFailures: cache.logWriteFailures
      });
    })
    .catch(() => {
      // Counter stays in memory; next successful persist will write it.
    });
}

function snapshotRecord() {
  return {
    id: META_STATS_ID,
    chunkBytes: cache.chunkBytes,
    chunkCount: cache.chunkCount,
    logBytes: cache.logBytes,
    logEntryCount: cache.logEntryCount,
    oldestLogCreatedAt: cache.oldestLogCreatedAt,
    sessionCount: cache.sessionCount,
    logWriteFailures: cache.logWriteFailures,
    logBytesByPackage: cloneByPackage(cache.logBytesByPackage),
    capBytes: cache.capBytes || DEFAULT_CAP_BYTES
  };
}

function applySnapshot(row) {
  const capBytes = cache.capBytes || DEFAULT_CAP_BYTES;
  cache = {
    valid: true,
    chunkBytes: row.chunkBytes || 0,
    chunkCount: row.chunkCount || 0,
    logBytes: row.logBytes || 0,
    logEntryCount: row.logEntryCount || 0,
    oldestLogCreatedAt: row.oldestLogCreatedAt || null,
    sessionCount: row.sessionCount || 0,
    logWriteFailures:
      typeof row.logWriteFailures === 'number' ? row.logWriteFailures : cache.logWriteFailures,
    logBytesByPackage: cloneByPackage(row.logBytesByPackage),
    capBytes: Number.isFinite(row.capBytes) ? row.capBytes : capBytes
  };
}

function isUsableSnapshot(row) {
  return (
    row &&
    typeof row === 'object' &&
    typeof row.chunkBytes === 'number' &&
    typeof row.chunkCount === 'number' &&
    typeof row.sessionCount === 'number'
  );
}

async function persistOnce() {
  if (!cache.valid) return;
  const gen = generation;
  const record = snapshotRecord();
  try {
    const db = await getDatabase();
    if (gen !== generation || !cache.valid) return;
    if (!db.objectStoreNames.contains('meta')) return;
    await new Promise((resolve) => {
      const tx = db.transaction(['meta'], 'readwrite');
      tx.objectStore('meta').put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // In-memory totals stay; next persist retries.
  }
}

async function drainPersist() {
  while (persistDirty && cache.valid) {
    persistDirty = false;
    await persistOnce();
  }
}

export function persistStatsCache() {
  if (!cache.valid) return persistChain;
  persistDirty = true;
  persistChain = persistChain.then(drainPersist, drainPersist);
  return persistChain;
}

export async function flushStatsPersist() {
  persistDirty = true;
  await persistStatsCache();
}

function countStore(db, storeName) {
  return new Promise((resolve) => {
    if (!db.objectStoreNames.contains(storeName)) {
      resolve(0);
      return;
    }
    const tx = db.transaction([storeName], 'readonly');
    const req = tx.objectStore(storeName).count();
    let count = 0;
    req.onsuccess = () => {
      count = req.result || 0;
    };
    tx.oncomplete = () => resolve(count);
    tx.onerror = () => resolve(0);
  });
}

function getMetaRow(db, id) {
  return new Promise((resolve) => {
    if (!db.objectStoreNames.contains('meta')) {
      resolve(null);
      return;
    }
    const tx = db.transaction(['meta'], 'readonly');
    const req = tx.objectStore('meta').get(id);
    let row = null;
    req.onsuccess = () => {
      row = req.result || null;
    };
    tx.oncomplete = () => resolve(row);
    tx.onerror = () => resolve(null);
  });
}

/**
 * Load persisted totals. Never opens a chunks cursor.
 * @returns {Promise<object>}
 */
export async function hydrateStatsCache() {
  if (cache.valid) return cache;
  try {
    const db = await getDatabase();
    const [snapshot, runtime] = await Promise.all([
      getMetaRow(db, META_STATS_ID),
      getMetaRow(db, META_RUNTIME_ID)
    ]);
    if (runtime && typeof runtime.logWriteFailures === 'number') {
      cache.logWriteFailures = runtime.logWriteFailures;
    }
    if (isUsableSnapshot(snapshot)) {
      applySnapshot(snapshot);
      if (typeof runtime?.logWriteFailures === 'number') {
        cache.logWriteFailures = Math.max(cache.logWriteFailures, runtime.logWriteFailures);
      }
      return cache;
    }
    const [sessionCount, logEntryCount] = await Promise.all([
      countStore(db, 'sessions'),
      countStore(db, 'logs')
    ]);
    if (sessionCount === 0 && logEntryCount === 0) {
      resetCacheToEmpty();
      await persistStatsCache();
      return cache;
    }
    cache.valid = false;
    return cache;
  } catch {
    cache.valid = false;
    return cache;
  }
}

const REBUILD_BATCH = 64;

async function scanLogsBatched(yieldToCustomer) {
  const db = await getDatabase();
  if (!db.objectStoreNames.contains('logs')) {
    return { logBytes: 0, logEntryCount: 0, oldestLogCreatedAt: null, logBytesByPackage: {} };
  }
  let logBytes = 0;
  let logEntryCount = 0;
  let oldestLogCreatedAt = null;
  const logBytesByPackage = {};
  let afterKey = null;
  while (true) {
    const { rows, done } = await new Promise((resolve, reject) => {
      const tx = db.transaction(['logs'], 'readonly');
      const store = tx.objectStore('logs');
      const range = afterKey != null ? IDBKeyRange.lowerBound(afterKey, true) : null;
      const req = range ? store.openCursor(range) : store.openCursor();
      const rows = [];
      req.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor || rows.length >= REBUILD_BATCH) return;
        rows.push({ key: cursor.key, value: cursor.value });
        cursor.continue();
      };
      tx.oncomplete = () => {
        resolve({ rows, done: rows.length < REBUILD_BATCH });
      };
      tx.onerror = () => reject(tx.error);
    });
    for (const row of rows) {
      afterKey = row.key;
      const rec = row.value;
      const bytes = rec.sizeBytes || 0;
      logBytes += bytes;
      logEntryCount += 1;
      if (rec.createdAt && (!oldestLogCreatedAt || rec.createdAt < oldestLogCreatedAt)) {
        oldestLogCreatedAt = rec.createdAt;
      }
      const key = rec.packageId || 'unknown';
      if (!logBytesByPackage[key]) logBytesByPackage[key] = { bytes: 0, count: 0 };
      logBytesByPackage[key].bytes += bytes;
      logBytesByPackage[key].count += 1;
    }
    if (done) break;
    if (yieldToCustomer) await yieldToCustomer();
  }
  return { logBytes, logEntryCount, oldestLogCreatedAt, logBytesByPackage };
}

async function scanSessionsTotals(yieldToCustomer) {
  const db = await getDatabase();
  if (!db.objectStoreNames.contains('sessions')) {
    return { sessionCount: 0, chunkBytes: 0, chunkCount: 0 };
  }
  let sessionCount = 0;
  let chunkBytes = 0;
  let chunkCount = 0;
  let afterKey = null;
  while (true) {
    const { rows, done } = await new Promise((resolve, reject) => {
      const tx = db.transaction(['sessions'], 'readonly');
      const store = tx.objectStore('sessions');
      const range = afterKey != null ? IDBKeyRange.lowerBound(afterKey, true) : null;
      const req = range ? store.openCursor(range) : store.openCursor();
      const rows = [];
      req.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor || rows.length >= REBUILD_BATCH) return;
        rows.push({ key: cursor.key, value: cursor.value });
        cursor.continue();
      };
      tx.oncomplete = () => resolve({ rows, done: rows.length < REBUILD_BATCH });
      tx.onerror = () => reject(tx.error);
    });
    for (const row of rows) {
      afterKey = row.key;
      sessionCount += 1;
      chunkBytes += row.value.sizeBytes || 0;
      chunkCount += row.value.chunkCount || 0;
    }
    if (done) break;
    if (yieldToCustomer) await yieldToCustomer();
  }
  return { sessionCount, chunkBytes, chunkCount };
}

async function scanTotals(yieldToCustomer) {
  const db = await getDatabase();
  const runtime = await getMetaRow(db, META_RUNTIME_ID);
  const [sessions, logs] = await Promise.all([
    scanSessionsTotals(yieldToCustomer),
    scanLogsBatched(yieldToCustomer)
  ]);
  return {
    chunkBytes: sessions.chunkBytes,
    chunkCount: sessions.chunkCount,
    sessionCount: sessions.sessionCount,
    logBytes: logs.logBytes,
    logEntryCount: logs.logEntryCount,
    oldestLogCreatedAt: logs.oldestLogCreatedAt,
    logBytesByPackage: logs.logBytesByPackage,
    logWriteFailures:
      runtime && typeof runtime.logWriteFailures === 'number'
        ? runtime.logWriteFailures
        : cache.logWriteFailures,
    capBytes: cache.capBytes || DEFAULT_CAP_BYTES
  };
}

/**
 * Rebuild totals without walking `chunk-blobs`. Uses session rows
 * (`sizeBytes` / `chunkCount`) plus a batched logs scan that yields to
 * customer writes. Never blocks listSessions / writeChunk. Never cursors
 * audio blobs.
 */
export async function rebuildStatsCache(yieldToCustomer = async () => {}) {
  const capBytes = cache.capBytes || DEFAULT_CAP_BYTES;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const startSeq = mutationSeq;
    let scanned;
    try {
      scanned = await scanTotals(yieldToCustomer);
    } catch {
      cache.valid = false;
      return cache;
    }
    if (mutationSeq !== startSeq) {
      if (yieldToCustomer) await yieldToCustomer();
      continue;
    }
    cache = {
      valid: true,
      chunkBytes: scanned.chunkBytes,
      chunkCount: scanned.chunkCount,
      logBytes: scanned.logBytes,
      logEntryCount: scanned.logEntryCount,
      oldestLogCreatedAt: scanned.oldestLogCreatedAt,
      sessionCount: scanned.sessionCount,
      logWriteFailures: scanned.logWriteFailures,
      logBytesByPackage: cloneByPackage(scanned.logBytesByPackage),
      capBytes
    };
    await persistStatsCache();
    return cache;
  }
  cache.valid = false;
  return cache;
}

/**
 * Customer path: load persisted totals only. Never scans `chunk-blobs`.
 */
export async function ensureStatsCache() {
  if (cache.valid) return cache;
  return hydrateStatsCache();
}

export function scheduleStatsRebuild() {
  if (cache.valid || rebuildScheduled) return;
  rebuildScheduled = true;
  enqueueHousekeeping(async (yieldToCustomer) => {
    try {
      if (cache.valid) return;
      await rebuildStatsCache(yieldToCustomer);
    } finally {
      rebuildScheduled = false;
    }
  });
}

export function markCacheValid() {
  cache.valid = true;
}

export function resetCacheToEmpty() {
  const capBytes = cache.capBytes;
  const logWriteFailures = cache.logWriteFailures;
  cache = empty();
  cache.valid = true;
  cache.capBytes = capBytes;
  cache.logWriteFailures = logWriteFailures;
  return persistStatsCache();
}

export function statsToPublic(capBytes = DEFAULT_CAP_BYTES) {
  const logBytesByPackage = cloneByPackage(cache.logBytesByPackage);
  if (!cache.valid) {
    return {
      usedBytes: UNKNOWN_USED_BYTES,
      capBytes,
      sessionCount: cache.sessionCount,
      chunkCount: cache.chunkCount,
      logBytes: Math.round((cache.logBytes || 0) * IDB_OVERHEAD),
      logEntryCount: cache.logEntryCount,
      logWriteFailures: cache.logWriteFailures,
      logBytesByPackage
    };
  }
  const logBytes = Math.round((cache.logBytes || 0) * IDB_OVERHEAD);
  return {
    usedBytes: usedBytesFromSizes(cache.chunkBytes, cache.logBytes),
    capBytes,
    sessionCount: cache.sessionCount,
    chunkCount: cache.chunkCount,
    logBytes,
    logEntryCount: cache.logEntryCount,
    logWriteFailures: cache.logWriteFailures,
    logBytesByPackage
  };
}
