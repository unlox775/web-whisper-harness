import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ARCHIVE_IMPORT_HELP,
  archiveImportErrorMessage,
  importedArchiveKind,
  importedArchiveSuccessMessage,
  importSessionZipFile,
  isArchiveImportError,
} from './importSession.ts';

describe('archiveImportErrorMessage', () => {
  it('reuses Isolation Demo wording for unreadable / unsupported zips', () => {
    assert.equal(
      archiveImportErrorMessage('unsupported_format_version'),
      'Import failed: unsupported formatVersion (this app reads v1 only).'
    );
    assert.equal(
      archiveImportErrorMessage('not_a_zip'),
      'Import failed: not_a_zip. Choose a web-whisper session zip.'
    );
    assert.equal(
      archiveImportErrorMessage('kind_mismatch'),
      'Import failed: kind_mismatch. Choose a web-whisper session zip.'
    );
    assert.equal(
      archiveImportErrorMessage('missing_manifest'),
      'Import failed: missing_manifest. Choose a web-whisper session zip.'
    );
    assert.equal(
      archiveImportErrorMessage('corrupt_json'),
      'Import failed: corrupt_json. Choose a web-whisper session zip.'
    );
    assert.equal(
      archiveImportErrorMessage('invalid_manifest'),
      'Import failed: invalid_manifest. Choose a web-whisper session zip.'
    );
  });

  it('maps store and collision errors without crashing', () => {
    assert.equal(isArchiveImportError({ error: 'not_a_zip' }), true);
    assert.equal(isArchiveImportError(new Blob()), false);
    assert.equal(
      archiveImportErrorMessage('database_unavailable'),
      'Storage unavailable. Check browser storage permissions.'
    );
    assert.equal(
      archiveImportErrorMessage('id_collision'),
      'Import failed: a session with this id already exists. Import creates a new session id.'
    );
    assert.equal(archiveImportErrorMessage('quota_exceeded'), 'Archive error: quota_exceeded');
  });
});

describe('importedArchiveKind / success copy', () => {
  it('treats chunks-only as slim (extras absent until re-analyzed)', () => {
    assert.equal(importedArchiveKind({}), 'slim');
    assert.match(
      importedArchiveSuccessMessage({}),
      /Slim zip: playable audio only/
    );
    assert.match(importedArchiveSuccessMessage({}), /absent until re-analyzed/);
  });

  it('treats snips + transcripts + volume profile as debug', () => {
    assert.equal(
      importedArchiveKind({
        hasSnips: true,
        hasTranscript: true,
        hasVolumeProfile: true,
      }),
      'debug'
    );
    assert.match(
      importedArchiveSuccessMessage({
        hasSnips: true,
        hasTranscript: true,
        hasVolumeProfile: true,
      }),
      /chunks, snips, transcripts, and volume profile/
    );
  });

  it('names a partial restore when only some optional files landed', () => {
    assert.equal(importedArchiveKind({ hasSnips: true }), 'partial');
    assert.match(
      importedArchiveSuccessMessage({ hasSnips: true, hasTranscript: true }),
      /Restored snips, transcripts/
    );
  });

  it('documents new-id policy and slim vs debug on the control helper', () => {
    assert.match(ARCHIVE_IMPORT_HELP, /new session id/);
    assert.match(ARCHIVE_IMPORT_HELP, /never overwritten/);
    assert.match(ARCHIVE_IMPORT_HELP, /Slim zip/);
    assert.match(ARCHIVE_IMPORT_HELP, /Debug zip/);
  });
});

describe('importSessionZipFile', () => {
  it('forwards the zip to session-store import and requires a new session id', async () => {
    const file = new Blob(['zip'], { type: 'application/zip' });
    const imported = await importSessionZipFile(file, async (blob) => {
      assert.equal(blob, file);
      return { sessionId: 'ses_new', chunkIds: ['chunk_1'] };
    });
    assert.deepEqual(imported, { sessionId: 'ses_new', chunkIds: ['chunk_1'] });
  });

  it('passes through named store errors', async () => {
    const imported = await importSessionZipFile(new Blob(), async () => ({ error: 'not_a_zip' }));
    assert.deepEqual(imported, { error: 'not_a_zip' });
  });
});
