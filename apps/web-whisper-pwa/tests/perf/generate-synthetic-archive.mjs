#!/usr/bin/env node
/**
 * Build a formatVersion-1 web-whisper session archive with the same shape as a
 * real ~24 min exported take: 357 × 4 s audio/mpeg chunks at ~128 kbps, volume
 * profile with per-chunk samples, snips, and transcripts.
 *
 * Real dictation audio is private and is never committed. This script generates
 * an ffmpeg tone+noise MP3 and synthetic text of realistic length.
 *
 * Usage:
 *   node tests/perf/generate-synthetic-archive.mjs
 *
 * Env:
 *   PERF_CHUNK_COUNT  default 357 (4 s each)
 *   PERF_CACHE_DIR    default tests/perf/.cache
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createZip } from '../../../../packages/datastore/session-store/src/zip.js';

const here = dirname(fileURLToPath(import.meta.url));
const CACHE = process.env.PERF_CACHE_DIR || join(here, '.cache');
const CHUNK_SECONDS = 4;
const SAMPLE_WINDOW_MS = 100;
const SAMPLES_PER_CHUNK = Math.round((CHUNK_SECONDS * 1000) / SAMPLE_WINDOW_MS);
const CHUNK_COUNT = Math.max(1, Number(process.env.PERF_CHUNK_COUNT || 357));
const DURATION = CHUNK_COUNT * CHUNK_SECONDS;
const SESSION_ID = 'ses_perf_synthetic';

const DICTATION_BEATS = [
  'Okay so the thing I wanted to capture is the sequence from this morning.',
  'First I opened the project notes and tried to reconstruct what we actually decided versus what I only thought we decided.',
  'The recording path has to stay durable. If a chunk is encoded it is saved, or held, never dropped because we got busy.',
  'I keep coming back to the session list feeling sticky once there are dozens of takes on the phone.',
  'Twenty four minutes of dictation is a normal working block for me. Snips land around ten to forty seconds.',
  'Volume profile has per-chunk peak and average and the sample array used by the histogram.',
  'When I tap a session I expect the transcript almost immediately, then I go back and start another take.',
  'IndexedDB is the authority. The PWA should not walk every audio blob just to draw a list tile.',
  'Retention may purge transcribed audio under quota, but it must never discard untranscribed capture.',
  'This paragraph exists only so imported sessions have transcript text of realistic spoken length, not a stub.',
];

function dictationText(snipIndex, durationSec) {
  const wordsTarget = Math.max(40, Math.round(durationSec * 2.2));
  const parts = [];
  let i = 0;
  while (parts.join(' ').split(/\s+/).length < wordsTarget) {
    parts.push(DICTATION_BEATS[(snipIndex + i) % DICTATION_BEATS.length]);
    i += 1;
  }
  return `Take ${snipIndex + 1}. ${parts.join(' ')}`;
}

function ensureFfmpegMp3(outPath) {
  if (existsSync(outPath) && statSync(outPath).size > 10_000) return;
  const result = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=196:duration=${CHUNK_SECONDS}`,
      '-f',
      'lavfi',
      '-i',
      `anoisesrc=color=pink:amplitude=0.06:duration=${CHUNK_SECONDS}`,
      '-filter_complex',
      'amix=inputs=2:duration=shortest:dropout_transition=0',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '128k',
      '-ar',
      '44100',
      '-ac',
      '1',
      outPath,
    ],
    { stdio: 'inherit' }
  );
  if (result.status !== 0) {
    throw new Error('ffmpeg failed to encode synthetic 4s 128kbps mp3');
  }
}

function padSeq(seq) {
  return String(seq).padStart(3, '0');
}

function speechEnvelope(chunkSeq, snipRanges) {
  const t0 = chunkSeq * CHUNK_SECONDS;
  const t1 = t0 + CHUNK_SECONDS;
  const inSnip = snipRanges.some((s) => s.startTime < t1 && s.endTime > t0);
  const samples = [];
  for (let i = 0; i < SAMPLES_PER_CHUNK; i += 1) {
    const t = t0 + (i * SAMPLE_WINDOW_MS) / 1000;
    const inside = snipRanges.some((s) => t >= s.startTime && t < s.endTime);
    if (!inside) {
      samples.push(-52 - (i % 5));
      continue;
    }
    const phase = (t * 2.7 + chunkSeq * 0.13) % (2 * Math.PI);
    samples.push(-18 + Math.sin(phase) * 6 + ((i * 17 + chunkSeq) % 5) - 2);
  }
  const peakDb = Math.max(...samples);
  const avgDb = samples.reduce((sum, v) => sum + v, 0) / samples.length;
  return { inSnip, peakDb, avgDb, samples };
}

function buildSnips(chunkIds) {
  const snips = [];
  let t = 0.4;
  let index = 0;
  while (t < DURATION - 6) {
    const duration = 8 + ((index * 11) % 32);
    const end = Math.min(DURATION - 0.3, t + duration);
    const startChunkIndex = Math.floor(t / CHUNK_SECONDS);
    const endChunkIndex = Math.min(CHUNK_COUNT - 1, Math.floor((end - 0.01) / CHUNK_SECONDS));
    const ids = chunkIds.slice(startChunkIndex, endChunkIndex + 1);
    snips.push({
      id: `snip_${index}`,
      startTime: Number(t.toFixed(3)),
      endTime: Number(end.toFixed(3)),
      duration: Number((end - t).toFixed(3)),
      chunkIds: ids,
      startChunkIndex,
      endChunkIndex,
      confidence: 0.82 + ((index % 7) * 0.02),
    });
    t = end + 0.7 + (index % 3) * 0.4;
    index += 1;
  }
  return snips;
}

function main() {
  mkdirSync(CACHE, { recursive: true });
  const mp3Path = join(CACHE, 'chunk-4s-128k.mp3');
  const zipPath = join(CACHE, `synthetic-session-${CHUNK_COUNT}x4s.zip`);
  const infoPath = join(CACHE, `synthetic-session-${CHUNK_COUNT}x4s.json`);

  ensureFfmpegMp3(mp3Path);
  const mp3 = readFileSync(mp3Path);
  const chunkSize = mp3.length;

  const chunkIds = Array.from({ length: CHUNK_COUNT }, (_, seq) => `chunk_${seq}`);
  const snips = buildSnips(chunkIds);
  const transcripts = snips.map((snip, i) => ({
    snipId: snip.id,
    sessionId: SESSION_ID,
    text: dictationText(i, snip.duration),
    createdAt: '2026-11-01T16:00:00.000Z',
    updatedAt: '2026-11-01T16:00:00.000Z',
  }));

  const snipRanges = snips.map((s) => ({ startTime: s.startTime, endTime: s.endTime }));
  const chunkVolumes = chunkIds.map((chunkId, seq) => {
    const env = speechEnvelope(seq, snipRanges);
    return {
      chunkId,
      chunkIndex: seq,
      peakDb: Number(env.peakDb.toFixed(2)),
      avgDb: Number(env.avgDb.toFixed(2)),
      samples: env.samples.map((v) => Number(v.toFixed(2))),
    };
  });

  const createdAt = '2026-11-01T15:30:00.000Z';
  const manifest = {
    formatVersion: 1,
    exportedAt: '2026-11-12T17:21:00.000Z',
    kind: 'web-whisper-session-archive',
    id: SESSION_ID,
    createdAt,
    updatedAt: '2026-11-01T16:00:00.000Z',
    duration: DURATION,
    chunkCount: CHUNK_COUNT,
    sizeBytes: CHUNK_COUNT * chunkSize,
    hasVolumeProfile: true,
    hasSnips: true,
    hasTranscript: true,
    status: 'ready',
    notes: 'synthetic perf fixture; not real dictation audio',
    chunks: chunkIds.map((id, seq) => ({
      id,
      seq,
      startTime: seq * CHUNK_SECONDS,
      endTime: (seq + 1) * CHUNK_SECONDS,
      duration: CHUNK_SECONDS,
      mime: 'audio/mpeg',
      sizeBytes: chunkSize,
      audioPurgedAt: null,
      file: `chunks/${padSeq(seq)}.mp3`,
    })),
  };

  const encoder = new TextEncoder();
  const entries = [
    { name: 'manifest.json', data: encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`) },
    { name: 'snips.json', data: encoder.encode(`${JSON.stringify(snips, null, 2)}\n`) },
    { name: 'transcripts.json', data: encoder.encode(`${JSON.stringify(transcripts, null, 2)}\n`) },
    {
      name: 'volume-profile.json',
      data: encoder.encode(
        `${JSON.stringify({ sessionId: SESSION_ID, chunkVolumes, createdAt }, null, 2)}\n`
      ),
    },
  ];
  for (let seq = 0; seq < CHUNK_COUNT; seq += 1) {
    entries.push({ name: `chunks/${padSeq(seq)}.mp3`, data: mp3 });
  }

  const zipBytes = createZip(entries);
  writeFileSync(zipPath, zipBytes);

  const info = {
    zipPath,
    mp3Path,
    chunkCount: CHUNK_COUNT,
    chunkSeconds: CHUNK_SECONDS,
    durationSeconds: DURATION,
    chunkBytes: chunkSize,
    zipBytes: zipBytes.length,
    snipCount: snips.length,
    transcriptCount: transcripts.length,
    samplesPerChunk: SAMPLES_PER_CHUNK,
    hasVolumeProfile: true,
    hasSnips: true,
    hasTranscript: true,
    status: 'ready',
    kind: 'web-whisper-session-archive',
    formatVersion: 1,
    bitrate: '128k',
    mime: 'audio/mpeg',
    note: 'Synthetic ffmpeg tone+noise. Not real dictation. Matches owner archive shape.',
  };
  writeFileSync(infoPath, `${JSON.stringify(info, null, 2)}\n`);

  const mb = (n) => (n / (1024 * 1024)).toFixed(2);
  console.log(
    JSON.stringify(
      {
        zipPath,
        zipMB: mb(zipBytes.length),
        chunkBytes: chunkSize,
        chunks: CHUNK_COUNT,
        durationSeconds: DURATION,
        snips: snips.length,
        transcripts: transcripts.length,
        estimatedSessionMB: mb(CHUNK_COUNT * chunkSize),
        estimatedN100GB: ((CHUNK_COUNT * chunkSize * 100) / (1024 * 1024 * 1024)).toFixed(2),
      },
      null,
      2
    )
  );
}

main();
