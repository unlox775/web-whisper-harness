import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSessionArchive, SESSION_ARCHIVE_KIND } from '../../../datastore/session-store/src/index.js';
import { createZip } from '../../../datastore/session-store/src/zip.js';
import {
  archiveParseErrorMessage,
  collectArchiveAudioBlobs,
  concatArchiveAudio,
  loadSessionArchiveForTranscribe,
  NO_AUDIO_IN_ARCHIVE,
} from './archiveSource.js';

function zipFromManifest(manifest, extraEntries = []) {
  const encoder = new TextEncoder();
  const entries = [
    { name: 'manifest.json', data: encoder.encode(JSON.stringify(manifest)) },
    ...extraEntries,
  ];
  return new Blob([createZip(entries)], { type: 'application/zip' });
}

function validManifest(overrides = {}) {
  return {
    formatVersion: 1,
    exportedAt: '2026-09-04T18:00:00.000Z',
    kind: SESSION_ARCHIVE_KIND,
    id: 'ses_demo',
    createdAt: '2026-09-04T17:00:00.000Z',
    updatedAt: '2026-09-04T17:05:00.000Z',
    duration: 8,
    chunkCount: 2,
    sizeBytes: 6,
    hasVolumeProfile: false,
    hasSnips: false,
    hasTranscript: false,
    status: 'ready',
    chunks: [],
    ...overrides,
  };
}

describe('archiveParseErrorMessage', () => {
  it('maps bad zip / corrupt JSON to Cannot read archive', () => {
    assert.equal(archiveParseErrorMessage('not_a_zip'), 'Cannot read archive');
    assert.equal(archiveParseErrorMessage('corrupt_json'), 'Cannot read archive');
    assert.equal(archiveParseErrorMessage('unknown_code'), 'Cannot read archive');
  });

  it('maps wrong format / not a session archive to Unsupported or invalid archive', () => {
    assert.equal(archiveParseErrorMessage('unsupported_format_version'), 'Unsupported or invalid archive');
    assert.equal(archiveParseErrorMessage('kind_mismatch'), 'Unsupported or invalid archive');
    assert.equal(archiveParseErrorMessage('missing_manifest'), 'Unsupported or invalid archive');
    assert.equal(archiveParseErrorMessage('invalid_manifest'), 'Unsupported or invalid archive');
  });
});

describe('collectArchiveAudioBlobs + concatArchiveAudio', () => {
  it('keeps seq order and skips null / empty blobs', () => {
    const first = new Blob([new Uint8Array([1, 2])], { type: 'audio/mpeg' });
    const second = new Blob([new Uint8Array([3, 4, 5])], { type: 'audio/mpeg' });
    const blobs = collectArchiveAudioBlobs({
      chunks: [
        { meta: { seq: 1 }, blob: second },
        { meta: { seq: 0 }, blob: first },
        { meta: { seq: 2 }, blob: null },
        { meta: { seq: 3 }, blob: new Blob([], { type: 'audio/mpeg' }) },
      ],
    });
    assert.equal(blobs.length, 2);
    assert.equal(blobs[0], first);
    assert.equal(blobs[1], second);

    const concatenated = concatArchiveAudio(blobs);
    assert.equal(concatenated.type, 'audio/mpeg');
    assert.equal(concatenated.size, 5);
  });
});

describe('loadSessionArchiveForTranscribe', () => {
  it('concatenates non-null chunk bytes via parseSessionArchive', async () => {
    const a = new Uint8Array([11, 22]);
    const b = new Uint8Array([33, 44, 55]);
    const zip = zipFromManifest(
      validManifest({
        chunks: [
          {
            id: 'chunk_b',
            seq: 1,
            startTime: 4,
            endTime: 8,
            duration: 4,
            mime: 'audio/mpeg',
            sizeBytes: 3,
            file: 'chunks/001.mp3',
          },
          {
            id: 'chunk_a',
            seq: 0,
            startTime: 0,
            endTime: 4,
            duration: 4,
            mime: 'audio/mpeg',
            sizeBytes: 2,
            file: 'chunks/000.mp3',
          },
        ],
      }),
      [
        { name: 'chunks/000.mp3', data: a },
        { name: 'chunks/001.mp3', data: b },
      ]
    );

    const result = await loadSessionArchiveForTranscribe(zip, parseSessionArchive);
    assert.equal(result.error, undefined);
    assert.equal(result.sessionId, 'ses_demo');
    assert.equal(result.chunkCount, 2);
    assert.equal(result.blob.type, 'audio/mpeg');
    assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()), new Uint8Array([11, 22, 33, 44, 55]));
  });

  it('returns Cannot read archive for a bad zip', async () => {
    const result = await loadSessionArchiveForTranscribe(
      new Blob(['not a zip'], { type: 'application/zip' }),
      parseSessionArchive
    );
    assert.equal(result.error, 'Cannot read archive');
  });

  it('returns Unsupported or invalid archive for wrong formatVersion / kind', async () => {
    const future = zipFromManifest(validManifest({ formatVersion: 99 }));
    const unsupported = await loadSessionArchiveForTranscribe(future, parseSessionArchive);
    assert.equal(unsupported.error, 'Unsupported or invalid archive');

    const wrongKind = zipFromManifest(validManifest({ kind: 'not-this' }));
    const kind = await loadSessionArchiveForTranscribe(wrongKind, parseSessionArchive);
    assert.equal(kind.error, 'Unsupported or invalid archive');
  });

  it('returns No audio in archive to transcribe for metadata-only / purged chunks', async () => {
    const empty = zipFromManifest(validManifest({ chunkCount: 0, sizeBytes: 0, chunks: [] }));
    const noChunks = await loadSessionArchiveForTranscribe(empty, parseSessionArchive);
    assert.equal(noChunks.error, NO_AUDIO_IN_ARCHIVE);

    const purged = zipFromManifest(
      validManifest({
        chunkCount: 1,
        sizeBytes: 0,
        chunks: [
          {
            id: 'chunk_purged',
            seq: 0,
            startTime: 0,
            endTime: 4,
            duration: 4,
            mime: 'audio/mpeg',
            sizeBytes: 0,
            audioPurgedAt: '2026-09-04T17:10:00.000Z',
            file: null,
          },
        ],
      })
    );
    const noAudio = await loadSessionArchiveForTranscribe(purged, parseSessionArchive);
    assert.equal(noAudio.error, NO_AUDIO_IN_ARCHIVE);
  });
});
