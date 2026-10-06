import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COVERAGE_GAP_THRESHOLD_MS,
  sessionTranscriptionCoverage,
  uncoveredTailCopy,
  uncoveredWindowStartSeconds,
} from './transcriptionCoverage.ts';
import type { SessionRecord, SnipRecord, TranscriptRecord } from './types.ts';

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'ses-1',
    createdAt: '2026-10-06T00:00:00Z',
    updatedAt: '2026-10-06T00:00:00Z',
    duration: 180,
    chunkCount: 40,
    sizeBytes: 1000,
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
    sessionId: 'ses-1',
    startChunkIndex: 0,
    endChunkIndex: 0,
    startTime,
    endTime,
    duration: endTime - startTime,
    chunkIds: ['c1'],
    confidence: 1,
    createdAt: '2026-10-06T00:00:00Z',
  };
}

function tx(snipId: string, text: string): TranscriptRecord {
  return {
    snipId,
    sessionId: 'ses-1',
    text,
    createdAt: '2026-10-06T00:00:00Z',
    updatedAt: '2026-10-06T00:00:00Z',
  };
}

describe('sessionTranscriptionCoverage', () => {
  it('documents the 2000ms gap threshold', () => {
    assert.equal(COVERAGE_GAP_THRESHOLD_MS, 2000);
  });

  it('is READY when every snip has text and the tail is within the threshold', () => {
    const coverage = sessionTranscriptionCoverage(
      session({ duration: 47 }),
      [snip('a', 0, 20), snip('b', 20, 46.5)],
      [tx('a', 'hello'), tx('b', 'world')]
    );
    assert.equal(coverage.status, 'ready');
    assert.equal(coverage.hasUncoveredTail, false);
    assert.equal(coverage.allSnipsTranscribed, true);
    assert.equal(uncoveredTailCopy(coverage), null);
  });

  it('is partial when every snip has text but uncovered audio is greater than 2s', () => {
    const coverage = sessionTranscriptionCoverage(
      session({ duration: 180 }),
      [snip('a', 0, 20), snip('b', 20, 45)],
      [tx('a', 'hello'), tx('b', 'world')]
    );
    assert.equal(coverage.status, 'partial');
    assert.equal(coverage.lastSnipEndMs, 45_000);
    assert.equal(coverage.durationMs, 180_000);
    assert.equal(coverage.uncoveredMs, 135_000);
    assert.equal(coverage.hasUncoveredTail, true);
    assert.equal(coverage.allSnipsTranscribed, true);
    assert.equal(
      uncoveredTailCopy(coverage),
      'Transcription is incomplete. More audio exists beyond 0:45.'
    );
  });

  it('stays READY when the uncovered tail is exactly 2.0s', () => {
    const coverage = sessionTranscriptionCoverage(
      session({ duration: 47 }),
      [snip('a', 0, 45)],
      [tx('a', 'hello')]
    );
    assert.equal(coverage.uncoveredMs, 2000);
    assert.equal(coverage.hasUncoveredTail, false);
    assert.equal(coverage.status, 'ready');
  });

  it('is partial when uncovered is just over the threshold', () => {
    const coverage = sessionTranscriptionCoverage(
      session({ duration: 47.001 }),
      [snip('a', 0, 45)],
      [tx('a', 'hello')]
    );
    assert.equal(coverage.hasUncoveredTail, true);
    assert.equal(coverage.status, 'partial');
  });

  it('uses the larger of session.duration and recorder extras', () => {
    const coverage = sessionTranscriptionCoverage(
      session({ duration: 45 }),
      [snip('a', 0, 45)],
      [tx('a', 'hello')],
      { recorderDurationMs: 90_000 }
    );
    assert.equal(coverage.durationMs, 90_000);
    assert.equal(coverage.uncoveredMs, 45_000);
    assert.equal(coverage.status, 'partial');
  });

  it('does not let a shorter recorder duration hide a stored tail', () => {
    const coverage = sessionTranscriptionCoverage(
      session({ duration: 180 }),
      [snip('a', 0, 45)],
      [tx('a', 'hello')],
      { recorderDurationMs: 40_000 }
    );
    assert.equal(coverage.durationMs, 180_000);
    assert.equal(coverage.status, 'partial');
  });

  it('is partial when some snips are missing transcripts', () => {
    const coverage = sessionTranscriptionCoverage(
      session({ duration: 47 }),
      [snip('a', 0, 20), snip('b', 20, 46)],
      [tx('a', 'hello')]
    );
    assert.equal(coverage.status, 'partial');
    assert.equal(coverage.allSnipsTranscribed, false);
    assert.equal(coverage.missingTranscriptCount, 1);
    assert.equal(uncoveredTailCopy(coverage), null);
  });

  it('mentions the tail even when snips are also missing transcripts', () => {
    const coverage = sessionTranscriptionCoverage(
      session({ duration: 180 }),
      [snip('a', 0, 20), snip('b', 20, 45)],
      [tx('a', 'hello')]
    );
    assert.equal(coverage.status, 'partial');
    assert.equal(coverage.missingTranscriptCount, 1);
    assert.equal(
      uncoveredTailCopy(coverage),
      'Transcription is incomplete. More audio exists beyond 0:45.'
    );
  });

  it('is partial for zero snips when playable duration is over the threshold', () => {
    const coverage = sessionTranscriptionCoverage(session({ duration: 180, hasSnips: false }), [], []);
    assert.equal(coverage.lastSnipEndMs, 0);
    assert.equal(coverage.uncoveredMs, 180_000);
    assert.equal(coverage.status, 'partial');
    assert.equal(coverage.allSnipsTranscribed, false);
    assert.equal(
      uncoveredTailCopy(coverage),
      'Transcription is incomplete. More audio exists beyond 0:00.'
    );
  });

  it('never returns READY for zero snips, even on a short quiet take', () => {
    const coverage = sessionTranscriptionCoverage(session({ duration: 1.5, hasSnips: false }), [], []);
    assert.equal(coverage.hasUncoveredTail, false);
    assert.equal(coverage.status, null);
  });

  it('stays null until at least one transcript exists when the tail is covered', () => {
    const coverage = sessionTranscriptionCoverage(
      session({ duration: 47 }),
      [snip('a', 0, 20), snip('b', 20, 46)],
      []
    );
    assert.equal(coverage.status, null);
  });

  it('exposes last snip end as the RETRY TX ingest window start', () => {
    assert.equal(uncoveredWindowStartSeconds([snip('a', 0, 20), snip('b', 20, 45)]), 45);
    assert.equal(uncoveredWindowStartSeconds([]), 0);
  });
});
