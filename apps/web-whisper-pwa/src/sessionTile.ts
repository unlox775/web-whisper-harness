import {
  chunkCoverageFromSessionRow,
  elapsedSecondsForCoverage,
  sessionGapNote,
  type ChunkCoverage,
} from './chunkCoverage';
import { coverageExtrasForSession } from './recorderDuration';
import {
  COVERAGE_GAP_THRESHOLD_MS,
  coverageBadge,
  sessionTranscriptionCoverage,
  uncoveredTailCopy,
  type TranscriptionCoverage,
  type TranscriptionCoverageExtras,
} from './transcriptionCoverage';
import type { SessionRecord, SnipRecord, TranscriptRecord } from './types';

export type SessionBadge = 'ready' | 'part-tx' | null;

export type SessionTilePreview = {
  snipCount: number;
  transcriptCount: number;
  snippet: string;
  badge: SessionBadge;
  coverage: TranscriptionCoverage;
  coverageNote: string | null;
  chunkGapNote: string | null;
};

const TILE_SNIPPET_MAX = 100;

export function clipTileSnippet(text: string): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  return trimmed.length > TILE_SNIPPET_MAX ? `${trimmed.slice(0, TILE_SNIPPET_MAX)}...` : trimmed;
}

function emptyCoverage(session: SessionRecord, extras?: TranscriptionCoverageExtras): TranscriptionCoverage {
  return sessionTranscriptionCoverage(session, [], [], extras);
}

function gapNoteForSession(session: SessionRecord, elapsedSeconds: number, chunkCoverage?: ChunkCoverage | null) {
  return (
    sessionGapNote(chunkCoverage, elapsedSeconds) ??
    sessionGapNote(chunkCoverageFromSessionRow(session), elapsedSeconds)
  );
}

/**
 * First paint for a Home tile: session row only. Never READY from `hasTranscript`
 * / `status` — those mean "recording finished" / "at least one transcript".
 * Gap honesty uses persisted coverage on the row (`getChunkCoverage` shape).
 */
export function sessionTilePreviewFromRow(session: SessionRecord): SessionTilePreview {
  const extras = coverageExtrasForSession(session.id);
  const elapsedSeconds = elapsedSecondsForCoverage(session.duration, extras.recorderDurationMs);
  const chunkGapNote = gapNoteForSession(session, elapsedSeconds);
  const snippet = '';

  let badge: SessionBadge = null;
  let coverageNote: string | null = null;
  if (session.hasTranscript) {
    badge = 'part-tx';
  } else if (!session.hasSnips && elapsedSeconds * 1000 > COVERAGE_GAP_THRESHOLD_MS) {
    badge = 'part-tx';
    coverageNote = uncoveredTailCopy({
      lastSnipEndMs: 0,
      durationMs: elapsedSeconds * 1000,
      uncoveredMs: elapsedSeconds * 1000,
      hasUncoveredTail: true,
      allSnipsTranscribed: false,
      transcribedCount: 0,
      snipCount: 0,
      missingTranscriptCount: 0,
      status: 'partial',
    });
  }

  return {
    snipCount: 0,
    transcriptCount: 0,
    snippet,
    badge,
    coverage: emptyCoverage(session, extras),
    coverageNote,
    chunkGapNote,
  };
}

export function computeSessionBadge(
  session: SessionRecord,
  snips: SnipRecord[],
  transcripts: TranscriptRecord[],
  extras?: TranscriptionCoverageExtras
): SessionBadge {
  return coverageBadge(sessionTranscriptionCoverage(session, snips, transcripts, extras).status);
}

export function sessionTilePreview(
  session: SessionRecord,
  snips: SnipRecord[],
  transcripts: TranscriptRecord[],
  extras?: TranscriptionCoverageExtras,
  chunkCoverage?: ChunkCoverage | null
): SessionTilePreview {
  const resolvedExtras = extras ?? coverageExtrasForSession(session.id);
  const coverage = sessionTranscriptionCoverage(
    session,
    snips,
    transcripts,
    resolvedExtras
  );
  const text = transcripts
    .map((item) => item.text || '')
    .filter((piece) => piece.trim())
    .join(' ');
  const snippet = clipTileSnippet(text);
  const elapsedSeconds = elapsedSecondsForCoverage(
    session.duration,
    resolvedExtras.recorderDurationMs
  );
  return {
    snipCount: snips.length,
    transcriptCount: coverage.transcribedCount,
    snippet,
    badge: coverageBadge(coverage.status),
    coverage,
    coverageNote: uncoveredTailCopy(coverage),
    chunkGapNote: gapNoteForSession(session, elapsedSeconds, chunkCoverage),
  };
}
