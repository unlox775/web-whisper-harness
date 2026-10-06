import { formatDuration } from './format';
import type { SessionRecord, SnipRecord, TranscriptRecord } from './types';

/**
 * Trailing quiet shorter than this does not flip a session to incomplete.
 * Snip proposal already holds a quiet-gap tail; only a gap **greater than**
 * 2.0s is uncovered audio that must not be called READY.
 */
export const COVERAGE_GAP_THRESHOLD_MS = 2000;

export type TranscriptionCoverageExtras = {
  /** Capture-engine `totalDuration` / MediaRecorder duration for this take, in ms. */
  recorderDurationMs?: number;
};

export type TranscriptionCoverageStatus = 'ready' | 'partial' | null;

export type TranscriptionCoverage = {
  lastSnipEndMs: number;
  durationMs: number;
  uncoveredMs: number;
  hasUncoveredTail: boolean;
  allSnipsTranscribed: boolean;
  transcribedCount: number;
  snipCount: number;
  missingTranscriptCount: number;
  /** `partial` is the incomplete alias (PART TX). Never READY while uncovered > threshold. */
  status: TranscriptionCoverageStatus;
};

function finiteMs(value: number | undefined): number {
  if (value == null || !Number.isFinite(value) || value < 0) return 0;
  return value;
}

function transcriptTextBySnip(transcripts: TranscriptRecord[]): Map<string, string> {
  const bySnip = new Map<string, string>();
  for (const item of transcripts) {
    const text = (item.text || '').trim();
    if (text) bySnip.set(item.snipId, text);
  }
  return bySnip;
}

function sessionDurationMs(
  session: SessionRecord,
  extras?: TranscriptionCoverageExtras
): number {
  const storedMs = finiteMs((session.duration ?? 0) * 1000);
  const recorderMs = finiteMs(extras?.recorderDurationMs);
  return Math.max(storedMs, recorderMs);
}

/**
 * Compare last snip end to session / recorder duration.
 *
 * - `lastSnipEndMs` = max snip `endTime` (snip times are seconds) × 1000
 * - `durationMs` = `session.duration` seconds × 1000, or the larger of that
 *   and `extras.recorderDurationMs` when the recorder outran stored chunks
 * - `uncoveredMs` = max(0, durationMs − lastSnipEndMs); zero snips + duration
 *   uses the full duration
 */
export function sessionTranscriptionCoverage(
  session: SessionRecord,
  snips: SnipRecord[],
  transcripts: TranscriptRecord[],
  extras?: TranscriptionCoverageExtras
): TranscriptionCoverage {
  const snipCount = snips.length;
  const lastSnipEndMs =
    snipCount === 0 ? 0 : Math.max(...snips.map((snip) => finiteMs((snip.endTime ?? 0) * 1000)));
  const durationMs = sessionDurationMs(session, extras);
  const uncoveredMs = Math.max(0, durationMs - lastSnipEndMs);
  const hasUncoveredTail = uncoveredMs > COVERAGE_GAP_THRESHOLD_MS;
  const bySnip = transcriptTextBySnip(transcripts);
  const transcribedCount = snips.filter((snip) => bySnip.has(snip.id)).length;
  const missingTranscriptCount = Math.max(0, snipCount - transcribedCount);
  const allSnipsTranscribed = snipCount > 0 && missingTranscriptCount === 0;

  let status: TranscriptionCoverageStatus = null;
  if (allSnipsTranscribed && !hasUncoveredTail) {
    status = 'ready';
  } else if (hasUncoveredTail || (transcribedCount > 0 && missingTranscriptCount > 0)) {
    status = 'partial';
  }

  return {
    lastSnipEndMs,
    durationMs,
    uncoveredMs,
    hasUncoveredTail,
    allSnipsTranscribed,
    transcribedCount,
    snipCount,
    missingTranscriptCount,
    status,
  };
}

/** Last snip end in seconds — RETRY TX / ingest window start (`windowStartTime`). */
export function uncoveredWindowStartSeconds(snips: SnipRecord[]): number {
  if (snips.length === 0) return 0;
  return Math.max(...snips.map((snip) => finiteMs(snip.endTime)));
}

export function formatCoverageClock(ms: number): string {
  return formatDuration(finiteMs(ms) / 1000);
}

/**
 * Copy when uncovered audio remains past the last snip.
 * `MM:SS` is last snip end, or `0:00` when there are no snips.
 */
export function uncoveredTailCopy(coverage: TranscriptionCoverage): string | null {
  if (!coverage.hasUncoveredTail) return null;
  return `Transcription is incomplete. More audio exists beyond ${formatCoverageClock(coverage.lastSnipEndMs)}.`;
}

export function coverageBadge(status: TranscriptionCoverageStatus): 'ready' | 'part-tx' | null {
  if (status === 'ready') return 'ready';
  if (status === 'partial') return 'part-tx';
  return null;
}
