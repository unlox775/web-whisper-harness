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

function snip(id: string): SnipRecord {
  return {
    id,
    sessionId: 'ses-1',
    startChunkIndex: 0,
    endChunkIndex: 0,
    startTime: 0,
    endTime: 10,
    duration: 10,
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
      [snip('a'), snip('b')],
      [tx('a', 'Okay so the first thing is the grocery list.')]
    );
    assert.equal(preview.badge, 'part-tx');
    assert.equal(preview.transcriptCount, 1);
    assert.equal(preview.snippet, 'Okay so the first thing is the grocery list.');
  });

  it('refreshes to READY with concatenated text once remaining snips complete', () => {
    const preview = sessionTilePreview(
      session(),
      [snip('a'), snip('b')],
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
  });

  it('computeSessionBadge stays null until at least one transcript exists', () => {
    assert.equal(computeSessionBadge(session(), 2, 0), null);
  });
});
