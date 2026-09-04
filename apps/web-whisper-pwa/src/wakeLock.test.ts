import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  getWakeLockDebugState,
  initializeRecordingWakeLock,
  setRecordingWakeLockActive,
  setWakeLockEnvForTests,
} from './wakeLock.ts';

type FakeSentinel = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: string, listener: () => void) => void;
};

function createEnv(opts?: { available?: boolean; visible?: boolean }) {
  const available = opts?.available ?? true;
  let visibilityState = opts?.visible === false ? 'hidden' : 'visible';
  const listeners = new Map<string, Array<() => void>>();
  const sentinels: FakeSentinel[] = [];
  const requestCalls: string[] = [];

  const env = {
    navigator: available
      ? {
          userAgent: 'test',
          wakeLock: {
            request: async (type: 'screen') => {
              requestCalls.push(type);
              const sentinel: FakeSentinel = {
                released: false,
                release: async () => {
                  sentinel.released = true;
                },
                addEventListener: () => undefined,
              };
              sentinels.push(sentinel);
              return sentinel;
            },
          },
        }
      : { userAgent: 'test' },
    document: {
      get visibilityState() {
        return visibilityState;
      },
      addEventListener: (type: string, listener: () => void) => {
        const list = listeners.get(type) ?? [];
        list.push(listener);
        listeners.set(type, list);
      },
    },
    requestCalls,
    sentinels,
    setVisible(next: boolean) {
      visibilityState = next ? 'visible' : 'hidden';
      for (const listener of listeners.get('visibilitychange') ?? []) listener();
    },
  };
  return env;
}

describe('recording wake lock', () => {
  beforeEach(() => {
    setWakeLockEnvForTests(null);
  });

  afterEach(() => {
    setWakeLockEnvForTests(null);
  });

  it('acquires a screen lock while recording and releases on stop', async () => {
    const env = createEnv();
    setWakeLockEnvForTests(env);
    initializeRecordingWakeLock();

    await setRecordingWakeLockActive(true, 'start-recording');
    assert.equal(env.requestCalls.length, 1);
    assert.equal(env.requestCalls[0], 'screen');
    assert.equal(getWakeLockDebugState().desiredActive, true);
    assert.equal(getWakeLockDebugState().hasSentinel, true);
    assert.equal(env.sentinels[0]?.released, false);

    await setRecordingWakeLockActive(false, 'stop-recording');
    assert.equal(env.sentinels[0]?.released, true);
    assert.equal(getWakeLockDebugState().desiredActive, false);
    assert.equal(getWakeLockDebugState().hasSentinel, false);
  });

  it('re-requests the lock when the page becomes visible while still recording', async () => {
    const env = createEnv({ visible: false });
    setWakeLockEnvForTests(env);
    initializeRecordingWakeLock();

    await setRecordingWakeLockActive(true, 'start-recording');
    assert.equal(env.requestCalls.length, 0);
    assert.equal(getWakeLockDebugState().desiredActive, true);

    env.setVisible(true);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(env.requestCalls.length, 1);
    assert.equal(getWakeLockDebugState().hasSentinel, true);
  });

  it('does not throw when Wake Lock API is missing', async () => {
    const env = createEnv({ available: false });
    setWakeLockEnvForTests(env);
    initializeRecordingWakeLock();
    await setRecordingWakeLockActive(true, 'start-recording');
    assert.equal(getWakeLockDebugState().desiredActive, true);
    assert.equal(getWakeLockDebugState().hasSentinel, false);
    await setRecordingWakeLockActive(false, 'stop-recording');
    assert.equal(getWakeLockDebugState().desiredActive, false);
  });
});
