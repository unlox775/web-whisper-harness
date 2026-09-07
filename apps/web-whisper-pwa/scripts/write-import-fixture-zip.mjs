/**
 * Write slim + debug session-store v1 zips for PWA import screenshots / manual QA.
 * Same format as exportSessionArchive (manifest + chunks/; debug adds optional JSON).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createZip } from '../../../packages/datastore/session-store/src/zip.js';
import {
  SESSION_ARCHIVE_FORMAT_VERSION,
  SESSION_ARCHIVE_KIND,
} from '../../../packages/datastore/session-store/src/archive.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../../../documentation/qa');

const SESSION_ID = 'ses_blt_import_fixture';
const CHUNK_IDS = ['chunk_blt_000', 'chunk_blt_001', 'chunk_blt_002'];
const SNIP_IDS = ['snip_blt_0', 'snip_blt_1'];

const SNIPS = [
  {
    id: SNIP_IDS[0],
    sessionId: SESSION_ID,
    startTime: 115.4,
    endTime: 131.0,
    duration: 15.6,
    chunkIds: [CHUNK_IDS[0], CHUNK_IDS[1]],
    startChunkIndex: 0,
    endChunkIndex: 1,
    confidence: 0.9,
    createdAt: '2026-09-07T22:24:00.000Z',
  },
  {
    id: SNIP_IDS[1],
    sessionId: SESSION_ID,
    startTime: 131.0,
    endTime: 150.0,
    duration: 19.0,
    chunkIds: [CHUNK_IDS[1], CHUNK_IDS[2]],
    startChunkIndex: 1,
    endChunkIndex: 2,
    confidence: 0.88,
    createdAt: '2026-09-07T22:24:00.000Z',
  },
];

const TRANSCRIPTS = [
  {
    snipId: SNIP_IDS[0],
    sessionId: SESSION_ID,
    text: "I'll take a BLT's.",
    createdAt: '2026-09-07T22:24:00.000Z',
    updatedAt: '2026-09-07T22:24:00.000Z',
  },
  {
    snipId: SNIP_IDS[1],
    sessionId: SESSION_ID,
    text: 'BLT is cheese quesadilla',
    createdAt: '2026-09-07T22:24:00.000Z',
    updatedAt: '2026-09-07T22:24:00.000Z',
  },
];

function audioBytes(fill, size = 256) {
  return new Uint8Array(size).fill(fill);
}

function sessionManifest(includeFlags) {
  const chunks = CHUNK_IDS.map((id, seq) => ({
    id,
    seq,
    startTime: seq * 4,
    endTime: (seq + 1) * 4,
    duration: 4,
    mime: 'audio/mpeg',
    sizeBytes: 256,
    audioPurgedAt: null,
    file: `chunks/${String(seq).padStart(3, '0')}.mp3`,
  }));
  return {
    formatVersion: SESSION_ARCHIVE_FORMAT_VERSION,
    exportedAt: '2026-09-07T22:24:00.000Z',
    kind: SESSION_ARCHIVE_KIND,
    id: SESSION_ID,
    createdAt: '2026-09-07T18:00:00.000Z',
    updatedAt: '2026-09-07T18:05:00.000Z',
    duration: 12,
    chunkCount: 3,
    sizeBytes: 768,
    hasVolumeProfile: includeFlags,
    hasSnips: includeFlags,
    hasTranscript: includeFlags,
    status: 'ready',
    notes: includeFlags ? 'BLT debug fixture for PWA import' : 'BLT slim fixture for PWA import',
    chunks,
  };
}

function volumeProfile() {
  return {
    sessionId: SESSION_ID,
    chunkVolumes: CHUNK_IDS.map((chunkId, chunkIndex) => ({
      chunkId,
      chunkIndex,
      peakDb: -18 - chunkIndex,
      samples: [-20, -18, -22, -16],
    })),
  };
}

function writeArchive(filename, debug) {
  const encoder = new TextEncoder();
  const entries = [
    {
      name: 'manifest.json',
      data: encoder.encode(`${JSON.stringify(sessionManifest(debug), null, 2)}\n`),
    },
    { name: 'chunks/000.mp3', data: audioBytes(11) },
    { name: 'chunks/001.mp3', data: audioBytes(22) },
    { name: 'chunks/002.mp3', data: audioBytes(33) },
  ];
  if (debug) {
    entries.push({
      name: 'snips.json',
      data: encoder.encode(`${JSON.stringify(SNIPS, null, 2)}\n`),
    });
    entries.push({
      name: 'transcripts.json',
      data: encoder.encode(`${JSON.stringify(TRANSCRIPTS, null, 2)}\n`),
    });
    entries.push({
      name: 'volume-profile.json',
      data: encoder.encode(`${JSON.stringify(volumeProfile(), null, 2)}\n`),
    });
  }
  const zip = createZip(entries);
  const dest = resolve(outDir, filename);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(dest, zip);
  return dest;
}

const debugPath = writeArchive('web-whisper-blt-debug-import.zip', true);
const slimPath = writeArchive('web-whisper-blt-slim-import.zip', false);
console.log(debugPath);
console.log(slimPath);
