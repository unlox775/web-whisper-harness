const recorderDurationMsBySession = new Map<string, number>();

function finiteMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

/** Remember capture-engine / MediaRecorder duration so coverage can use the larger of store vs recorder. */
export function rememberRecorderDurationMs(sessionId: string, durationMs: number): void {
  if (!sessionId) return;
  const ms = finiteMs(durationMs);
  if (ms <= 0) return;
  const prev = recorderDurationMsBySession.get(sessionId) ?? 0;
  if (ms > prev) recorderDurationMsBySession.set(sessionId, ms);
}

export function rememberRecorderDurationSeconds(sessionId: string, durationSeconds: number): void {
  rememberRecorderDurationMs(sessionId, finiteMs(durationSeconds) * 1000);
}

export function recorderDurationMsFor(sessionId: string): number | undefined {
  return recorderDurationMsBySession.get(sessionId);
}

export function coverageExtrasForSession(sessionId: string): { recorderDurationMs?: number } {
  const recorderDurationMs = recorderDurationMsFor(sessionId);
  return recorderDurationMs == null ? {} : { recorderDurationMs };
}
