import type { SnipRecord, TranscriptRecord } from './types';

const SNIP_PREVIEW_MAX_CHARS = 220;

function flattenPiece(text: string | undefined): string {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Compact Debug-snips-list preview. Flattened prose, truncated so a
 * row stays a few wrapped lines on ~390px instead of a second transcript wall.
 */
export function previewSnipTranscriptText(text: string | undefined): string {
  const flat = flattenPiece(text);
  if (!flat) return '';
  if (flat.length <= SNIP_PREVIEW_MAX_CHARS) return flat;
  return `${flat.slice(0, SNIP_PREVIEW_MAX_CHARS).trimEnd()}…`;
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
