import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import * as sessionStore from './index.js';
import { createZip } from './zip.js';

let dbSeq = 0;

async function openFreshDb() {
  dbSeq += 1;
  sessionStore.closeDatabase();
  await sessionStore.init({ databaseName: `web-whisper-archive-test-${dbSeq}` });
}

function audioBytes(fill, size = 64) {
  return new Uint8Array(size).fill(fill);
}

async function writeAudioChunk(sessionId, seq, fill = 7, sizeBytes = 64) {
  const bytes = audioBytes(fill, sizeBytes);
  const blob = new Blob([bytes], { type: 'audio/mpeg' });
  const result = await sessionStore.writeChunk(sessionId, {
    seq,
    startTime: seq * 4,
    endTime: (seq + 1) * 4,
    duration: 4,
    blob,
    sizeBytes,
  });
  assert.ok(result.chunkId, result.error);
  return { chunkId: result.chunkId, bytes };
}

async function zipFromManifest(manifest, extraEntries = []) {
  const encoder = new TextEncoder();
  const entries = [
    { name: 'manifest.json', data: encoder.encode(JSON.stringify(manifest)) },
    ...extraEntries,
  ];
  return new Blob([createZip(entries)], { type: 'application/zip' });
}

describe('session audio archive export / parse / import', () => {
  beforeEach(async () => {
    await openFreshDb();
  });

  afterEach(() => {
    sessionStore.closeDatabase();
  });

  it('round-trips session fields, chunk meta, and blob bytes through parse', async () => {
    const created = await sessionStore.createSession();
    const first = await writeAudioChunk(created.id, 0, 11, 80);
    const second = await writeAudioChunk(created.id, 1, 22, 96);
    await sessionStore.finalizeSession(created.id);

    const exported = await sessionStore.exportSessionArchive(created.id, {
      notes: 'failed take',
    });
    assert.equal(exported.error, undefined);
    assert.ok(exported instanceof Blob);
    assert.equal(exported.type, 'application/zip');

    const filename = sessionStore.sessionArchiveFilename(created.id, 1_725_472_800_000);
    assert.equal(filename, `web-whisper-session-${created.id}-1725472800000.zip`);

    const listedBefore = await sessionStore.listSessions();
    const parsed = await sessionStore.parseSessionArchive(exported);
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.formatVersion, 1);
    assert.equal(parsed.notes, 'failed take');
    assert.equal(parsed.session.id, created.id);
    assert.equal(parsed.session.chunkCount, 2);
    assert.equal(parsed.session.status, 'ready');
    assert.equal(parsed.chunks.length, 2);
    assert.equal(parsed.chunks[0].meta.seq, 0);
    assert.equal(parsed.chunks[0].meta.file, 'chunks/000.mp3');
    assert.equal(parsed.chunks[0].meta.mime, 'audio/mpeg');
    assert.ok(parsed.chunks[0].blob);
    assert.deepEqual(new Uint8Array(await parsed.chunks[0].blob.arrayBuffer()), first.bytes);
    assert.deepEqual(new Uint8Array(await parsed.chunks[1].blob.arrayBuffer()), second.bytes);
    assert.equal(parsed.snips, undefined);
    assert.equal(parsed.transcripts, undefined);
    assert.equal(parsed.volumeProfile, undefined);

    const listedAfter = await sessionStore.listSessions();
    assert.equal(listedAfter.sessions.length, listedBefore.sessions.length);
    assert.equal(listedAfter.sessions[0].id, created.id);
  });

  it('lists purged chunks in the manifest and skips zip bytes', async () => {
    const created = await sessionStore.createSession();
    const live = await writeAudioChunk(created.id, 0, 33, 48);
    const empty = await sessionStore.writeChunk(created.id, {
      seq: 1,
      startTime: 4,
      endTime: 8,
      duration: 4,
      blob: new Blob([], { type: 'audio/mpeg' }),
      sizeBytes: 0,
    });
    assert.ok(empty.chunkId, empty.error);

    const exported = await sessionStore.exportSessionArchive(created.id);
    const parsed = await sessionStore.parseSessionArchive(exported);
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.chunks.length, 2);

    const purged = parsed.chunks.find((entry) => entry.meta.seq === 1);
    assert.ok(purged);
    assert.equal(purged.blob, null);
    assert.equal(purged.meta.file, null);

    const present = parsed.chunks.find((entry) => entry.meta.seq === 0);
    assert.ok(present.blob);
    assert.equal(present.meta.file, 'chunks/000.mp3');
    assert.deepEqual(new Uint8Array(await present.blob.arrayBuffer()), live.bytes);
  });

  it('parses a metadata-only session with zero chunks', async () => {
    const created = await sessionStore.createSession();
    const exported = await sessionStore.exportSessionArchive(created.id);
    assert.equal(exported.error, undefined);

    const parsed = await sessionStore.parseSessionArchive(exported);
    assert.equal(parsed.error, undefined);
    assert.equal(parsed.session.id, created.id);
    assert.equal(parsed.chunks.length, 0);
    assert.equal(parsed.formatVersion, 1);
  });

  it('returns named errors for bad zip, missing manifest, and unsupported formatVersion', async () => {
    const notZip = await sessionStore.parseSessionArchive(
      new Blob(['not a zip'], { type: 'application/zip' })
    );
    assert.equal(notZip.error, 'not_a_zip');

    const emptyZip = new Blob([createZip([{ name: 'readme.txt', data: new TextEncoder().encode('hi') }])], {
      type: 'application/zip',
    });
    const missing = await sessionStore.parseSessionArchive(emptyZip);
    assert.equal(missing.error, 'missing_manifest');

    const future = await zipFromManifest({
      formatVersion: 99,
      exportedAt: new Date().toISOString(),
      kind: sessionStore.SESSION_ARCHIVE_KIND,
      id: 'ses_future',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      duration: 0,
      chunkCount: 0,
      sizeBytes: 0,
      hasVolumeProfile: false,
      hasSnips: false,
      hasTranscript: false,
      status: 'ready',
      chunks: [],
    });
    const unsupported = await sessionStore.parseSessionArchive(future);
    assert.equal(unsupported.error, 'unsupported_format_version');

    const wrongKind = await zipFromManifest({
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      kind: 'not-this',
      id: 'ses_wrong',
      chunks: [],
    });
    const kind = await sessionStore.parseSessionArchive(wrongKind);
    assert.equal(kind.error, 'kind_mismatch');

    const corrupt = new Blob(
      [createZip([{ name: 'manifest.json', data: new TextEncoder().encode('{not json') }])],
      { type: 'application/zip' }
    );
    const badJson = await sessionStore.parseSessionArchive(corrupt);
    assert.equal(badJson.error, 'corrupt_json');
  });

  it('importSessionArchive creates a new-id session and leaves the original in place', async () => {
    const created = await sessionStore.createSession();
    const first = await writeAudioChunk(created.id, 0, 44, 72);
    await sessionStore.finalizeSession(created.id);

    const exported = await sessionStore.exportSessionArchive(created.id);
    const imported = await sessionStore.importSessionArchive(exported);
    assert.equal(imported.error, undefined);
    assert.ok(imported.sessionId);
    assert.notEqual(imported.sessionId, created.id);
    assert.equal(imported.chunkIds.length, 1);
    assert.notEqual(imported.chunkIds[0], first.chunkId);

    const listed = await sessionStore.listSessions();
    assert.equal(listed.sessions.length, 2);
    assert.ok(listed.sessions.some((session) => session.id === created.id));
    assert.ok(listed.sessions.some((session) => session.id === imported.sessionId));

    const original = await sessionStore.getChunk(first.chunkId);
    assert.ok(original);
    assert.deepEqual(new Uint8Array(await original.blob.arrayBuffer()), first.bytes);

    const copy = await sessionStore.getChunk(imported.chunkIds[0]);
    assert.ok(copy);
    assert.equal(copy.sessionId, imported.sessionId);
    assert.deepEqual(new Uint8Array(await copy.blob.arrayBuffer()), first.bytes);

    const preserveCollision = await sessionStore.importSessionArchive(exported, {
      preserveIds: true,
    });
    assert.equal(preserveCollision.error, 'id_collision');
  });

  it('exportSessionArchive returns session_not_found and optional includes stay off by default', async () => {
    const missing = await sessionStore.exportSessionArchive('ses_does_not_exist');
    assert.equal(missing.error, 'session_not_found');

    const created = await sessionStore.createSession();
    await writeAudioChunk(created.id, 0, 55, 32);
    const snip = await sessionStore.writeSnip(created.id, {
      startChunkIndex: 0,
      endChunkIndex: 0,
      startTime: 0,
      endTime: 4,
      duration: 4,
      chunkIds: [],
      confidence: 0.9,
    });
    await sessionStore.writeTranscript(snip.snipId, 'keep me out of the default zip');
    await sessionStore.writeVolumeProfile(created.id, {
      chunkVolumes: [{ chunkId: 'chunk_x', peakDb: -12 }],
    });

    const exported = await sessionStore.exportSessionArchive(created.id);
    const parsed = await sessionStore.parseSessionArchive(exported);
    assert.equal(parsed.snips, undefined);
    assert.equal(parsed.transcripts, undefined);
    assert.equal(parsed.volumeProfile, undefined);

    const withOptionals = await sessionStore.exportSessionArchive(created.id, {
      includeSnips: true,
      includeTranscripts: true,
      includeVolumeProfile: true,
    });
    const parsedOptionals = await sessionStore.parseSessionArchive(withOptionals);
    assert.equal(parsedOptionals.snips.length, 1);
    assert.equal(parsedOptionals.transcripts.length, 1);
    assert.equal(parsedOptionals.transcripts[0].text, 'keep me out of the default zip');
    assert.ok(parsedOptionals.volumeProfile);
  });
});
