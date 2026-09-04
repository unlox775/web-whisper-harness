import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  archiveExportErrorMessage,
  archiveExportHelperText,
  chunkLooksPurged,
  isArchiveExportError,
} from './exportSession.ts';

describe('archiveExportHelperText', () => {
  it('allows metadata-only export when the session has no chunks', () => {
    assert.equal(archiveExportHelperText([]), 'No audio chunks — export is metadata only.');
  });

  it('allows metadata-only export when every chunk is purged', () => {
    assert.equal(
      archiveExportHelperText([
        { audioPurgedAt: 1_725_472_800_000, sizeBytes: 0 },
        { audioPurgedAt: '2026-09-04T18:00:00.000Z', sizeBytes: 0 },
      ]),
      'Archive has metadata, no audio bytes.'
    );
  });

  it('treats empty-blob size as purged even without audioPurgedAt', () => {
    assert.equal(chunkLooksPurged({ sizeBytes: 0 }), true);
    assert.equal(
      archiveExportHelperText([{ sizeBytes: 0 }]),
      'Archive has metadata, no audio bytes.'
    );
  });

  it('hides helper text when any chunk still has audio bytes', () => {
    assert.equal(
      archiveExportHelperText([
        { audioPurgedAt: null, sizeBytes: 4096 },
        { audioPurgedAt: 1, sizeBytes: 0 },
      ]),
      null
    );
  });
});

describe('archiveExportErrorMessage', () => {
  it('maps store error objects to session-detail toast copy', () => {
    assert.equal(isArchiveExportError({ error: 'session_not_found' }), true);
    assert.equal(isArchiveExportError(new Blob()), false);
    assert.equal(
      archiveExportErrorMessage('session_not_found'),
      'Session not found. It may have been deleted.'
    );
    assert.equal(
      archiveExportErrorMessage('database_unavailable'),
      'Storage unavailable. Check browser storage permissions.'
    );
    assert.equal(archiveExportErrorMessage('kind_mismatch'), 'Export failed: kind_mismatch');
  });
});
