import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeSessionBadge, sessionTilePreview } from './sessionTile.ts';
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
  });

  it('computeSessionBadge stays null until at least one transcript exists when the tail is covered', () => {
    assert.equal(
      computeSessionBadge(session(), [snip('a', 0, 20), snip('b', 20, 46)], []),
      null
    );
  });
});
