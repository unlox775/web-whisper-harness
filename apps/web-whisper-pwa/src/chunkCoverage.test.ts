import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  chunkCoverageFromSessionRow,
  formatCoverageSummary,
  formatGapRangeList,
  gapCount,
  gapRanges,
  hasChunkGaps,
  readyWithoutGapForbidden,
  sessionGapNote,
  sessionRowHasPersistedCoverage,
  type ChunkCoverage,
} from './chunkCoverage.ts';
import { sessionTilePreview } from './sessionTile.ts';
import type { SessionRecord, SnipRecord, TranscriptRecord } from './types.ts';

function coverage(overrides: Partial<ChunkCoverage> = {}): ChunkCoverage {
  return {
    expectedFirstSeq: 0,
    lastSeq: 10,
    savedCount: 10,
    missingSeqs: [],
    savedDurationMs: 40_000,
    lostChunks: [],
    ...overrides,
  };
}

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'ses-gaps',
    createdAt: '2026-11-03T17:50:00.000Z',
    updatedAt: '2026-11-03T17:50:00.000Z',
    duration: 3368,
    chunkCount: 794,
    sizeBytes: 1,
    hasVolumeProfile: true,
    hasSnips: true,
    hasTranscript: true,
    status: 'ready',
    ...overrides,
  };
}

function snip(id: string, startTime: number, endTime: number): SnipRecord {
  return {
    id,
    sessionId: 'ses-gaps',
    startChunkIndex: 0,
    endChunkIndex: 0,
    startTime,
    endTime,
    duration: endTime - startTime,
    chunkIds: [],
    confidence: 1,
    createdAt: '2026-11-03T17:50:00.000Z',
  };
}

function tx(snipId: string, text: string): TranscriptRecord {
  return {
    snipId,
    sessionId: 'ses-gaps',
    text,
    createdAt: '2026-11-03T17:50:00.000Z',
    updatedAt: '2026-11-03T17:50:00.000Z',
  };
}

describe('chunk coverage display', () => {
  it('shows elapsed vs saved vs gap count for the 48-gap incident shape', () => {
    const missingSeqs = Array.from({ length: 48 }, (_, i) => 300 + i);
    const row = coverage({
      lastSeq: 841,
      savedCount: 794,
      missingSeqs,
      savedDurationMs: 3176_000,
      lostChunks: missingSeqs.map((seq) => ({
        seq,
        startMs: seq * 4000,
        endMs: (seq + 1) * 4000,
        reason: 'quota_exceeded',
      })),
    });
    assert.equal(gapCount(row), 48);
    assert.equal(formatCoverageSummary(row, 3368), '56:08 elapsed · 52:56 saved · 48 gaps');
  });

  it('coverage with a missing middle seq shows that gap time range', () => {
    const row = coverage({
      lastSeq: 2,
      savedCount: 2,
      missingSeqs: [1],
      savedDurationMs: 8000,
      lostChunks: [{ seq: 1, startMs: 4000, endMs: 8000, reason: 'quota_exceeded' }],
    });
    const ranges = gapRanges(row, [
      { seq: 0, startTime: 0, endTime: 4 },
      { seq: 2, startTime: 8, endTime: 12 },
    ]);
    assert.equal(hasChunkGaps(row), true);
    assert.equal(formatGapRangeList(ranges), '0:04–0:08');
    assert.equal(sessionGapNote(row, 12), '0:12 elapsed · 0:08 saved · 1 gap');
  });

  it('interpolates a middle-seq hole from neighboring chunks when no lost record exists', () => {
    const row = coverage({
      lastSeq: 2,
      savedCount: 2,
      missingSeqs: [1],
      savedDurationMs: 8000,
      lostChunks: [],
    });
    const ranges = gapRanges(row, [
      { seq: 0, startTime: 0, endTime: 4.2 },
      { seq: 2, startTime: 8.1, endTime: 12 },
    ]);
    assert.equal(formatGapRangeList(ranges), '0:04–0:08');
  });

  it('a transcribed session with missing seqs is never READY-without-gap', () => {
    const row = coverage({
      missingSeqs: [5],
      savedDurationMs: 3176_000,
      lostChunks: [{ seq: 5, startMs: 20_000, endMs: 24_000, reason: 'quota_exceeded' }],
    });
    const tile = sessionTilePreview(
      session(),
      [snip('a', 0, 1600), snip('b', 1600, 3368)],
      [tx('a', 'First half.'), tx('b', 'Second half.')],
      undefined,
      row
    );
    assert.equal(tile.badge, 'ready');
    assert.equal(tile.chunkGapNote, '56:08 elapsed · 52:56 saved · 1 gap');
    assert.equal(hasChunkGaps(row), true);
    const honesty = readyWithoutGapForbidden({
      transcriptionReady: tile.badge === 'ready',
      hasGaps: hasChunkGaps(row),
    });
    assert.equal(honesty.showReady, true);
    assert.equal(honesty.showGapIndicator, true);
    assert.equal(honesty.honest, true);
  });

  it('does not invent a gap line when coverage is complete', () => {
    const row = coverage({ missingSeqs: [], lostChunks: [] });
    assert.equal(sessionGapNote(row, 40), null);
    assert.equal(hasChunkGaps(row), false);
  });

  it('builds getChunkCoverage-shaped coverage from a listSessions row', () => {
    const fromRow = chunkCoverageFromSessionRow({
      lastSeq: 2,
      savedCount: 2,
      missingSeqs: [1],
      savedDurationMs: 8000,
      lostChunks: [{ seq: 1, startMs: 4000, endMs: 8000, reason: 'quota_exceeded' }],
    });
    assert.equal(sessionRowHasPersistedCoverage(fromRow), true);
    assert.equal(fromRow?.savedCount, 2);
    assert.deepEqual(fromRow?.missingSeqs, [1]);
    assert.equal(sessionGapNote(fromRow, 12), '0:12 elapsed · 0:08 saved · 1 gap');
  });
});
