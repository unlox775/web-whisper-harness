import type { SnipRecord, TranscriptRecord } from './types';

function flattenPiece(text: string | undefined): string {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Default Transcript-tab copy text: one plain wall of prose.
 * Snip transcriptions are concatenated with a single space. No time
 * headers, snip markers, or newlines between snips.
 */
export function buildTranscriptText(
  snips: SnipRecord[],
  transcripts: TranscriptRecord[]
): string {
  const bySnip = new Map(transcripts.map((item) => [item.snipId, item.text]));
  return snips
    .map((snip) => flattenPiece(bySnip.get(snip.id)))
    .filter((piece) => piece.length > 0)
    .join(' ');
}
