import { createContextChain } from '../../../packages/lib/transcription-client/src/contextPrompt.js';
import type { SnipRecord, TranscriptRecord, TranscriptionContextSettings } from './types';

export function orderedSnips(snips: SnipRecord[]): SnipRecord[] {
  return [...snips].sort(
    (a, b) => a.startTime - b.startTime || String(a.id).localeCompare(String(b.id))
  );
}

function priorTranscriptsFor(
  snips: SnipRecord[],
  already: TranscriptRecord[],
  extra: Array<{ snipId: string; text: string; avgLogprob?: number; noSpeechProb?: number }> = []
) {
  const byId = new Map<string, { text: string; avgLogprob?: number; noSpeechProb?: number }>();
  for (const item of already) {
    if (item?.snipId) byId.set(item.snipId, { text: item.text || '' });
  }
  for (const item of extra) {
    byId.set(item.snipId, item);
  }
  return snips
    .map((snip) => byId.get(snip.id))
    .filter((item): item is { text: string; avgLogprob?: number; noSpeechProb?: number } =>
      Boolean(item)
    );
}

export function promptChainFromTranscripts(
  snips: SnipRecord[],
  already: TranscriptRecord[],
  context: TranscriptionContextSettings,
  beforeSnipId?: string
) {
  const ordered = orderedSnips(snips);
  const cutoff = beforeSnipId ? ordered.findIndex((snip) => snip.id === beforeSnipId) : ordered.length;
  const priorSnips = cutoff >= 0 ? ordered.slice(0, cutoff) : ordered;
  return createContextChain({
    enabled: context.contextEnabled !== false,
    vocabulary: context.vocabulary || '',
    priorTranscripts: priorTranscriptsFor(priorSnips, already),
  });
}
