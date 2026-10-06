import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createRetentionGate,
  enforceRetentionAfterPersistIdle,
} from './retentionAfterIdle.ts';

describe('enforceRetentionAfterPersistIdle', () => {
  it('does not invoke retention until flushPending resolves', async () => {
    let resolveFlush: () => void = () => {};
    let flushStarted = false;
    const flushPending = () => {
      flushStarted = true;
      return new Promise<void>((resolve) => {
        resolveFlush = resolve;
      });
    };
    const order: string[] = [];
    let retained = false;
    const enforceRetentionPolicy = async () => {
      retained = true;
      order.push('retain');
      return { deletedSessions: 0, reclaimedBytes: 0, newUsedBytes: 0 };
    };

    const done = enforceRetentionAfterPersistIdle({
      capBytes: 1024,
      flushPending: async () => {
        order.push('flush');
        await flushPending();
      },
      enforceRetentionPolicy,
    });

    await Promise.resolve();
    assert.equal(flushStarted, true);
    assert.equal(retained, false);
    assert.deepEqual(order, ['flush']);

    resolveFlush();
    await done;
    assert.equal(retained, true);
    assert.deepEqual(order, ['flush', 'retain']);
  });

  it('does not start retention if flushPending is still pending (no Promise.all)', async () => {
    const events: string[] = [];
    let releaseFlush: () => void = () => {};
    const flushPending = () =>
      new Promise<void>((resolve) => {
        events.push('flush-start');
        releaseFlush = () => {
          events.push('flush-end');
          resolve();
        };
      });
    const enforceRetentionPolicy = async () => {
      events.push('retain');
      return { deletedSessions: 1, reclaimedBytes: 10, newUsedBytes: 0 };
    };

    const pending = enforceRetentionAfterPersistIdle({
      capBytes: 1,
      flushPending,
      enforceRetentionPolicy,
    });
    await Promise.resolve();
    assert.deepEqual(events, ['flush-start']);
    releaseFlush();
    await pending;
    assert.deepEqual(events, ['flush-start', 'flush-end', 'retain']);
  });

  it('skips retention when flushPending rejects', async () => {
    let retained = false;
    await assert.rejects(
      () =>
        enforceRetentionAfterPersistIdle({
          capBytes: 1,
          flushPending: async () => {
            throw new Error('persist still busy');
          },
          enforceRetentionPolicy: async () => {
            retained = true;
            return { deletedSessions: 0, reclaimedBytes: 0 };
          },
        }),
      /persist still busy/
    );
    assert.equal(retained, false);
  });

  it('emits a lazy log payload only after retention finishes', async () => {
    const payloads: Array<{ message: string; details?: Record<string, unknown> }> = [];
    let built = 0;
    await enforceRetentionAfterPersistIdle({
      capBytes: 50,
      sessionId: 'ses-live',
      flushPending: async () => {},
      enforceRetentionPolicy: async () => ({
        deletedSessions: 2,
        reclaimedBytes: 4096,
        newUsedBytes: 10,
      }),
      log: (_packageId, _level, payload) => {
        built += 1;
        payloads.push(payload());
      },
    });
    assert.equal(built, 1);
    assert.deepEqual(payloads, [
      {
        message: 'retention after persist idle',
        details: { sessionId: 'ses-live', deletedSessions: 2, reclaimedBytes: 4096 },
      },
    ]);
  });
});

describe('createRetentionGate', () => {
  it('serializes overlapping retention callers', async () => {
    const gate = createRetentionGate();
    const events: string[] = [];
    let releaseFirst: () => void = () => {};
    const first = gate(async () => {
      events.push('first-start');
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      events.push('first-end');
    });
    const second = gate(async () => {
      events.push('second');
    });
    await Promise.resolve();
    assert.deepEqual(events, ['first-start']);
    releaseFirst();
    await Promise.all([first, second]);
    assert.deepEqual(events, ['first-start', 'first-end', 'second']);
  });
});
