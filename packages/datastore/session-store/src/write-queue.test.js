import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import * as sessionStore from './index.js';

let dbSeq = 0;

async function openFreshDb() {
  dbSeq += 1;
  sessionStore.closeDatabase();
  await sessionStore.init({ databaseName: `web-whisper-write-queue-${dbSeq}` });
}

function audioBlob(sizeBytes) {
  return new Blob([new Uint8Array(sizeBytes)], { type: 'audio/mpeg' });
}

function chunkPayload(seq, sizeBytes = 64) {
  return {
    seq,
    startTime: seq * 4,
    endTime: (seq + 1) * 4,
    duration: 4,
    blob: audioBlob(sizeBytes),
    sizeBytes
  };
}

describe('owner-serialized writes and coverage', () => {
  beforeEach(async () => {
    await openFreshDb();
  });

  afterEach(() => {
    sessionStore.setLogWriteFailureForTests(false);
    sessionStore.closeDatabase();
  });

  it(
    'stores 100 concurrent writeChunk calls issued while retention runs over a large DB',
    { timeout: 120_000 },
    async () => {
      const seed = await sessionStore.createSession();
      const live = await sessionStore.createSession();
      const seedBlob = audioBlob(256);
      const chunkRecords = [];
      for (let i = 0; i < 5000; i += 1) {
        chunkRecords.push({
          id: `chunk_seed_${i}`,
          sessionId: seed.id,
          seq: i,
          startTime: i * 4,
          endTime: (i + 1) * 4,
          duration: 4,
          blob: seedBlob,
          sizeBytes: 256
        });
      }
      const seededChunks = await sessionStore.putChunkRecordsBulk(chunkRecords);
      assert.equal(seededChunks.written, 5000);

      const now = Date.now();
      const logRows = [];
      for (let i = 0; i < 20_000; i += 1) {
        logRows.push({
          id: `log_seed_${i}`,
          sessionId: seed.id,
          packageId: 'session-store',
          level: 'info',
          message: 'seed',
          createdAt: new Date(now - i).toISOString(),
          sizeBytes: 80
        });
      }
      const seededLogs = await sessionStore.putLogRecordsBulk(logRows);
      assert.equal(seededLogs.written, 20_000);

      const stats = await sessionStore.getStorageStats();
      assert.ok(stats.chunkCount >= 5000);
      assert.ok(stats.logEntryCount >= 20_000);

      const retentionP = sessionStore.enforceRetentionPolicy(50_000);
      await new Promise((resolve) => setTimeout(resolve, 20));

      const writes = [];
      for (let seq = 0; seq < 100; seq += 1) {
        const started = Date.now();
        writes.push(
          sessionStore.writeChunk(live.id, chunkPayload(seq, 32)).then((result) => ({
            result,
            waitMs: Date.now() - started
          }))
        );
      }
      const finished = await Promise.all(writes);
      const retention = await retentionP;

      assert.equal(retention.error, undefined, retention.error);
      for (const row of finished) {
        assert.equal(row.result.error, undefined, row.result.error);
        assert.ok(row.result.chunkId);
        assert.ok(
          row.waitMs < sessionStore.RETENTION_YIELD_BUDGET_MS,
          `write wait ${row.waitMs}ms exceeded ${sessionStore.RETENTION_YIELD_BUDGET_MS}ms`
        );
      }
      const stored = await sessionStore.getChunksForSession(live.id);
      assert.equal(stored.chunks.length, 100);
      assert.deepEqual(
        stored.chunks.map((chunk) => chunk.seq),
        Array.from({ length: 100 }, (_, i) => i)
      );
    }
  );

  it('idempotent rewrite of (sessionId, seq) is a success and leaves one row', async () => {
    const session = await sessionStore.createSession();
    const payload = chunkPayload(0, 128);
    const first = await sessionStore.writeChunk(session.id, payload);
    assert.ok(first.chunkId, first.error);
    const second = await sessionStore.writeChunk(session.id, payload);
    assert.equal(second.error, undefined, second.error);
    assert.equal(second.chunkId, first.chunkId);
    const listed = await sessionStore.getChunksForSession(session.id);
    assert.equal(listed.chunks.length, 1);
    assert.equal(listed.chunks[0].seq, 0);
    const sessionRow = await sessionStore.getSession(session.id);
    assert.equal(sessionRow.chunkCount, 1);
    assert.equal(sessionRow.sizeBytes, 128);
  });

  it('getChunkCoverage reports gaps and savedDurationMs for only saved chunks', async () => {
    const session = await sessionStore.createSession();
    const present = [0, 1, 2, 3, 5, 6, 8, 9];
    for (const seq of present) {
      const written = await sessionStore.writeChunk(session.id, chunkPayload(seq, 16));
      assert.ok(written.chunkId, written.error);
    }
    const lost = await sessionStore.recordChunkLost(session.id, {
      seq: 4,
      startMs: 16_000,
      endMs: 20_000,
      reason: 'quota_exceeded'
    });
    assert.equal(lost.recorded, true);

    const coverage = await sessionStore.getChunkCoverage(session.id);
    assert.equal(coverage.error, undefined, coverage.error);
    assert.equal(coverage.expectedFirstSeq, 0);
    assert.equal(coverage.lastSeq, 9);
    assert.equal(coverage.savedCount, 8);
    assert.deepEqual(coverage.missingSeqs, [4, 7]);
    assert.equal(coverage.savedDurationMs, 8 * 4000);
    assert.equal(coverage.lostChunks.length, 1);
    assert.equal(coverage.lostChunks[0].seq, 4);
    assert.equal(coverage.lostChunks[0].reason, 'quota_exceeded');
  });

  it('injected log-write failure increments logWriteFailures', async () => {
    const session = await sessionStore.createSession();
    const before = await sessionStore.getStorageStats();
    assert.equal(before.logWriteFailures, 0);

    sessionStore.setLogWriteFailureForTests(true);
    const failed = await sessionStore.log('session-store', 'error', 'boom', {
      sessionId: session.id
    });
    assert.ok(failed.error);
    sessionStore.setLogWriteFailureForTests(false);

    const after = await sessionStore.getStorageStats();
    assert.ok(after.logWriteFailures >= 1);
    const queried = await sessionStore.queryLogs({ sessionId: session.id });
    assert.equal(queried.total, 0);
  });
});
