export type RetentionPolicyResult = {
  error?: string;
  deletedSessions?: number;
  reclaimedBytes?: number;
  newUsedBytes?: number;
  purgedChunkIds?: string[];
  [key: string]: unknown;
};

export type FlushPendingResult = {
  savedCount?: number;
  lostChunks?: Array<{ seq: number; startMs: number; endMs: number; reason: string }>;
};

export type FlushPendingFn = () => Promise<FlushPendingResult | void>;

export type EnforceRetentionFn = (capBytes: number) => Promise<RetentionPolicyResult>;

export type RetentionLogFn = (
  packageId: string,
  level: string,
  payload: () => { message: string; details?: Record<string, unknown> }
) => unknown;

/**
 * After Stop the PWA awaits `flushPending()` so `{ savedCount, lostChunks }`
 * is known, then runs retention. session-store owns writer concurrency —
 * this is not a cross-package lock. `skipFlush` is for the rare near-cap
 * path during a live take (do not wait on a backed-up persist queue to free
 * space).
 */
export async function enforceRetentionAfterPersistIdle(options: {
  capBytes: number;
  flushPending: FlushPendingFn;
  enforceRetentionPolicy: EnforceRetentionFn;
  log?: RetentionLogFn | null;
  sessionId?: string | null;
  skipFlush?: boolean;
}): Promise<RetentionPolicyResult> {
  if (!options.skipFlush) {
    await options.flushPending();
  }
  const result = await options.enforceRetentionPolicy(options.capBytes);
  if (typeof options.log === 'function' && !result?.error) {
    options.log('web-whisper-pwa', 'info', () => ({
      message: 'retention after persist idle',
      details: {
        sessionId: options.sessionId ?? null,
        deletedSessions: result.deletedSessions ?? 0,
        reclaimedBytes: result.reclaimedBytes ?? 0,
      },
    }));
  }
  return result;
}

/**
 * One retention at a time. Fire-and-forget callers (chunkEncoded, quota toast)
 * must not open a second long readwrite.
 */
export function createRetentionGate() {
  let chain: Promise<unknown> = Promise.resolve();
  return function enqueueRetention<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
}
