import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeSessionBadge, sessionTilePreview, sessionTilePreviewFromRow } from './sessionTile.ts';
import type { SessionRecord, SnipRecord, TranscriptRecord } from './types.ts';

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'ses-1',
    createdAt: '2026-09-18T00:00:00Z',
    updatedAt: '2026-09-18T00:00:00Z',
    duration: 47,
    chunkCount: 12,
    sizeBytes: 1000,
    hasVolumeProfile: true,
    hasSnips: true,
    hasTranscript: true,
    status: 'ready',
    ...overrides,
  };
}

function snip(id: string, startTime = 0, endTime = 10): SnipRecord {
  return {
    id,
    sessionId: 'ses-1',
    startChunkIndex: 0,
    endChunkIndex: 0,
    startTime,
    endTime,
    duration: endTime - startTime,
    chunkIds: ['c1'],
    confidence: 1,
    createdAt: '2026-09-18T00:00:00Z',
  };
}

function tx(snipId: string, text: string): TranscriptRecord {
  return {
    snipId,
    sessionId: 'ses-1',
    text,
    createdAt: '2026-09-18T00:00:00Z',
    updatedAt: '2026-09-18T00:00:00Z',
  };
}

describe('sessionTilePreview', () => {
  it('marks a just-stopped session PART TX while only some snips are transcribed', () => {
    const preview = sessionTilePreview(
      session(),
      [snip('a', 0, 20), snip('b', 20, 46)],
      [tx('a', 'Okay so the first thing is the grocery list.')]
    );
    assert.equal(preview.badge, 'part-tx');
    assert.equal(preview.transcriptCount, 1);
    assert.equal(preview.snippet, 'Okay so the first thing is the grocery list.');
    assert.equal(preview.coverageNote, null);
    assert.equal(preview.chunkGapNote, null);
  });

  it('refreshes to READY with concatenated text once remaining snips complete and the tail is covered', () => {
    const preview = sessionTilePreview(
      session(),
      [snip('a', 0, 20), snip('b', 20, 46)],
      [
        tx('a', 'Okay so the first thing is the grocery list.'),
        tx('b', 'We need milk, eggs, and sourdough.'),
      ]
    );
    assert.equal(preview.badge, 'ready');
    assert.equal(preview.transcriptCount, 2);
    assert.equal(
      preview.snippet,
      'Okay so the first thing is the grocery list. We need milk, eggs, and sourdough.'
    );
    assert.equal(preview.coverageNote, null);
    assert.equal(preview.chunkGapNote, null);
  });

  it('stays PART TX when every snip has text but audio remains past the last snip', () => {
    const preview = sessionTilePreview(
      session({ duration: 180 }),
      [snip('a', 0, 20), snip('b', 20, 45)],
      [
        tx('a', 'Okay so the first thing is the grocery list.'),
        tx('b', 'We need milk, eggs, and sourdough.'),
      ]
    );
    assert.equal(preview.badge, 'part-tx');
    assert.equal(preview.coverage.status, 'partial');
    assert.equal(
      preview.coverageNote,
      'Transcription is incomplete. More audio exists beyond 0:45.'
    );
    assert.equal(preview.chunkGapNote, null);
  });

  it('computeSessionBadge stays null until at least one transcript exists when the tail is covered', () => {
    assert.equal(
      computeSessionBadge(session(), [snip('a', 0, 20), snip('b', 20, 46)], []),
      null
    );
  });

  it('READY plus gap line from persisted session-row coverage (getChunkCoverage shape)', () => {
    const preview = sessionTilePreview(
      session({
        duration: 3368,
        lastSeq: 841,
        savedCount: 794,
        missingSeqs: [5],
        savedDurationMs: 3176_000,
        lostChunks: [{ seq: 5, startMs: 20_000, endMs: 24_000, reason: 'quota_exceeded' }],
      }),
      [snip('a', 0, 1600), snip('b', 1600, 3368)],
      [tx('a', 'First half.'), tx('b', 'Second half.')]
    );
    assert.equal(preview.badge, 'ready');
    assert.equal(preview.chunkGapNote, '56:08 elapsed · 52:56 saved · 1 gap');
  });
});

describe('sessionTilePreviewFromRow', () => {
  it('never shows READY from hasTranscript / status alone (false all-transcribed)', () => {
    const preview = sessionTilePreviewFromRow(session({ hasTranscript: true, status: 'ready' }));
    assert.equal(preview.badge, 'part-tx');
    assert.equal(preview.snippet, '');
  });

  it('stays null when snips exist but no transcript has been written yet', () => {
    const preview = sessionTilePreviewFromRow(
      session({ hasTranscript: false, hasSnips: true, status: 'ready' })
    );
    assert.equal(preview.badge, null);
  });

  it('marks a long take with no snips PART TX so uncovered audio is not hidden', () => {
    const preview = sessionTilePreviewFromRow(
      session({ duration: 180, hasSnips: false, hasTranscript: false })
    );
    assert.equal(preview.badge, 'part-tx');
    assert.equal(
      preview.coverageNote,
      'Transcription is incomplete. More audio exists beyond 0:00.'
    );
  });

  it('shows the persisted session-row coverage gap line without scanning chunks', () => {
    const preview = sessionTilePreviewFromRow(
      session({
        duration: 3368,
        lastSeq: 841,
        savedCount: 794,
        missingSeqs: [5],
        savedDurationMs: 3176_000,
        lostChunks: [{ seq: 5, startMs: 20_000, endMs: 24_000, reason: 'quota_exceeded' }],
      })
    );
    assert.equal(preview.badge, 'part-tx');
    assert.equal(preview.chunkGapNote, '56:08 elapsed · 52:56 saved · 1 gap');
  });

  it('does not invent a gap line when persisted coverage is complete', () => {
    const preview = sessionTilePreviewFromRow(
      session({
        lastSeq: 10,
        savedCount: 11,
        missingSeqs: [],
        savedDurationMs: 40_000,
        lostChunks: [],
      })
    );
    assert.equal(preview.chunkGapNote, null);
  });
});
