import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSessionArchive, SESSION_ARCHIVE_KIND } from '../../../datastore/session-store/src/index.js';
import { createZip } from '../../../datastore/session-store/src/zip.js';
import {
  ARCHIVE_MOCK_REFUSE,
  archiveParseErrorMessage,
  assembleArchiveUnitBlob,
  blobsForSnip,
  buildArchiveTranscribeUnits,
  collectArchiveAudioBlobs,
  collectArchiveSnips,
  concatArchiveAudio,
  describeArchiveStepUnits,
  loadSessionArchiveForTranscribe,
  NO_AUDIO_IN_ARCHIVE,
} from './archiveSource.js';
import {
  planSnipAudioSlices,
  transcriptionWindowsOverlap,
  wavDurationSeconds,
} from '../src/assembleSnipAudio.js';

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
    assert.equal(result.unitKind, 'chunk');
    assert.equal(result.units.length, 2);
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

  it('prefers snip units when snips.json is present and assemble-able', async () => {
    const a = new Uint8Array([11, 22]);
    const b = new Uint8Array([33, 44, 55]);
    const encoder = new TextEncoder();
    const zip = zipFromManifest(
      validManifest({
        hasSnips: true,
        chunks: [
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
        ],
      }),
      [
        { name: 'chunks/000.mp3', data: a },
        { name: 'chunks/001.mp3', data: b },
        {
          name: 'snips.json',
          data: encoder.encode(
            JSON.stringify([
              {
                id: 'snip_first',
                startTime: 0,
                endTime: 4,
                duration: 4,
                chunkIds: ['chunk_a'],
              },
              {
                id: 'snip_second',
                startTime: 4,
                endTime: 8,
                duration: 4,
                chunkIds: ['chunk_b'],
              },
            ])
          ),
        },
      ]
    );

    const result = await loadSessionArchiveForTranscribe(zip, parseSessionArchive);
    assert.equal(result.error, undefined);
    assert.equal(result.unitKind, 'snip');
    assert.equal(result.units.length, 2);
    assert.equal(result.units[0].id, 'snip_first');
    const first = await assembleArchiveUnitBlob(result.units[0]);
    const second = await assembleArchiveUnitBlob(result.units[1]);
    assert.deepEqual(new Uint8Array(await first.blob.arrayBuffer()), a);
    assert.deepEqual(new Uint8Array(await second.blob.arrayBuffer()), b);
    assert.match(describeArchiveStepUnits(result), /Stepping by snips/);
  });
});

describe('buildArchiveTranscribeUnits', () => {
  it('falls back to time overlap when snip chunkIds are empty', async () => {
    const first = new Blob([new Uint8Array([1])], { type: 'audio/mpeg' });
    const second = new Blob([new Uint8Array([2, 3])], { type: 'audio/mpeg' });
    const { kind, units } = buildArchiveTranscribeUnits({
      chunks: [
        { meta: { id: 'c0', seq: 0, startTime: 0, endTime: 4, duration: 4 }, blob: first },
        { meta: { id: 'c1', seq: 1, startTime: 4, endTime: 8, duration: 4 }, blob: second },
      ],
      snips: [
        { id: 'snip_overlap', startTime: 3, endTime: 6, duration: 3, chunkIds: [] },
      ],
    });
    assert.equal(kind, 'snip');
    assert.equal(units.length, 1);
    const assembled = await assembleArchiveUnitBlob(units[0]);
    assert.equal(assembled.blob.size, 3);
  });

  it('steps by chunks when hasSnips is a flag only (slim zip)', () => {
    const blob = new Blob([new Uint8Array([9])], { type: 'audio/mpeg' });
    const parsed = {
      session: { hasSnips: true },
      chunks: [{ meta: { id: 'c0', seq: 0, startTime: 0, endTime: 4 }, blob }],
    };
    const { kind, units } = buildArchiveTranscribeUnits(parsed);
    assert.equal(kind, 'chunk');
    assert.equal(units.length, 1);
    assert.match(
      describeArchiveStepUnits({ unitKind: kind, units, hasSnipsFlag: true }),
      /hasSnips is a flag only/
    );
  });
});

describe('collectArchiveSnips + blobsForSnip', () => {
  it('reads snipsWithTranscripts first', () => {
    const snips = collectArchiveSnips({
      snips: [{ id: 'ignored', startTime: 0, endTime: 1, duration: 1, chunkIds: [] }],
      snipsWithTranscripts: [
        { id: 'joined', startTime: 2, endTime: 5, duration: 3, chunkIds: ['c1'] },
      ],
    });
    assert.equal(snips.length, 1);
    assert.equal(snips[0].id, 'joined');
  });

  it('returns no blobs for a snip whose chunks were purged', () => {
    const blobs = blobsForSnip(
      { id: 's', startTime: 0, endTime: 4, chunkIds: ['gone'] },
      [{ meta: { id: 'gone' }, blob: null }]
    );
    assert.deepEqual(blobs, []);
  });
});

describe('assembleArchiveUnitBlob — abutting snips do not share a boundary chunk', () => {
  /**
   * Same tape as the PWA #53 fixture / Dave’s Isolation Demo report:
   * five ~4s chunks, two abutting snips that both list the mid-cut chunk.
   * Old demo path concatenated full chunkIds → both Groq blobs contained c2.
   */
  const fourSecondChunks = [
    { meta: { id: 'c0', seq: 0, startTime: 0, endTime: 4, duration: 4 }, blob: new Blob(['C0'], { type: 'audio/mpeg' }) },
    { meta: { id: 'c1', seq: 1, startTime: 4, endTime: 8, duration: 4 }, blob: new Blob(['C1'], { type: 'audio/mpeg' }) },
    { meta: { id: 'c2', seq: 2, startTime: 8, endTime: 12, duration: 4 }, blob: new Blob(['C2'], { type: 'audio/mpeg' }) },
    { meta: { id: 'c3', seq: 3, startTime: 12, endTime: 16, duration: 4 }, blob: new Blob(['C3'], { type: 'audio/mpeg' }) },
    { meta: { id: 'c4', seq: 4, startTime: 16, endTime: 20, duration: 4 }, blob: new Blob(['C4'], { type: 'audio/mpeg' }) },
  ];

  const abuttingSnips = [
    { id: 'snip_a', startTime: 0, endTime: 10, duration: 10, chunkIds: ['c0', 'c1', 'c2'] },
    { id: 'snip_b', startTime: 10, endTime: 20, duration: 10, chunkIds: ['c2', 'c3', 'c4'] },
  ];

  const sessionChunks = fourSecondChunks.map((entry) => ({
    id: entry.meta.id,
    startTime: entry.meta.startTime,
    endTime: entry.meta.endTime,
    duration: entry.meta.duration,
    blob: entry.blob,
  }));

  function failDecode() {
    return async () => {
      throw new Error('no decoder');
    };
  }

  it('old whole-chunk concat would put C2 (8–12s) in both snip blobs', async () => {
    const { units } = buildArchiveTranscribeUnits({ chunks: fourSecondChunks, snips: abuttingSnips });
    assert.equal(units.length, 2);
    const wholeA = await concatArchiveAudio(blobsForSnip(units[0].snip, fourSecondChunks)).text();
    const wholeB = await concatArchiveAudio(blobsForSnip(units[1].snip, fourSecondChunks)).text();
    assert.equal(wholeA.includes('C2'), true);
    assert.equal(wholeB.includes('C2'), true);
  });

  it('decode-fail fallback drops the shared boundary chunk from only one snip', async () => {
    const { units } = buildArchiveTranscribeUnits({ chunks: fourSecondChunks, snips: abuttingSnips });
    const a = await assembleArchiveUnitBlob(units[0], { decode: failDecode() });
    const b = await assembleArchiveUnitBlob(units[1], { decode: failDecode() });
    assert.equal(a.kind, 'concat-mp3');
    assert.equal(b.kind, 'concat-mp3');
    const textA = await a.blob.text();
    const textB = await b.blob.text();
    assert.equal(textA.includes('C0'), true);
    assert.equal(textA.includes('C1'), true);
    assert.equal(textA.includes('C2'), false);
    assert.equal(textB.includes('C2'), true);
    assert.equal(textB.includes('C3'), true);
    assert.equal(textB.includes('C4'), true);
    assert.equal(textA.includes('C2') && textB.includes('C2'), false);
  });

  it('trimmed slice windows abut and do not overlap (10s each, not 12s union)', () => {
    const slicesA = planSnipAudioSlices(abuttingSnips[0], sessionChunks);
    const slicesB = planSnipAudioSlices(abuttingSnips[1], sessionChunks);
    assert.deepEqual(
      slicesA.map((slice) => [slice.chunkId, slice.sliceStartTime, slice.sliceEndTime]),
      [
        ['c0', 0, 4],
        ['c1', 4, 8],
        ['c2', 8, 10],
      ]
    );
    assert.deepEqual(
      slicesB.map((slice) => [slice.chunkId, slice.sliceStartTime, slice.sliceEndTime]),
      [
        ['c2', 10, 12],
        ['c3', 12, 16],
        ['c4', 16, 20],
      ]
    );
    const jobs = [
      { snipId: 'snip_a', slices: slicesA },
      { snipId: 'snip_b', slices: slicesB },
    ];
    assert.equal(transcriptionWindowsOverlap(jobs), false);
    const durationA = slicesA.reduce((sum, slice) => sum + (slice.sliceEndTime - slice.sliceStartTime), 0);
    const durationB = slicesB.reduce((sum, slice) => sum + (slice.sliceEndTime - slice.sliceStartTime), 0);
    assert.equal(durationA, 10);
    assert.equal(durationB, 10);
  });

  it('decode path writes a ~10s WAV so Groq does not hear the extra 8–12s tail', async () => {
    const sampleRate = 1000;
    const pcmById = new Map();
    for (const entry of fourSecondChunks) {
      const duration = entry.meta.endTime - entry.meta.startTime;
      const channelData = new Float32Array(duration * sampleRate);
      for (let i = 0; i < channelData.length; i++) {
        channelData[i] = (entry.meta.startTime + i / sampleRate) / 100;
      }
      pcmById.set(entry.meta.id, { channelData, sampleRate, duration });
    }
    const decode = async (blob) => {
      const text = await blob.text();
      const id = `c${['C0', 'C1', 'C2', 'C3', 'C4'].indexOf(text)}`;
      const pcm = pcmById.get(id);
      if (!pcm) throw new Error(`unknown blob ${text}`);
      return pcm;
    };

    const { units } = buildArchiveTranscribeUnits({ chunks: fourSecondChunks, snips: abuttingSnips });
    const a = await assembleArchiveUnitBlob(units[0], { decode });
    const b = await assembleArchiveUnitBlob(units[1], { decode });
    assert.equal(a.kind, 'trimmed-wav');
    assert.equal(b.kind, 'trimmed-wav');
    const secondsA = wavDurationSeconds(await a.blob.arrayBuffer());
    const secondsB = wavDurationSeconds(await b.blob.arrayBuffer());
    assert.ok(Math.abs(secondsA - 10) < 0.02, `expected ~10s wav A, got ${secondsA}`);
    assert.ok(Math.abs(secondsB - 10) < 0.02, `expected ~10s wav B, got ${secondsB}`);
    assert.equal(a.slices.at(-1)?.sliceEndTime, 10);
    assert.equal(b.slices[0]?.sliceStartTime, 10);
  });
});
