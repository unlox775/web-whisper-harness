import * as sessionStore from '@web-whisper/session-store';
import { decodeChunkToPCM } from '@web-whisper/volume-analyzer';
import type { ChunkRecord, SnipRecord } from './types';

export type DoctorReport = {
  completedInMs: number;
  passed: boolean;
  issueCount: number;
  summary: string;
  checks: {
    coverage: { passed: boolean; gaps: Array<{ from: number; to: number }> };
    rangeAccess: { passed: boolean; missingChunkIds: string[] };
    perChunkDecode: { passed: boolean; failures: string[] };
    snipScan: { passed: boolean; issues: string[] };
  };
};

export async function runDoctor(sessionId: string): Promise<DoctorReport> {
  const started = performance.now();
  const session = await sessionStore.getSession(sessionId);
  const listed = await sessionStore.getChunksForSession(sessionId);
  const chunks: ChunkRecord[] = listed.chunks || [];
  const snipsResult = await sessionStore.getSnipsForSession(sessionId);
  const snips: SnipRecord[] = snipsResult.snips || [];

  const gaps: Array<{ from: number; to: number }> = [];
  let cursor = 0;
  const sorted = [...chunks].sort((a, b) => a.seq - b.seq);
  for (const chunk of sorted) {
    if (chunk.startTime - cursor > 0.25) {
      gaps.push({ from: cursor, to: chunk.startTime });
    }
    cursor = Math.max(cursor, chunk.endTime);
  }
  if (session?.duration && session.duration - cursor > 0.5) {
    gaps.push({ from: cursor, to: session.duration });
  }

  const missingChunkIds: string[] = [];
  const decodeFailures: string[] = [];
  for (const meta of sorted) {
    const full = await sessionStore.getChunk(meta.id);
    if (!full?.blob) {
      missingChunkIds.push(meta.id);
      continue;
    }
    try {
      await decodeChunkToPCM(full.blob);
    } catch {
      decodeFailures.push(meta.id);
    }
  }

  const snipIssues: string[] = [];
  const duration = session?.duration || cursor;
  snips.forEach((snip, index) => {
    if (snip.startTime < -0.01 || snip.endTime > duration + 0.25) {
      snipIssues.push(`Snip ${index + 1}: out of range`);
    }
    if (snip.endTime <= snip.startTime) {
      snipIssues.push(`Snip ${index + 1}: invalid time range`);
    }
  });

  const checks = {
    coverage: { passed: gaps.length === 0, gaps },
    rangeAccess: { passed: missingChunkIds.length === 0, missingChunkIds },
    perChunkDecode: { passed: decodeFailures.length === 0, failures: decodeFailures },
    snipScan: { passed: snipIssues.length === 0, issues: snipIssues },
  };

  const issueCount =
    gaps.length + missingChunkIds.length + decodeFailures.length + snipIssues.length;
  const completedInMs = performance.now() - started;
  const passed = issueCount === 0;

  return {
    completedInMs,
    passed,
    issueCount,
    summary: passed
      ? `Doctor completed in ${(completedInMs / 1000).toFixed(1)}s. All checks passed.`
      : `Doctor found ${issueCount} issue${issueCount === 1 ? '' : 's'}.`,
    checks,
  };
}
