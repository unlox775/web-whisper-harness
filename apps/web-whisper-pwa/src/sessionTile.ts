import { coverageExtrasForSession } from './recorderDuration';
import {
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
};

const TILE_SNIPPET_MAX = 100;

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
  extras?: TranscriptionCoverageExtras
): SessionTilePreview {
  const coverage = sessionTranscriptionCoverage(
    session,
    snips,
    transcripts,
    extras ?? coverageExtrasForSession(session.id)
  );
  const text = transcripts
    .map((item) => item.text || '')
    .filter((piece) => piece.trim())
    .join(' ');
  const snippet = text.length > TILE_SNIPPET_MAX ? `${text.slice(0, TILE_SNIPPET_MAX)}...` : text;
  return {
    snipCount: snips.length,
    transcriptCount: coverage.transcribedCount,
    snippet,
    badge: coverageBadge(coverage.status),
    coverage,
    coverageNote: uncoveredTailCopy(coverage),
  };
}
