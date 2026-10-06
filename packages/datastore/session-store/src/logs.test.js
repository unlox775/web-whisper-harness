import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import * as sessionStore from './index.js';

let dbSeq = 0;

async function openFreshDb() {
  dbSeq += 1;
  sessionStore.closeDatabase();
  sessionStore.resetLoggerConfig();
  await sessionStore.init({ databaseName: `web-whisper-logs-test-${dbSeq}` });
}

describe('durable per-package logging', () => {
  beforeEach(async () => {
    await openFreshDb();
  });

  afterEach(() => {
    sessionStore.resetLoggerConfig();
    sessionStore.closeDatabase();
  });

  it('does not invoke a lazy payload when there is no active session', async () => {
    let invoked = 0;
    const result = await sessionStore.log('web-whisper-pwa', 'error', () => {
      invoked += 1;
      return { message: 'must not run', details: { expensive: true } };
    });
    assert.deepEqual(result, { skipped: true, reason: 'no_active_session' });
    assert.equal(invoked, 0);
  });

  it('does not invoke a lazy payload when the package level gates the call', async () => {
    const created = await sessionStore.createSession();
    sessionStore.configureLogger({
      levels: { 'capture-engine': 'info' },
      activeSessionId: created.id
    });
    let invoked = 0;
    const result = await sessionStore.log('capture-engine', 'debug', () => {
      invoked += 1;
      return 'debug details are expensive';
    });
    assert.deepEqual(result, { skipped: true, reason: 'gated_level' });
    assert.equal(invoked, 0);

    sessionStore.configureLogger({ levels: { 'capture-engine': 'off' } });
    const offResult = await sessionStore.log('capture-engine', 'error', () => {
      invoked += 1;
      return 'still gated';
    });
    assert.deepEqual(offResult, { skipped: true, reason: 'gated_level' });
    assert.equal(invoked, 0);
  });

  it('persists after both gates pass and honors explicit sessionId after active is cleared', async () => {
    const created = await sessionStore.createSession();
    sessionStore.configureLogger({
      levels: { 'session-store': 'debug' },
      activeSessionId: created.id
    });

    const written = await sessionStore.log('session-store', 'info', () => ({
      message: 'chunk persist ok',
      details: { seq: 0 }
    }));
    assert.equal(written.written, true);
    assert.ok(written.id);

    sessionStore.configureLogger({ activeSessionId: null });
    const afterClear = await sessionStore.log(
      'transcription-client',
      'warn',
      'post-stop transcribe',
      { sessionId: created.id }
    );
    assert.equal(afterClear.written, true);

    const queried = await sessionStore.queryLogs({ sessionId: created.id });
    assert.equal(queried.error, undefined);
    assert.equal(queried.total, 2);
    const storeRow = queried.logs.find((row) => row.packageId === 'session-store');
    const txRow = queried.logs.find((row) => row.packageId === 'transcription-client');
    assert.ok(storeRow);
    assert.equal(storeRow.message, 'chunk persist ok');
    assert.deepEqual(storeRow.details, { seq: 0 });
    assert.ok(storeRow.sizeBytes > 0);
    assert.ok(storeRow.createdAt);
    assert.ok(txRow);
    assert.equal(txRow.level, 'warn');
  });

  it('defaults package level to info and allows unknown package ids', async () => {
    const created = await sessionStore.createSession();
    sessionStore.configureLogger({ activeSessionId: created.id });

    const debug = await sessionStore.log('future-package', 'debug', 'nope');
    assert.deepEqual(debug, { skipped: true, reason: 'gated_level' });

    const info = await sessionStore.log('future-package', 'info', 'forward compatible');
    assert.equal(info.written, true);

    const queried = await sessionStore.queryLogs({ packageId: 'future-package' });
    assert.equal(queried.total, 1);
    assert.equal(queried.logs[0].packageId, 'future-package');
  });

  it('queryLogs filters by minLevel, range, and pagination', async () => {
    const created = await sessionStore.createSession();
    await sessionStore.putLogRecord({
      id: 'log_d',
      sessionId: created.id,
      packageId: 'web-whisper-pwa',
      level: 'debug',
      message: 'd',
      createdAt: '2026-10-01T00:00:00.000Z',
      sizeBytes: 8
    });
    await sessionStore.putLogRecord({
      id: 'log_i',
      sessionId: created.id,
      packageId: 'web-whisper-pwa',
      level: 'info',
      message: 'i',
      createdAt: '2026-10-01T00:01:00.000Z',
      sizeBytes: 8
    });
    await sessionStore.putLogRecord({
      id: 'log_e',
      sessionId: created.id,
      packageId: 'web-whisper-pwa',
      level: 'error',
      message: 'e',
      createdAt: '2026-10-01T00:02:00.000Z',
      sizeBytes: 8
    });

    const errors = await sessionStore.queryLogs({
      sessionId: created.id,
      minLevel: 'error'
    });
    assert.equal(errors.total, 1);
    assert.equal(errors.logs[0].level, 'error');

    const page = await sessionStore.queryLogs({
      sessionId: created.id,
      limit: 1,
      offset: 1
    });
    assert.equal(page.total, 3);
    assert.equal(page.logs.length, 1);
    assert.equal(page.logs[0].message, 'i');

    const ranged = await sessionStore.queryLogs({
      sessionId: created.id,
      from: '2026-10-01T00:01:00.000Z',
      to: '2026-10-01T00:02:00.000Z'
    });
    assert.equal(ranged.total, 1);
    assert.equal(ranged.logs[0].message, 'i');
  });

  it('getLogByteSizes and getStorageStats include log bytes in usedBytes', async () => {
    const created = await sessionStore.createSession();
    sessionStore.configureLogger({
      levels: { 'playback-engine': 'debug' },
      activeSessionId: created.id
    });
    await sessionStore.log('playback-engine', 'info', 'play start');
    await sessionStore.log('playback-engine', 'warn', 'underrun');

    const sizes = await sessionStore.getLogByteSizes();
    assert.ok(sizes.logEntryCount === 2);
    assert.ok(sizes.logBytes > 0);
    assert.ok(sizes.byPackage['playback-engine'].count === 2);
    assert.ok(sizes.byPackage['playback-engine'].bytes > 0);

    const stats = await sessionStore.getStorageStats();
    assert.equal(stats.logEntryCount, 2);
    assert.ok(stats.logBytes > 0);
    assert.ok(stats.usedBytes >= stats.logBytes);
    assert.equal(stats.logBytesByPackage['playback-engine'].count, 2);
  });

  it('deleteSession cascade-deletes that session’s log rows', async () => {
    const keep = await sessionStore.createSession();
    const drop = await sessionStore.createSession();
    sessionStore.configureLogger({
      levels: { 'volume-analyzer': 'debug' },
      activeSessionId: drop.id
    });
    await sessionStore.log('volume-analyzer', 'info', 'drop me');
    await sessionStore.log('volume-analyzer', 'info', 'keep me', { sessionId: keep.id });

    const deleted = await sessionStore.deleteSession(drop.id);
    assert.equal(deleted.deleted, true);

    const leftover = await sessionStore.queryLogs();
    assert.equal(leftover.total, 1);
    assert.equal(leftover.logs[0].sessionId, keep.id);
    assert.equal(leftover.logs[0].message, 'keep me');
  });

  it('exports PACKAGE_IDS frozen list and MAX_LOG_AGE_MS of 14 days', async () => {
    assert.deepEqual(sessionStore.PACKAGE_IDS, [
      'session-store',
      'capture-engine',
      'volume-analyzer',
      'transcription-client',
      'playback-engine',
      'web-whisper-pwa'
    ]);
    assert.equal(sessionStore.MAX_LOG_AGE_MS, 14 * 24 * 60 * 60 * 1000);
    assert.ok(Object.isFrozen(sessionStore.PACKAGE_IDS));
  });
});
