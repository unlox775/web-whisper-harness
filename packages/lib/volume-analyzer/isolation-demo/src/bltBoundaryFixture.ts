/**
 * Dave’s BLT session cuts (ses_1788550979475_nxkjk4yv Debug UI) plus a
 * sample recomputed pair so the doctor can show live-vs-recompute without
 * Groq or a zip. Diagnosis fixture only — not an algorithm change.
 */

import type { ArchivedLiveSnip } from './archiveSource';
import type { Snip } from './volumeAnalyzer';

export const BLT_FIXTURE_NOTE =
  'BLT diagnosis fixture — live transcripts from Dave’s 1:55 / 2:11 cuts, plus sample recomputed ranges (no audio, no Groq)';

export const BLT_LIVE_SNIPS: ArchivedLiveSnip[] = [
  {
    id: '9',
    startTime: 115,
    endTime: 131,
    duration: 16,
    chunkIds: [],
    text: "I'll take a BLT's.",
  },
  {
    id: '10',
    startTime: 131,
    endTime: 150,
    duration: 19,
    chunkIds: [],
    text: 'BLT is cheese quesadilla',
  },
  {
    id: '11',
    startTime: 150,
    endTime: 170,
    duration: 20,
    chunkIds: [],
    text: 'cheese quesadillas on the side',
  },
];

/** Overlapping recomputed cuts — no transcripts, so n-gram is skipped. */
export const BLT_RECOMPUTED_SNIPS: Snip[] = [
  {
    snipId: 1,
    startTime: 110,
    endTime: 140,
    duration: 30,
    startChunkIndex: 0,
    endChunkIndex: 0,
    chunkRefs: [],
    confidence: 0.8,
  },
  {
    snipId: 2,
    startTime: 138,
    endTime: 165,
    duration: 27,
    startChunkIndex: 0,
    endChunkIndex: 0,
    chunkRefs: [],
    confidence: 0.8,
  },
];
