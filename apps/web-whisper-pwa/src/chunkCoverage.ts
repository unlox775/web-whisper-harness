import { formatDuration } from './format';

export type LostChunkRecord = {
  seq: number;
  startMs: number;
  endMs: number;
  reason: string;
};

export type ChunkCoverage = {
  expectedFirstSeq: number;
  lastSeq: number;
  savedCount: number;
  missingSeqs: number[];
  savedDurationMs: number;
  lostChunks: LostChunkRecord[];
};

export type ChunkTimeMeta = {
  seq: number;
  startTime: number;
  endTime: number;
  duration?: number;
};

export type GapRange = {
  fromSeq: number;
  toSeq: number;
  startMs: number;
  endMs: number;
};

const DEFAULT_CHUNK_MS = 4000;

function finiteNumber(value: number | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return value;
}

export function isChunkCoverage(value: unknown): value is ChunkCoverage {
  if (!value || typeof value !== 'object') return false;
  const row = value as { error?: unknown; missingSeqs?: unknown; savedDurationMs?: unknown };
  if (row.error) return false;
  return Array.isArray(row.missingSeqs) && typeof row.savedDurationMs === 'number';
}

/**
 * Coverage persisted on the session row (`listSessions` / `getSession` /
 * `getChunkCoverage`). Same fields the store maintains on writeChunk.
 */
export function sessionRowHasPersistedCoverage(session: {
  lastSeq?: number;
  savedCount?: number;
  missingSeqs?: number[];
  savedDurationMs?: number;
} | null | undefined): boolean {
  return Boolean(
    session &&
      typeof session.lastSeq === 'number' &&
      Number.isFinite(session.lastSeq) &&
      typeof session.savedCount === 'number' &&
      Number.isFinite(session.savedCount) &&
      Array.isArray(session.missingSeqs) &&
      typeof session.savedDurationMs === 'number' &&
      Number.isFinite(session.savedDurationMs)
  );
}

export function chunkCoverageFromSessionRow(session: {
  lastSeq?: number;
  savedCount?: number;
  missingSeqs?: number[];
  savedDurationMs?: number;
  lostChunks?: LostChunkRecord[];
} | null | undefined): ChunkCoverage | null {
  if (!sessionRowHasPersistedCoverage(session) || !session) return null;
  return {
    expectedFirstSeq: 0,
    lastSeq: session.lastSeq as number,
    savedCount: session.savedCount as number,
    missingSeqs: (session.missingSeqs || []).slice(),
    savedDurationMs: session.savedDurationMs as number,
    lostChunks: Array.isArray(session.lostChunks) ? session.lostChunks.slice() : [],
  };
}

export function gapSeqs(coverage: ChunkCoverage): number[] {
  const seqs = new Set<number>(coverage.missingSeqs);
  for (const lost of coverage.lostChunks || []) {
    if (typeof lost.seq === 'number') seqs.add(lost.seq);
  }
  return [...seqs].sort((a, b) => a - b);
}

export function gapCount(coverage: ChunkCoverage): number {
  return gapSeqs(coverage).length;
}

export function hasChunkGaps(coverage: ChunkCoverage | null | undefined): boolean {
  if (!coverage) return false;
  return gapCount(coverage) > 0;
}

export function elapsedSecondsForCoverage(
  sessionDurationSeconds: number,
  recorderDurationMs?: number
): number {
  const stored = finiteNumber(sessionDurationSeconds);
  const recorder = finiteNumber(recorderDurationMs) / 1000;
  return Math.max(stored, recorder);
}

export function formatElapsedSavedGaps(input: {
  elapsedSeconds: number;
  savedDurationMs: number;
  gapCount: number;
}): string {
  const gaps = Math.max(0, input.gapCount);
  const gapLabel = gaps === 1 ? '1 gap' : `${gaps} gaps`;
  return `${formatDuration(input.elapsedSeconds)} elapsed · ${formatDuration(input.savedDurationMs / 1000)} saved · ${gapLabel}`;
}

export function formatCoverageSummary(
  coverage: ChunkCoverage,
  elapsedSeconds: number
): string {
  return formatElapsedSavedGaps({
    elapsedSeconds,
    savedDurationMs: coverage.savedDurationMs,
    gapCount: gapCount(coverage),
  });
}

function rangeForMissingSeq(
  seq: number,
  coverage: ChunkCoverage,
  chunks: ChunkTimeMeta[]
): { startMs: number; endMs: number } {
  const lost = (coverage.lostChunks || []).find((row) => row.seq === seq);
  if (lost && Number.isFinite(lost.startMs) && Number.isFinite(lost.endMs)) {
    return { startMs: lost.startMs, endMs: lost.endMs };
  }

  const sorted = [...chunks].sort((a, b) => a.seq - b.seq);
  let prev: ChunkTimeMeta | undefined;
  let next: ChunkTimeMeta | undefined;
  for (const chunk of sorted) {
    if (chunk.seq < seq) prev = chunk;
    if (chunk.seq > seq && !next) next = chunk;
  }

  if (prev && next) {
    return { startMs: prev.endTime * 1000, endMs: next.startTime * 1000 };
  }
  if (prev) {
    const durMs = Math.max(DEFAULT_CHUNK_MS, (prev.endTime - prev.startTime) * 1000 || DEFAULT_CHUNK_MS);
    return { startMs: prev.endTime * 1000, endMs: prev.endTime * 1000 + durMs };
  }
  if (next) {
    const durMs = Math.max(DEFAULT_CHUNK_MS, (next.endTime - next.startTime) * 1000 || DEFAULT_CHUNK_MS);
    return { startMs: Math.max(0, next.startTime * 1000 - durMs), endMs: next.startTime * 1000 };
  }
  return { startMs: seq * DEFAULT_CHUNK_MS, endMs: (seq + 1) * DEFAULT_CHUNK_MS };
}

export function gapRanges(coverage: ChunkCoverage, chunks: ChunkTimeMeta[] = []): GapRange[] {
  const seqs = gapSeqs(coverage);
  const singles = seqs.map((seq) => ({ seq, ...rangeForMissingSeq(seq, coverage, chunks) }));
  if (singles.length === 0) return [];

  const collapsed: GapRange[] = [];
  for (const row of singles) {
    const last = collapsed[collapsed.length - 1];
    if (last && row.seq === last.toSeq + 1) {
      last.toSeq = row.seq;
      last.endMs = row.endMs;
      continue;
    }
    collapsed.push({
      fromSeq: row.seq,
      toSeq: row.seq,
      startMs: row.startMs,
      endMs: row.endMs,
    });
  }
  return collapsed;
}

export function formatGapRange(range: GapRange): string {
  return `${formatDuration(range.startMs / 1000)}–${formatDuration(range.endMs / 1000)}`;
}

export function formatGapRangeList(ranges: GapRange[]): string {
  return ranges.map(formatGapRange).join(', ');
}

/**
 * READY (transcription complete) may still appear when seqs are missing,
 * but the gap indicator is mandatory — never READY-without-gap.
 */
export function readyWithoutGapForbidden(input: {
  transcriptionReady: boolean;
  hasGaps: boolean;
}): { showReady: boolean; showGapIndicator: boolean; honest: boolean } {
  const showReady = input.transcriptionReady;
  const showGapIndicator = input.hasGaps;
  return {
    showReady,
    showGapIndicator,
    honest: !showReady || showGapIndicator || !input.hasGaps,
  };
}

export function sessionGapNote(
  coverage: ChunkCoverage | null | undefined,
  elapsedSeconds: number
): string | null {
  if (!coverage || !hasChunkGaps(coverage)) return null;
  return formatCoverageSummary(coverage, elapsedSeconds);
}
