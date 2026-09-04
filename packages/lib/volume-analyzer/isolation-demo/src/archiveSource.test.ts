import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSessionArchive } from '../../../../datastore/session-store/src/index.js';
import { createZip } from '../../../../datastore/session-store/src/zip.js';
import {
  ARCHIVE_ERROR_CANNOT_READ,
  ARCHIVE_ERROR_NO_AUDIO,
  ARCHIVE_ERROR_UNSUPPORTED,
  mapArchiveChunksToAnalyze,
  messageForArchiveParseError,
} from './archiveSource.ts';

function zipFromManifest(
  manifest: Record<string, unknown>,
  extraEntries: Array<{ name: string; data: Uint8Array }> = []
) {
  const encoder = new TextEncoder();
  const entries = [
    { name: 'manifest.json', data: encoder.encode(JSON.stringify(manifest)) },
    ...extraEntries,
  ];
  return new Blob([createZip(entries)], { type: 'application/zip' });
}

function validManifest(overrides: Record<string, unknown> = {}) {
  return {
    formatVersion: 1,
    exportedAt: '2026-09-04T18:00:00.000Z',
    kind: 'web-whisper-session-archive',
    id: 'ses_demo',
    createdAt: '2026-09-04T17:00:00.000Z',
    updatedAt: '2026-09-04T17:05:00.000Z',
    duration: 8,
    chunkCount: 2,
    sizeBytes: 8,
    hasVolumeProfile: false,
    hasSnips: false,
    hasTranscript: false,
    status: 'ready',
    chunks: [],
    ...overrides,
  };
}

describe('messageForArchiveParseError', () => {
  it('maps unzip failures to Cannot read archive', () => {
    assert.equal(messageForArchiveParseError('not_a_zip'), ARCHIVE_ERROR_CANNOT_READ);
    assert.equal(messageForArchiveParseError(undefined), ARCHIVE_ERROR_CANNOT_READ);
    assert.equal(messageForArchiveParseError('unknown_code'), ARCHIVE_ERROR_CANNOT_READ);
  });

  it('maps kind / formatVersion / manifest problems to Not a supported session archive', () => {
    assert.equal(messageForArchiveParseError('kind_mismatch'), ARCHIVE_ERROR_UNSUPPORTED);
    assert.equal(messageForArchiveParseError('unsupported_format_version'), ARCHIVE_ERROR_UNSUPPORTED);
    assert.equal(messageForArchiveParseError('invalid_manifest'), ARCHIVE_ERROR_UNSUPPORTED);
    assert.equal(messageForArchiveParseError('missing_manifest'), ARCHIVE_ERROR_UNSUPPORTED);
    assert.equal(messageForArchiveParseError('corrupt_json'), ARCHIVE_ERROR_UNSUPPORTED);
  });
});

describe('mapArchiveChunksToAnalyze', () => {
  it('skips purged null blobs and orders by seq', () => {
    const mapped = mapArchiveChunksToAnalyze({
      chunks: [
        {
          meta: { id: 'c2', seq: 2, startTime: 8, endTime: 12, duration: 4 },
          blob: new Blob([new Uint8Array([2])], { type: 'audio/mpeg' }),
        },
        {
          meta: { id: 'c1', seq: 1, startTime: 4, endTime: 8, duration: 4 },
          blob: null,
        },
        {
          meta: { id: 'c0', seq: 0, startTime: 0, endTime: 4, duration: 4 },
          blob: new Blob([new Uint8Array([0])], { type: 'audio/mpeg' }),
        },
      ],
    });

    assert.equal(mapped.length, 2);
    assert.deepEqual(
      mapped.map((chunk) => chunk.id),
      ['c0', 'c2']
    );
    assert.equal(mapped[0].seq, 0);
    assert.equal(mapped[1].seq, 2);
    assert.ok(mapped[0].blob);
    assert.ok(mapped[1].blob);
  });

  it('returns empty when every row is purged so callers can show no-audio', () => {
    const mapped = mapArchiveChunksToAnalyze({
      chunks: [
        {
          meta: { id: 'purged', seq: 0, startTime: 0, endTime: 4, duration: 4 },
          blob: null,
        },
      ],
    });
    assert.equal(mapped.length, 0);
    assert.equal(ARCHIVE_ERROR_NO_AUDIO, 'No audio in archive to analyze');
  });
});

describe('parseSessionArchive is the only archive parser', () => {
  it('maps a spec-1 zip into ChunkWithBlob seq order', async () => {
    const first = new Uint8Array([11, 12, 13]);
    const second = new Uint8Array([21, 22]);
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
            sizeBytes: second.length,
            file: 'chunks/001.mp3',
          },
          {
            id: 'chunk_a',
            seq: 0,
            startTime: 0,
            endTime: 4,
            duration: 4,
            mime: 'audio/mpeg',
            sizeBytes: first.length,
            file: 'chunks/000.mp3',
          },
        ],
      }),
      [
        { name: 'chunks/000.mp3', data: first },
        { name: 'chunks/001.mp3', data: second },
      ]
    );

    const parsed = await parseSessionArchive(zip);
    assert.equal(parsed.error, undefined);
    const mapped = mapArchiveChunksToAnalyze(parsed);
    assert.equal(mapped.length, 2);
    assert.equal(mapped[0].id, 'chunk_a');
    assert.equal(mapped[1].id, 'chunk_b');
    assert.deepEqual(new Uint8Array(await mapped[0].blob.arrayBuffer()), first);
    assert.deepEqual(new Uint8Array(await mapped[1].blob.arrayBuffer()), second);
  });

  it('surfaces parseSessionArchive errors with spec copy', async () => {
    const badZip = await parseSessionArchive(new Blob(['not a zip'], { type: 'application/zip' }));
    assert.equal(badZip.error, 'not_a_zip');
    assert.equal(messageForArchiveParseError(badZip.error), ARCHIVE_ERROR_CANNOT_READ);

    const wrongKind = await parseSessionArchive(
      zipFromManifest(validManifest({ kind: 'not-this' }))
    );
    assert.equal(wrongKind.error, 'kind_mismatch');
    assert.equal(messageForArchiveParseError(wrongKind.error), ARCHIVE_ERROR_UNSUPPORTED);

    const future = await parseSessionArchive(zipFromManifest(validManifest({ formatVersion: 99 })));
    assert.equal(future.error, 'unsupported_format_version');
    assert.equal(messageForArchiveParseError(future.error), ARCHIVE_ERROR_UNSUPPORTED);
  });

  it('treats a metadata-only archive as no audio to analyze', async () => {
    const zip = zipFromManifest(
      validManifest({
        chunkCount: 1,
        sizeBytes: 0,
        chunks: [
          {
            id: 'purged',
            seq: 0,
            startTime: 0,
            endTime: 4,
            duration: 4,
            mime: 'audio/mpeg',
            sizeBytes: 0,
            audioPurgedAt: 1,
            file: null,
          },
        ],
      })
    );
    const parsed = await parseSessionArchive(zip);
    assert.equal(parsed.error, undefined);
    assert.equal(mapArchiveChunksToAnalyze(parsed).length, 0);
  });
});
