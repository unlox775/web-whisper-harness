/**
 * Durable per-package logs in IndexedDB.
 *
 * Lazy contract (load-bearing):
 * 1. Resolve session id: options.sessionId ?? config.activeSessionId
 * 2. Missing / empty session id → do not invoke a function payload
 * 3. Package level defaults to info; off gates everything
 * 4. Level below configured → do not invoke a function payload
 * 5. Only then invoke payload and persist
 */

import { getDatabase, generateId } from './db.js';
import { enqueueCustomer } from './scheduler.js';
import {
  addLogRow,
  getStatsCache,
  incrementLogWriteFailures,
  setOldestLogCreatedAt,
  subtractLogRows
} from './stats-cache.js';
import { LOG_PRUNE_BATCH_SIZE } from './constants.js';

let injectLogWriteFailure = false;

/**
 * Test hook: next persist attempts fail and increment logWriteFailures.
 * @param {boolean} enabled
 */
export function setLogWriteFailureForTests(enabled) {
  injectLogWriteFailure = Boolean(enabled);
}

export const LOGS_STORE = 'logs';

/** Frozen package ids used by Settings. Unknown ids may still persist. */
export const PACKAGE_IDS = Object.freeze([
  'session-store',
  'capture-engine',
  'volume-analyzer',
  'transcription-client',
  'playback-engine',
  'web-whisper-pwa'
]);

export const LOG_LEVELS = Object.freeze(['debug', 'info', 'warn', 'error', 'off']);
export const PERSISTED_LEVELS = Object.freeze(['debug', 'info', 'warn', 'error']);

/** Rank: debug < info < warn < error. `off` is not a persistable level. */
export const LEVEL_RANK = Object.freeze({
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
});

/** Age-based log prune window. Documented constant (14 days). */
export const MAX_LOG_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const DEFAULT_LEVEL = 'info';
const DEFAULT_QUERY_LIMIT = 500;

let loggerConfig = {
  levels: {},
  activeSessionId: null
};

function cloneLevels(levels) {
  return { ...(levels || {}) };
}

function normalizeSessionId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function packageLevel(packageId) {
  const configured = loggerConfig.levels?.[packageId];
  if (configured === 'off') return 'off';
  if (PERSISTED_LEVELS.includes(configured)) return configured;
  return DEFAULT_LEVEL;
}

function isPersistedLevel(level) {
  return PERSISTED_LEVELS.includes(level);
}

/**
 * In-memory gates. PWA Settings owns persisted levels (localStorage).
 * Passing `levels` replaces the in-memory map. `activeSessionId: null` clears.
 *
 * @param {{ levels?: Record<string, string>, activeSessionId?: string | null }} [options]
 * @returns {void | { error: string }}
 */
export function configureLogger(options = {}) {
  try {
    if (options && typeof options === 'object' && options.levels && typeof options.levels === 'object') {
      const next = {};
      for (const [packageId, level] of Object.entries(options.levels)) {
        if (typeof packageId === 'string' && LOG_LEVELS.includes(level)) {
          next[packageId] = level;
        }
      }
      loggerConfig.levels = next;
    }
    if (options && typeof options === 'object' && Object.prototype.hasOwnProperty.call(options, 'activeSessionId')) {
      loggerConfig.activeSessionId = normalizeSessionId(options.activeSessionId);
    }
    return undefined;
  } catch {
    return { error: 'database_unavailable' };
  }
}

/**
 * @returns {{ levels: Record<string, string>, activeSessionId: string | null }}
 */
export function getLoggerConfig() {
  return {
    levels: cloneLevels(loggerConfig.levels),
    activeSessionId: loggerConfig.activeSessionId
  };
}

/**
 * Test helper: reset in-memory logger gates.
 */
export function resetLoggerConfig() {
  loggerConfig = { levels: {}, activeSessionId: null };
}

function sanitizeDetails(details) {
  if (details === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(details));
  } catch {
    try {
      return String(details);
    } catch {
      return undefined;
    }
  }
}

function resolvePayload(payload) {
  const value = typeof payload === 'function' ? payload() : payload;
  if (typeof value === 'string') {
    return { message: value };
  }
  if (value && typeof value === 'object') {
    const message = value.message == null ? '' : String(value.message);
    const details = Object.prototype.hasOwnProperty.call(value, 'details')
      ? sanitizeDetails(value.details)
      : undefined;
    return details === undefined ? { message } : { message, details };
  }
  return { message: value == null ? '' : String(value) };
}

function estimateSizeBytes(row) {
  try {
    return new TextEncoder().encode(JSON.stringify(row)).length;
  } catch {
    return (row.message || '').length;
  }
}

function mapQuotaOrUnavailable(error) {
  const name = error?.name || '';
  const message = String(error?.message || '');
  if (name === 'QuotaExceededError' || /quota/i.test(message)) {
    return { error: 'quota_exceeded', class: 'permanent' };
  }
  return { error: 'database_unavailable', class: 'permanent' };
}

function failLogWrite(error) {
  incrementLogWriteFailures();
  return mapQuotaOrUnavailable(error);
}

/**
 * Persist a log row after both gates pass. Never throws.
 *
 * @param {string} packageId
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string | (() => string | { message: string, details?: unknown })} payload
 * @param {{ sessionId?: string }} [options]
 * @returns {Promise<{ written: true, id: string } | { skipped: true, reason: string } | { error: string }>}
 */
export async function log(packageId, level, payload, options = {}) {
  try {
    const sessionId = normalizeSessionId(options?.sessionId) ?? loggerConfig.activeSessionId;
    if (!sessionId) {
      return { skipped: true, reason: 'no_active_session' };
    }

    if (!isPersistedLevel(level)) {
      return { skipped: true, reason: 'gated_level' };
    }

    const configured = packageLevel(packageId);
    if (configured === 'off' || LEVEL_RANK[level] < LEVEL_RANK[configured]) {
      return { skipped: true, reason: 'gated_level' };
    }

    const resolved = resolvePayload(payload);
    const createdAt = new Date().toISOString();
    const row = {
      id: generateId('log'),
      sessionId,
      packageId: typeof packageId === 'string' ? packageId : String(packageId),
      level,
      message: resolved.message,
      createdAt
    };
    if (resolved.details !== undefined) {
      row.details = resolved.details;
    }
    row.sizeBytes = estimateSizeBytes(row);
    return enqueueCustomer(() => putLogRecordUnlocked(row));
  } catch (err) {
    return failLogWrite(err);
  }
}

/**
 * Write a fully-formed log row (import / tests). Generates id when missing.
 *
 * @param {object} row
 * @returns {Promise<{ written: true, id: string } | { error: string }>}
 */
async function putLogRecordUnlocked(row) {
  try {
    if (injectLogWriteFailure) {
      incrementLogWriteFailures();
      return { error: 'database_unavailable', class: 'permanent' };
    }
    const db = await getDatabase();
    const record = {
      ...row,
      id: row.id || generateId('log')
    };
    if (typeof record.sizeBytes !== 'number') {
      record.sizeBytes = estimateSizeBytes(record);
    }
    return new Promise((resolve) => {
      if (!db.objectStoreNames.contains(LOGS_STORE)) {
        incrementLogWriteFailures();
        resolve({ error: 'database_unavailable', class: 'permanent' });
        return;
      }
      const transaction = db.transaction([LOGS_STORE], 'readwrite');
      transaction.objectStore(LOGS_STORE).put(record);
      transaction.oncomplete = () => {
        addLogRow(record.sizeBytes || 0, record.createdAt);
        resolve({ written: true, id: record.id });
      };
      transaction.onerror = () => {
        resolve(failLogWrite(transaction.error));
      };
      transaction.onabort = () => {
        resolve(failLogWrite(transaction.error));
      };
    });
  } catch (err) {
    return failLogWrite(err);
  }
}

/**
 * Write a fully-formed log row (import / tests). Generates id when missing.
 *
 * @param {object} row
 * @returns {Promise<{ written: true, id: string } | { error: string }>}
 */
export async function putLogRecord(row) {
  return enqueueCustomer(() => putLogRecordUnlocked(row));
}

/**
 * Bulk-insert log rows (test seed). Updates the stats cache.
 * @param {object[]} rows
 * @returns {Promise<{written: number} | {error: string, class: string}>}
 */
export async function putLogRecordsBulk(rows) {
  return enqueueCustomer(async () => {
    try {
      if (!Array.isArray(rows) || rows.length === 0) {
        return { written: 0 };
      }
      const db = await getDatabase();
      if (!db.objectStoreNames.contains(LOGS_STORE)) {
        return { error: 'database_unavailable', class: 'permanent' };
      }
      const BATCH = 250;
      let written = 0;
      for (let i = 0; i < rows.length; i += BATCH) {
        const slice = rows.slice(i, i + BATCH);
        await new Promise((resolve, reject) => {
          const transaction = db.transaction([LOGS_STORE], 'readwrite');
          const store = transaction.objectStore(LOGS_STORE);
          for (const row of slice) {
            const record = { ...row, id: row.id || generateId('log') };
            if (typeof record.sizeBytes !== 'number') {
              record.sizeBytes = estimateSizeBytes(record);
            }
            store.put(record);
            addLogRow(record.sizeBytes || 0, record.createdAt);
          }
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        });
        written += slice.length;
      }
      return { written };
    } catch (err) {
      return failLogWrite(err);
    }
  });
}

function rowMatchesFilters(row, filters) {
  if (filters.sessionId && row.sessionId !== filters.sessionId) return false;
  if (filters.packageId && row.packageId !== filters.packageId) return false;
  if (filters.from && row.createdAt < filters.from) return false;
  if (filters.to && row.createdAt >= filters.to) return false;
  const rank = LEVEL_RANK[row.level];
  if (rank == null || rank < filters.minRank) return false;
  return true;
}

function chooseLogCursor(store, filters) {
  if (filters.sessionId && store.indexNames.contains('by-sessionId-createdAt')) {
    const lower = [filters.sessionId, filters.from || ''];
    const upper = [filters.sessionId, filters.to || '\uffff'];
    const range = IDBKeyRange.bound(lower, upper, false, Boolean(filters.to));
    return store.index('by-sessionId-createdAt').openCursor(range);
  }
  if (filters.sessionId && store.indexNames.contains('by-sessionId')) {
    return store.index('by-sessionId').openCursor(IDBKeyRange.only(filters.sessionId));
  }
  if (filters.packageId && store.indexNames.contains('by-packageId')) {
    return store.index('by-packageId').openCursor(IDBKeyRange.only(filters.packageId));
  }
  if ((filters.from || filters.to) && store.indexNames.contains('by-createdAt')) {
    const lower = filters.from || '';
    const upper = filters.to || '\uffff';
    const range = IDBKeyRange.bound(lower, upper, false, Boolean(filters.to));
    return store.index('by-createdAt').openCursor(range);
  }
  if (store.indexNames.contains('by-createdAt')) {
    return store.index('by-createdAt').openCursor();
  }
  return store.openCursor();
}

/**
 * @param {{
 *   sessionId?: string,
 *   packageId?: string,
 *   from?: string,
 *   to?: string,
 *   minLevel?: string,
 *   limit?: number,
 *   offset?: number
 * }} [options]
 * @returns {Promise<{ logs: object[], total: number } | { error: string }>}
 */
export async function queryLogs(options = {}) {
  try {
    const db = await getDatabase();
    if (!db.objectStoreNames.contains(LOGS_STORE)) {
      return { logs: [], total: 0 };
    }
    const minLevel = isPersistedLevel(options.minLevel) ? options.minLevel : 'debug';
    const filters = {
      sessionId: normalizeSessionId(options.sessionId),
      packageId: typeof options.packageId === 'string' ? options.packageId : null,
      from: typeof options.from === 'string' ? options.from : null,
      to: typeof options.to === 'string' ? options.to : null,
      minRank: LEVEL_RANK[minLevel] ?? 0
    };
    const limit = Number.isFinite(options.limit) ? Math.max(0, Math.floor(options.limit)) : DEFAULT_QUERY_LIMIT;
    const offset = Number.isFinite(options.offset) ? Math.max(0, Math.floor(options.offset)) : 0;

    return new Promise((resolve) => {
      const transaction = db.transaction([LOGS_STORE], 'readonly');
      const store = transaction.objectStore(LOGS_STORE);
      const request = chooseLogCursor(store, filters);
      const logs = [];
      let total = 0;
      let skipped = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        const row = cursor.value;
        if (rowMatchesFilters(row, filters)) {
          total += 1;
          if (skipped < offset) {
            skipped += 1;
          } else if (logs.length < limit) {
            logs.push(row);
          }
        }
        cursor.continue();
      };

      transaction.oncomplete = () => {
        resolve({ logs, total });
      };
      transaction.onerror = () => {
        resolve({ error: 'database_unavailable' });
      };
    });
  } catch {
    return { error: 'database_unavailable' };
  }
}

/**
 * Sum stored sizeBytes (no overhead). Used by stats + retention.
 * @returns {Promise<{ logBytes: number, logEntryCount: number, byPackage: Record<string, { bytes: number, count: number }> } | { error: string }>}
 */
export async function getLogByteSizes() {
  try {
    const db = await getDatabase();
    if (!db.objectStoreNames.contains(LOGS_STORE)) {
      return { logBytes: 0, logEntryCount: 0, byPackage: {} };
    }
    return new Promise((resolve) => {
      const transaction = db.transaction([LOGS_STORE], 'readonly');
      const store = transaction.objectStore(LOGS_STORE);
      const request = store.openCursor();
      let logBytes = 0;
      let logEntryCount = 0;
      const byPackage = {};

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        const row = cursor.value;
        const bytes = row.sizeBytes || 0;
        logBytes += bytes;
        logEntryCount += 1;
        const key = row.packageId || 'unknown';
        if (!byPackage[key]) {
          byPackage[key] = { bytes: 0, count: 0 };
        }
        byPackage[key].bytes += bytes;
        byPackage[key].count += 1;
        cursor.continue();
      };

      transaction.oncomplete = () => {
        resolve({ logBytes, logEntryCount, byPackage });
      };
      transaction.onerror = () => {
        resolve({ error: 'database_unavailable' });
      };
    });
  } catch {
    return { error: 'database_unavailable' };
  }
}

async function pruneOldestCreatedAt() {
  try {
    const db = await getDatabase();
    if (!db.objectStoreNames.contains(LOGS_STORE)) {
      setOldestLogCreatedAt(null);
      return null;
    }
    return new Promise((resolve) => {
      const transaction = db.transaction([LOGS_STORE], 'readonly');
      const store = transaction.objectStore(LOGS_STORE);
      if (!store.indexNames.contains('by-createdAt')) {
        transaction.oncomplete = () => resolve(null);
        return;
      }
      const request = store.index('by-createdAt').openCursor();
      let oldest = null;
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) oldest = cursor.value.createdAt || null;
      };
      transaction.oncomplete = () => {
        setOldestLogCreatedAt(oldest);
        resolve(oldest);
      };
      transaction.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function pruneLogBatch({ cutoffIso = null, maxDeletes, bytesToFree = null }) {
  try {
    const db = await getDatabase();
    if (!db.objectStoreNames.contains(LOGS_STORE)) {
      return { prunedLogCount: 0, prunedLogBytes: 0 };
    }
    return new Promise((resolve) => {
      const transaction = db.transaction([LOGS_STORE], 'readwrite');
      const store = transaction.objectStore(LOGS_STORE);
      let prunedLogCount = 0;
      let prunedLogBytes = 0;
      const request = store.indexNames.contains('by-createdAt')
        ? cutoffIso
          ? store.index('by-createdAt').openCursor(IDBKeyRange.upperBound(cutoffIso, true))
          : store.index('by-createdAt').openCursor()
        : store.openCursor();

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        if (prunedLogCount >= maxDeletes) return;
        if (bytesToFree != null && prunedLogBytes >= bytesToFree) return;
        const row = cursor.value;
        if (cutoffIso && row.createdAt && row.createdAt >= cutoffIso) {
          cursor.continue();
          return;
        }
        prunedLogCount += 1;
        prunedLogBytes += row.sizeBytes || 0;
        cursor.delete();
        cursor.continue();
      };

      transaction.oncomplete = () => {
        if (prunedLogCount > 0) {
          subtractLogRows(prunedLogCount, prunedLogBytes);
        }
        resolve({ prunedLogCount, prunedLogBytes });
      };
      transaction.onerror = () => {
        resolve({ error: 'database_unavailable', class: 'permanent' });
      };
    });
  } catch {
    return { error: 'database_unavailable', class: 'permanent' };
  }
}

/**
 * Age-prune in short transactions, yielding to customer writes between batches.
 * @param {{ now?: number, maxLogAgeMs?: number }} [options]
 * @param {() => Promise<void>} [yieldToCustomer]
 */
export async function pruneLogsByAgeBatched(options = {}, yieldToCustomer = async () => {}) {
  const now = typeof options.now === 'number' ? options.now : Date.now();
  const maxAge = typeof options.maxLogAgeMs === 'number' ? options.maxLogAgeMs : MAX_LOG_AGE_MS;
  const cutoff = new Date(now - maxAge).toISOString();
  let prunedLogCount = 0;
  let prunedLogBytes = 0;
  while (true) {
    const batch = await pruneLogBatch({
      cutoffIso: cutoff,
      maxDeletes: LOG_PRUNE_BATCH_SIZE
    });
    if (batch.error) return batch;
    prunedLogCount += batch.prunedLogCount;
    prunedLogBytes += batch.prunedLogBytes;
    if (batch.prunedLogCount < LOG_PRUNE_BATCH_SIZE) break;
    await yieldToCustomer();
  }
  await pruneOldestCreatedAt();
  return { prunedLogCount, prunedLogBytes };
}

/**
 * Delete log rows with createdAt older than now - maxLogAgeMs.
 *
 * @param {{ now?: number, maxLogAgeMs?: number }} [options]
 * @returns {Promise<{ prunedLogCount: number, prunedLogBytes: number } | { error: string }>}
 */
export async function pruneLogsByAge(options = {}) {
  return pruneLogsByAgeBatched(options, async () => {});
}

/**
 * Delete oldest logs (createdAt ASC) until remaining raw log bytes + keepHint
 * would sit under the remaining budget. Caller passes how many raw log bytes
 * must still be dropped.
 *
 * @param {number} bytesToFree raw (pre-overhead) bytes to drop
 * @returns {Promise<{ prunedLogCount: number, prunedLogBytes: number } | { error: string }>}
 */
export async function pruneOldestLogsBatched(bytesToFree, yieldToCustomer = async () => {}) {
  let remaining = Math.max(0, bytesToFree || 0);
  if (remaining <= 0) {
    return { prunedLogCount: 0, prunedLogBytes: 0 };
  }
  let prunedLogCount = 0;
  let prunedLogBytes = 0;
  while (remaining > 0) {
    const batch = await pruneLogBatch({
      maxDeletes: LOG_PRUNE_BATCH_SIZE,
      bytesToFree: remaining
    });
    if (batch.error) return batch;
    if (batch.prunedLogCount === 0) break;
    prunedLogCount += batch.prunedLogCount;
    prunedLogBytes += batch.prunedLogBytes;
    remaining -= batch.prunedLogBytes;
    await yieldToCustomer();
  }
  await pruneOldestCreatedAt();
  return { prunedLogCount, prunedLogBytes };
}

/**
 * Delete oldest logs until remaining raw log bytes sit under the budget.
 *
 * @param {number} bytesToFree raw (pre-overhead) bytes to drop
 * @returns {Promise<{ prunedLogCount: number, prunedLogBytes: number } | { error: string }>}
 */
export async function pruneOldestLogs(bytesToFree) {
  return pruneOldestLogsBatched(bytesToFree, async () => {});
}

/**
 * Drop oldest logs until entry count is at most maxCount.
 * @param {number} maxCount
 * @param {() => Promise<void>} [yieldToCustomer]
 */
export async function pruneLogsOverCountBatched(maxCount, yieldToCustomer = async () => {}) {
  let extra = Math.max(0, getStatsCache().logEntryCount - maxCount);
  if (extra <= 0) {
    return { prunedLogCount: 0, prunedLogBytes: 0 };
  }
  let prunedLogCount = 0;
  let prunedLogBytes = 0;
  while (extra > 0) {
    const batch = await pruneLogBatch({
      maxDeletes: Math.min(LOG_PRUNE_BATCH_SIZE, extra)
    });
    if (batch.error) return batch;
    if (batch.prunedLogCount === 0) break;
    prunedLogCount += batch.prunedLogCount;
    prunedLogBytes += batch.prunedLogBytes;
    extra -= batch.prunedLogCount;
    await yieldToCustomer();
  }
  await pruneOldestCreatedAt();
  return { prunedLogCount, prunedLogBytes };
}
