/**
 * Durability / scheduler constants for session-store.
 * See docs/DURABILITY-CONTRACT.md and
 * docs/specs/20261103175000-feedback-owner-serialized-writes-never-reject.md
 */

/** Default storage cap (200 MB). */
export const DEFAULT_CAP_BYTES = 200 * 1024 * 1024;

/** IndexedDB metadata overhead applied to chunk and log bytes. */
export const IDB_OVERHEAD = 1.1;

/**
 * Internal wait budget for transient IndexedDB failures on a customer write.
 * After this, writeChunk returns `{ error: 'store_busy', class: 'transient' }`.
 */
export const WRITE_WAIT_BUDGET_MS = 5000;

/** Soft target: a pending writeChunk waits less than this for a retention batch. */
export const RETENTION_YIELD_BUDGET_MS = 500;

/** Chunks / log rows deleted per short retention transaction. */
export const RETENTION_BATCH_SIZE = 16;

/** Log rows deleted per short prune transaction. */
export const LOG_PRUNE_BATCH_SIZE = 32;

/** Hard bound on persisted log rows (count prune, independent of the cap). */
export const MAX_LOG_COUNT = 100_000;

/** Singleton key in the `meta` object store. */
export const META_RUNTIME_ID = 'runtime';

/** Persisted running storage totals so boot does not scan `chunk-blobs`. */
export const META_STATS_ID = 'storage-stats';

/**
 * usedBytes when the stats cache is invalid. High on purpose: never cheap-exit
 * retention as "under cap" from a missing/stale-low total.
 */
export const UNKNOWN_USED_BYTES = Number.MAX_SAFE_INTEGER;
