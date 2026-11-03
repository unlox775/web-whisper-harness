export const RETENTION_NEAR_CAP_RATIO = 0.9;
export const RETENTION_WHILE_RECORDING_MIN_INTERVAL_MS = 60_000;

/**
 * Why retention is being considered.
 * `recording` is a live capture (chunk / transcript / diagnostic).
 * `stop` is after `await flushPending()`. `start` is before capture begins.
 */
export type RetentionOpportunity = 'boot' | 'idle' | 'settings' | 'start' | 'stop' | 'recording';

export function isNearCap(usedBytes: number, capBytes: number): boolean {
  if (!Number.isFinite(usedBytes) || !Number.isFinite(capBytes) || capBytes <= 0) {
    return false;
  }
  return usedBytes / capBytes >= RETENTION_NEAR_CAP_RATIO;
}

/**
 * Retention during a live take is forbidden unless storage is actually near
 * the cap, and then at most once per 60 s. Every other opportunity always
 * runs (boot / idle / Settings / Start / Stop).
 */
export function shouldRunRetention(input: {
  opportunity: RetentionOpportunity;
  recording: boolean;
  usedBytes: number;
  capBytes: number;
  lastRecordingRetentionAtMs: number | null;
  nowMs: number;
}): boolean {
  if (input.opportunity !== 'recording' || !input.recording) {
    return true;
  }
  if (!isNearCap(input.usedBytes, input.capBytes)) {
    return false;
  }
  if (
    input.lastRecordingRetentionAtMs != null &&
    input.nowMs - input.lastRecordingRetentionAtMs < RETENTION_WHILE_RECORDING_MIN_INTERVAL_MS
  ) {
    return false;
  }
  return true;
}

/**
 * Deterministic recording-loop helper used by tests and as the documented
 * policy: N chunks under / over cap, then one Stop.
 */
export function simulateRecordingRetention(input: {
  chunks: number;
  usedBytes: number;
  capBytes: number;
  chunkIntervalMs?: number;
  startMs?: number;
}): { duringRecording: number; afterStop: number; timestamps: number[] } {
  const interval = input.chunkIntervalMs ?? 4000;
  const startMs = input.startMs ?? 0;
  let lastRecordingRetentionAtMs: number | null = null;
  const timestamps: number[] = [];

  for (let seq = 0; seq < input.chunks; seq += 1) {
    const nowMs = startMs + seq * interval;
    if (
      shouldRunRetention({
        opportunity: 'recording',
        recording: true,
        usedBytes: input.usedBytes,
        capBytes: input.capBytes,
        lastRecordingRetentionAtMs,
        nowMs,
      })
    ) {
      timestamps.push(nowMs);
      lastRecordingRetentionAtMs = nowMs;
    }
  }

  const afterStop = shouldRunRetention({
    opportunity: 'stop',
    recording: false,
    usedBytes: input.usedBytes,
    capBytes: input.capBytes,
    lastRecordingRetentionAtMs,
    nowMs: startMs + input.chunks * interval,
  })
    ? 1
    : 0;

  return { duringRecording: timestamps.length, afterStop, timestamps };
}
