import type { SessionRecord, SnipRecord, TranscriptRecord } from './types';

export type SessionBadge = 'ready' | 'part-tx' | null;

export type SessionTilePreview = {
  snipCount: number;
  transcriptCount: number;
  snippet: string;
  badge: SessionBadge;
};

const TILE_SNIPPET_MAX = 100;

export function computeSessionBadge(
  session: SessionRecord,
  snipCount: number,
  transcriptCount: number
): SessionBadge {
  if (!session.hasSnips || snipCount === 0) return null;
  if (transcriptCount === 0) return null;
  if (transcriptCount < snipCount) return 'part-tx';
  return 'ready';
}

export function sessionTilePreview(
  session: SessionRecord,
  snips: SnipRecord[],
  transcripts: TranscriptRecord[]
): SessionTilePreview {
  const snipCount = snips.length;
  const transcriptCount = transcripts.filter((item) => item.text?.trim()).length;
  const text = transcripts
    .map((item) => item.text || '')
    .filter((piece) => piece.trim())
    .join(' ');
  const snippet = text.length > TILE_SNIPPET_MAX ? `${text.slice(0, TILE_SNIPPET_MAX)}...` : text;
  return {
    snipCount,
    transcriptCount,
    snippet,
    badge: computeSessionBadge(session, snipCount, transcriptCount),
  };
}
