import { shouldRunRetention } from './retentionPolicy';

/**
 * Same 1.1 IndexedDB overhead session-store applies to chunk `sizeBytes`
 * when computing `usedBytes`. Kept here so the live record path can
 * account encoded chunks without calling `getStorageStats`.
 */
export const RECORDING_USED_BYTES_OVERHEAD = 1.1;

/**
 * Fold one newly encoded chunk into the last-known library usedBytes.
 * Unknown / non-finite baselines stay 0 so we never invent a "known" total.
 */
export function accountEncodedChunkBytes(usedBytes: number, byteLength: number): number {
  const base = Number.isFinite(usedBytes) && usedBytes > 0 ? usedBytes : 0;
  if (!Number.isFinite(byteLength) || byteLength <= 0) return base;
  return base + Math.round(byteLength * RECORDING_USED_BYTES_OVERHEAD);
}

/**
 * 90% / once-per-60s gate for a live take.
 *
 * Uses usedBytes already in PWA state (last successful refresh, plus
 * incremental encoded sizes). Does not fetch storage stats. If the total
 * is unknown, skip retention and keep recording.
 */
export function shouldRunRecordingRetention(input: {
  usedBytesKnown: boolean;
  usedBytes: number;
  capBytes: number;
  lastRecordingRetentionAtMs: number | null;
  nowMs: number;
}): boolean {
  if (!input.usedBytesKnown) return false;
  return shouldRunRetention({
    opportunity: 'recording',
    recording: true,
    usedBytes: input.usedBytes,
    capBytes: input.capBytes,
    lastRecordingRetentionAtMs: input.lastRecordingRetentionAtMs,
    nowMs: input.nowMs,
  });
}
