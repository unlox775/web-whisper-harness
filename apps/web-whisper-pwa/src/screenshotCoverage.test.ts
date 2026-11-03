import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sessionTilePreview } from './sessionTile.ts';
import {
  formatCoverageSummary,
  gapCount,
  formatGapRangeList,
  gapRanges,
} from './chunkCoverage.ts';
import {
  homeAfterStopPreview,
  homePartialCoveragePreview,
  isSessionChunkGapsScreenshot,
  isSessionDebugExportScreenshot,
  isSettingsContextScreenshot,
  isSettingsLogLevelsScreenshot,
  sessionChunkGapsPreview,
  sessionPartialCoveragePreview,
  sessionTranscribedPreview,
} from './screenshotMode.ts';
import { sessionTranscriptionCoverage, uncoveredTailCopy } from './transcriptionCoverage.ts';

describe('screenshot coverage fixtures', () => {
  it('recognizes Settings log-level, context, Debug export, and chunk-gap screenshot helpers', () => {
    assert.equal(isSettingsLogLevelsScreenshot('settings-log-levels'), true);
    assert.equal(isSettingsContextScreenshot('settings-context'), true);
    assert.equal(isSessionDebugExportScreenshot('session-debug-export'), true);
    assert.equal(isSessionChunkGapsScreenshot('session-chunk-gaps'), true);
    assert.equal(isSettingsLogLevelsScreenshot('isolation-settings'), false);
  });

  it('keeps the after-stop READY fixture covered through the last snip', () => {
    const preview = homeAfterStopPreview();
    const tile = sessionTilePreview(preview.session, preview.snips, preview.transcripts);
    assert.equal(tile.badge, 'ready');
    assert.equal(tile.coverageNote, null);
  });

  it('shows PART TX and beyond-MM:SS copy for the uncovered-tail home fixture', () => {
    const preview = homePartialCoveragePreview();
    const tile = sessionTilePreview(preview.session, preview.snips, preview.transcripts);
    assert.equal(tile.badge, 'part-tx');
    assert.equal(
      tile.coverageNote,
      'Transcription is incomplete. More audio exists beyond 0:45.'
    );
  });

  it('keeps the fully-covered session-transcribed fixture READY', () => {
    const preview = sessionTranscribedPreview();
    const coverage = sessionTranscriptionCoverage(
      preview.session,
      preview.snips,
      preview.transcripts
    );
    assert.equal(coverage.status, 'ready');
    assert.equal(uncoveredTailCopy(coverage), null);
  });

  it('shows PART TX on session detail when last snip ends before duration − 2s', () => {
    const preview = sessionPartialCoveragePreview();
    const coverage = sessionTranscriptionCoverage(
      preview.session,
      preview.snips,
      preview.transcripts
    );
    assert.equal(coverage.status, 'partial');
    assert.equal(coverage.allSnipsTranscribed, true);
    assert.equal(
      uncoveredTailCopy(coverage),
      'Transcription is incomplete. More audio exists beyond 0:45.'
    );
  });

  it('session-chunk-gaps fixture is READY with an honest gap line and time range', () => {
    const preview = sessionChunkGapsPreview();
    const coverage = sessionTranscriptionCoverage(
      preview.session,
      preview.snips,
      preview.transcripts
    );
    assert.equal(coverage.status, 'ready');
    assert.equal(gapCount(preview.chunkCoverage), 48);
    assert.equal(
      formatCoverageSummary(preview.chunkCoverage, preview.session.duration),
      '56:08 elapsed · 52:56 saved · 48 gaps'
    );
    assert.equal(
      formatGapRangeList(gapRanges(preview.chunkCoverage)),
      '20:00–23:12'
    );
    const tile = sessionTilePreview(
      preview.session,
      preview.snips,
      preview.transcripts,
      undefined,
      preview.chunkCoverage
    );
    assert.equal(tile.badge, 'ready');
    assert.equal(tile.chunkGapNote, '56:08 elapsed · 52:56 saved · 48 gaps');
  });
});
