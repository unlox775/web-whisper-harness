import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import * as sessionStore from './index.js';

let dbSeq = 0;

async function openFreshDb() {
  dbSeq += 1;
  sessionStore.closeDatabase();
  await sessionStore.init({ databaseName: `web-whisper-retention-test-${dbSeq}` });
}

async function writeAudioChunk(sessionId, seq, sizeBytes) {
  const blob = new Blob([new Uint8Array(sizeBytes)], { type: 'audio/mpeg' });
  const result = await sessionStore.writeChunk(sessionId, {
    seq,
    startTime: seq * 4,
    endTime: (seq + 1) * 4,
    duration: 4,
    blob,
    sizeBytes,
  });
  assert.ok(result.chunkId, result.error);
  return result.chunkId;
}

async function addSnipWithOptionalTranscript(sessionId, chunkIds, text) {
  const result = await sessionStore.writeSnip(sessionId, {
    startChunkIndex: 0,
    endChunkIndex: Math.max(0, chunkIds.length - 1),
    startTime: 0,
    endTime: chunkIds.length * 4,
    duration: chunkIds.length * 4,
    chunkIds,
    confidence: 0.9,
  });
  assert.ok(result.snipId, result.error);
  if (text) {
    const written = await sessionStore.writeTranscript(result.snipId, text);
    assert.equal(written.written, true);
  }
  return result.snipId;
}

describe('enforceRetentionPolicy — purge transcribed audio', () => {
  beforeEach(async () => {
    await openFreshDb();
  });

  afterEach(() => {
    sessionStore.closeDatabase();
  });

  it('purges oldest fully-transcribed audio and keeps the transcript', async () => {
    const older = await sessionStore.createSession();
    const olderChunk = await writeAudioChunk(older.id, 0, 20_000);
    await sessionStore.writeVolumeProfile(older.id, {
      chunkVolumes: [{ chunkId: olderChunk, peakDb: -12, samples: [-12, -11] }],
    });
    await addSnipWithOptionalTranscript(older.id, [olderChunk], 'Lecture notes stay.');

    // createdAt is ISO now(); wait so the next session is strictly newer
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newerUntranscribed = await sessionStore.createSession();
    const liveChunk = await writeAudioChunk(newerUntranscribed.id, 0, 20_000);
    await addSnipWithOptionalTranscript(newerUntranscribed.id, [liveChunk], null);

    const statsBefore = await sessionStore.getStorageStats();
    assert.ok(statsBefore.usedBytes > 30_000);

    const capBytes = 25_000; // 90% target = 22_500; must purge transcribed audio
    const result = await sessionStore.enforceRetentionPolicy(capBytes);
    assert.equal(result.error, undefined);
    assert.equal(result.deletedSessions, 0);
    assert.ok(result.purgedChunkIds.includes(olderChunk));
    assert.ok(!result.purgedChunkIds.includes(liveChunk));
    assert.equal(result.droppedVolumeProfiles, 1);

    const sessions = await sessionStore.listSessions();
    assert.equal(sessions.sessions.length, 2);

    const purgedChunk = await sessionStore.getChunk(olderChunk);
    assert.equal(sessionStore.isChunkAudioPurged(purgedChunk), true);
    assert.equal(purgedChunk.sizeBytes, 0);
    assert.equal(purgedChunk.blob.size, 0);
    assert.ok(purgedChunk.audioPurgedAt);

    const keptChunk = await sessionStore.getChunk(liveChunk);
    assert.equal(sessionStore.isChunkAudioPurged(keptChunk), false);
    assert.equal(keptChunk.sizeBytes, 20_000);
    assert.equal(keptChunk.blob.size, 20_000);

    const transcripts = await sessionStore.getTranscriptsForSession(older.id);
    assert.equal(transcripts.transcripts.length, 1);
    assert.equal(transcripts.transcripts[0].text, 'Lecture notes stay.');

    const olderSession = await sessionStore.getSession(older.id);
    assert.ok(olderSession);
    assert.equal(olderSession.hasTranscript, true);
    assert.equal(olderSession.sizeBytes, 0);
    assert.equal(await sessionStore.getVolumeProfile(older.id), null);

    const snip = (await sessionStore.getSnipsForSession(older.id)).snips[0];
    assert.ok(snip.audioPurgedAt);
  });

  it('never deletes a snip’s audio when it has no successful transcript', async () => {
    const session = await sessionStore.createSession();
    const chunkId = await writeAudioChunk(session.id, 0, 50_000);
    await addSnipWithOptionalTranscript(session.id, [chunkId], '   '); // whitespace is not valid text

    const result = await sessionStore.enforceRetentionPolicy(1000);
    assert.equal(result.purgedChunkIds.length, 0);
    const chunk = await sessionStore.getChunk(chunkId);
    assert.equal(chunk.sizeBytes, 50_000);
    assert.equal(sessionStore.isChunkAudioPurged(chunk), false);
  });

  it('does not purge a chunk until every overlapping snip is transcribed', async () => {
    const session = await sessionStore.createSession();
    const shared = await writeAudioChunk(session.id, 0, 40_000);
    await addSnipWithOptionalTranscript(session.id, [shared], 'First snip done.');
    await addSnipWithOptionalTranscript(session.id, [shared], null);

    const result = await sessionStore.enforceRetentionPolicy(1000);
    assert.equal(result.purgedChunkIds.length, 0);
    const chunk = await sessionStore.getChunk(shared);
    assert.equal(chunk.sizeBytes, 40_000);
  });

  it('prefers oldest fully-transcribed audio when two sessions are eligible', async () => {
    const first = await sessionStore.createSession();
    const firstChunk = await writeAudioChunk(first.id, 0, 15_000);
    await addSnipWithOptionalTranscript(first.id, [firstChunk], 'Older transcript.');

    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await sessionStore.createSession();
    const secondChunk = await writeAudioChunk(second.id, 0, 15_000);
    await addSnipWithOptionalTranscript(second.id, [secondChunk], 'Newer transcript.');

    // Target 90% of 20_000 = 18_000. used ≈ 33_000. One 15k chunk is enough.
    const result = await sessionStore.enforceRetentionPolicy(20_000);
    assert.deepEqual(result.purgedChunkIds, [firstChunk]);
    assert.equal(sessionStore.isChunkAudioPurged(await sessionStore.getChunk(firstChunk)), true);
    assert.equal(sessionStore.isChunkAudioPurged(await sessionStore.getChunk(secondChunk)), false);
  });

  it('is a no-op when usage is under the approaching-cap threshold', async () => {
    const session = await sessionStore.createSession();
    const chunkId = await writeAudioChunk(session.id, 0, 1000);
    await addSnipWithOptionalTranscript(session.id, [chunkId], 'Tiny.');

    const result = await sessionStore.enforceRetentionPolicy(200 * 1024 * 1024);
    assert.equal(result.purgedChunkIds.length, 0);
    assert.equal((await sessionStore.getChunk(chunkId)).sizeBytes, 1000);
  });
});
