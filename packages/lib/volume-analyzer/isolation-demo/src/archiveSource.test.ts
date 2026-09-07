import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSessionArchive } from '../../../../datastore/session-store/src/index.js';
import { createZip } from '../../../../datastore/session-store/src/zip.js';
import {
  ARCHIVE_ERROR_CANNOT_READ,
  ARCHIVE_ERROR_NO_AUDIO,
  ARCHIVE_ERROR_UNSUPPORTED,
  ARCHIVE_PROFILE_MISSING,
  ARCHIVE_PROFILE_NO_SAMPLES,
  archiveLiveRangesStatusNote,
  archiveProfileUsedMessage,
  buildArchiveMetadataDump,
  buildArchiveReplayQueue,
  compactArchiveStatusLine,
  describeArchiveProfileStatus,
  mapArchiveChunksToAnalyze,
  mapArchivedLiveSnips,
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

describe('mapArchivedLiveSnips', () => {
  it('returns empty when optional files are absent (slim v1)', () => {
    const archived = mapArchivedLiveSnips({
      session: { id: 'ses_slim', hasSnips: true },
      chunks: [],
    });
    assert.deepEqual(archived, []);
    assert.equal(
      archiveLiveRangesStatusNote({ session: { id: 'ses_slim', hasSnips: true } }, 0),
      'hasSnips is a flag only — live ranges were not exported'
    );
  });

  it('joins transcripts on snipId and keeps ranges when a recompute list is replaced', () => {
    const archived = mapArchivedLiveSnips({
      snips: [
        {
          id: 'snip_9',
          startTime: 115,
          endTime: 131,
          duration: 16,
          chunkIds: ['c9'],
          startChunkIndex: 28,
          endChunkIndex: 32,
          confidence: 0.9,
        },
        {
          id: 'snip_10',
          startTime: 131,
          endTime: 150,
          duration: 19,
          chunkIds: ['c10'],
        },
      ],
      transcripts: [
        { snipId: 'snip_9', text: "BLT's." },
        { snipId: 'snip_10', text: 'BLT is cheese quesadilla' },
      ],
    });

    assert.equal(archived.length, 2);
    assert.equal(archived[0].id, 'snip_9');
    assert.equal(archived[0].startTime, 115);
    assert.equal(archived[0].endTime, 131);
    assert.equal(archived[0].duration, 16);
    assert.equal(archived[0].text, "BLT's.");
    assert.equal(archived[1].text, 'BLT is cheese quesadilla');

    const recomputed = [{ snipId: 1, startTime: 0, endTime: 8, duration: 8 }];
    assert.equal(archived.length, 2);
    assert.equal(archived[0].text, "BLT's.");
    assert.notEqual(archived[0].id, String(recomputed[0].snipId));
    assert.equal(
      archiveLiveRangesStatusNote({ session: { id: 'ses_x' } }, archived.length),
      'Live (archived): 2 snips'
    );
  });

  it('prefers parseSessionArchive snipsWithTranscripts when present', () => {
    const archived = mapArchivedLiveSnips({
      snips: [{ id: 'ignored', startTime: 0, endTime: 1, duration: 1, chunkIds: [] }],
      snipsWithTranscripts: [
        {
          id: 'snip_live',
          startTime: 2,
          endTime: 10,
          duration: 8,
          chunkIds: ['c0'],
          text: 'hello from join',
        },
      ],
    });
    assert.equal(archived.length, 1);
    assert.equal(archived[0].id, 'snip_live');
    assert.equal(archived[0].text, 'hello from join');
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
    assert.deepEqual(mapArchivedLiveSnips(parsed), []);
  });

  it('retains archived live snips + transcript text from optional zip files', async () => {
    const encoder = new TextEncoder();
    const zip = zipFromManifest(
      validManifest({
        hasSnips: true,
        hasTranscript: true,
        chunks: [
          {
            id: 'chunk_a',
            seq: 0,
            startTime: 0,
            endTime: 4,
            duration: 4,
            mime: 'audio/mpeg',
            sizeBytes: 1,
            file: 'chunks/000.mp3',
          },
        ],
      }),
      [
        { name: 'chunks/000.mp3', data: new Uint8Array([9]) },
        {
          name: 'snips.json',
          data: encoder.encode(
            JSON.stringify([
              {
                id: 'snip_live',
                startTime: 0,
                endTime: 4,
                duration: 4,
                chunkIds: ['chunk_a'],
                startChunkIndex: 0,
                endChunkIndex: 0,
                confidence: 0.8,
              },
            ])
          ),
        },
        {
          name: 'transcripts.json',
          data: encoder.encode(
            JSON.stringify([{ snipId: 'snip_live', text: 'archived live text' }])
          ),
        },
      ]
    );
    const parsed = await parseSessionArchive(zip);
    assert.equal(parsed.error, undefined);
    const archived = mapArchivedLiveSnips(parsed);
    assert.equal(archived.length, 1);
    assert.equal(archived[0].id, 'snip_live');
    assert.equal(archived[0].startTime, 0);
    assert.equal(archived[0].endTime, 4);
    assert.equal(archived[0].duration, 4);
    assert.equal(archived[0].text, 'archived live text');
  });
});

describe('archive volume-profile replay mapping', () => {
  it('prefers stored samples and does not require decode', () => {
    const parsed = {
      volumeProfile: {
        chunkVolumes: [
          {
            chunkId: 'c0',
            peakDb: -12,
            avgDb: -20,
            chunkIndex: 0,
            samples: [-20, -18, -12],
          },
          {
            chunkId: 'c1',
            peakDb: -14,
            avgDb: -22,
            chunkIndex: 1,
            samples: [-22, -14],
          },
        ],
      },
      chunks: [
        {
          meta: { id: 'c0', seq: 0, startTime: 0, endTime: 4, duration: 4 },
          blob: new Blob([new Uint8Array([1])], { type: 'audio/mpeg' }),
        },
        {
          meta: { id: 'c1', seq: 1, startTime: 4, endTime: 8, duration: 4 },
          blob: null,
        },
      ],
    };
    const status = describeArchiveProfileStatus(parsed);
    assert.equal(status.mode, 'used');
    assert.equal(status.line, archiveProfileUsedMessage(2));
    const queue = buildArchiveReplayQueue(parsed);
    assert.equal(queue.profileMode, 'used');
    assert.equal(queue.items.length, 2);
    assert.equal(queue.items[0].storedProfile?.samples.length, 3);
    assert.equal(queue.items[1].playable, false);
    assert.equal(queue.items[1].storedProfile?.samples.length, 2);
  });

  it('flags decode fallback when volume-profile.json has no per-chunk samples', () => {
    const parsed = {
      volumeProfile: {
        chunkVolumes: [{ chunkId: 'c0', peakDb: -12, chunkIndex: 0 }],
      },
      chunks: [
        {
          meta: { id: 'c0', seq: 0, startTime: 0, endTime: 4, duration: 4 },
          blob: new Blob([new Uint8Array([1])], { type: 'audio/mpeg' }),
        },
      ],
    };
    assert.equal(describeArchiveProfileStatus(parsed).line, ARCHIVE_PROFILE_NO_SAMPLES);
    const queue = buildArchiveReplayQueue(parsed);
    assert.equal(queue.profileMode, 'present_no_samples');
    assert.equal(queue.items[0].storedProfile, null);
    assert.equal(queue.items[0].playable, true);
  });

  it('flags decode fallback when volume-profile.json is missing', () => {
    assert.equal(describeArchiveProfileStatus({ chunks: [] }).line, ARCHIVE_PROFILE_MISSING);
  });
});

describe('compact archive metadata status', () => {
  it('hides dump details behind a one-line status', () => {
    assert.equal(
      compactArchiveStatusLine({
        profileMode: 'used',
        queueCount: 52,
        liveArchivedCount: 13,
      }),
      'volume-profile.json used · 52 chunks · Live archived 13'
    );
    assert.equal(
      compactArchiveStatusLine({
        profileMode: 'missing',
        queueCount: 0,
        liveArchivedCount: 3,
      }),
      'no volume-profile.json · 0 chunks · Live archived 3'
    );
  });

  it('builds a dump from parse + queue for the metadata checkbox', () => {
    const parsed = {
      formatVersion: 1,
      exportedAt: '2026-09-07T17:35:00.000Z',
      notes: 'debug export',
      session: {
        id: 'ses_blt',
        duration: 207,
        chunkCount: 52,
        hasSnips: true,
        hasTranscript: true,
        hasVolumeProfile: true,
      },
      volumeProfile: {
        chunkVolumes: [
          {
            chunkId: 'c0',
            peakDb: -12,
            avgDb: -20,
            chunkIndex: 0,
            samples: [-20, -18],
          },
        ],
      },
      chunks: [
        {
          meta: { id: 'c0', seq: 0, startTime: 0, endTime: 4, duration: 4 },
          blob: new Blob([new Uint8Array([1])], { type: 'audio/mpeg' }),
        },
      ],
    };
    const queue = buildArchiveReplayQueue(parsed);
    const dump = buildArchiveMetadataDump({
      fileName: 'blt.zip',
      parsed,
      queue: queue.items,
      liveCount: 13,
    });
    assert.equal(dump.fileName, 'blt.zip');
    assert.equal(dump.formatVersion, 1);
    assert.equal(dump.sessionId, 'ses_blt');
    assert.equal(dump.queueCount, 1);
    assert.equal(dump.liveArchivedCount, 13);
    assert.equal(dump.profileMode, 'used');
    assert.equal(dump.chunkRows[0].hasSamples, true);
    assert.equal(
      compactArchiveStatusLine(dump),
      'volume-profile.json used · 1 chunks · Live archived 13'
    );
  });
});

