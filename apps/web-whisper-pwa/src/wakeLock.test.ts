import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  formatWakeLockStatus,
  getWakeLockDebugState,
  initializeRecordingWakeLock,
  isIosWakeLockUnreliable,
  setRecordingWakeLockActive,
  setWakeLockEnvForTests,
  setWakeLockLogger,
  type WakeLockVideoLike,
} from './wakeLock.ts';

type FakeSentinel = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: string, listener: () => void) => void;
  fireRelease: () => void;
};

type LogRow = { level: string; message: string; details?: Record<string, unknown> };

function createFakeVideo(opts?: { play?: () => Promise<void> | void }): WakeLockVideoLike & {
  playCalls: number;
  pauseCalls: number;
  attrs: Record<string, string>;
} {
  const video: WakeLockVideoLike & {
    playCalls: number;
    pauseCalls: number;
    attrs: Record<string, string>;
  } = {
    muted: false,
    defaultMuted: false,
    volume: 1,
    loop: false,
    playsInline: false,
    paused: true,
    src: '',
    playCalls: 0,
    pauseCalls: 0,
    attrs: {},
    style: {},
    setAttribute(name: string, value: string) {
      video.attrs[name] = value;
    },
    play: opts?.play
      ? async () => {
          video.playCalls += 1;
          await opts.play?.();
          video.paused = false;
        }
      : async () => {
          video.playCalls += 1;
          video.paused = false;
        },
    pause() {
      video.pauseCalls += 1;
      video.paused = true;
    },
    remove() {
      video.paused = true;
    },
  };
  return video;
}

function createEnv(opts?: {
  available?: boolean;
  visible?: boolean;
  userAgent?: string;
  standalone?: boolean;
  platform?: string;
  maxTouchPoints?: number;
  request?: (type: 'screen') => Promise<FakeSentinel>;
  video?: ReturnType<typeof createFakeVideo>;
}) {
  const available = opts?.available ?? true;
  let visibilityState = opts?.visible === false ? 'hidden' : 'visible';
  const listeners = new Map<string, Array<() => void>>();
  const windowListeners = new Map<string, Array<() => void>>();
  const sentinels: FakeSentinel[] = [];
  const requestCalls: string[] = [];
  const videos: Array<ReturnType<typeof createFakeVideo>> = [];
  const appended: WakeLockVideoLike[] = [];

  const env = {
    navigator: {
      userAgent: opts?.userAgent ?? 'test',
      platform: opts?.platform ?? 'Linux',
      maxTouchPoints: opts?.maxTouchPoints ?? 0,
      standalone: opts?.standalone,
      ...(available
        ? {
            wakeLock: {
              request: async (type: 'screen') => {
                requestCalls.push(type);
                if (opts?.request) {
                  const sentinel = await opts.request(type);
                  sentinels.push(sentinel);
                  return sentinel;
                }
                const releaseListeners: Array<() => void> = [];
                const sentinel: FakeSentinel = {
                  released: false,
                  release: async () => {
                    sentinel.released = true;
                    for (const listener of releaseListeners) listener();
                  },
                  addEventListener: (_type: string, listener: () => void) => {
                    releaseListeners.push(listener);
                  },
                  fireRelease: () => {
                    sentinel.released = true;
                    for (const listener of releaseListeners) listener();
                  },
                };
                sentinels.push(sentinel);
                return sentinel;
              },
            },
          }
        : {}),
    },
    document: {
      get visibilityState() {
        return visibilityState;
      },
      body: {
        appendChild(el: WakeLockVideoLike) {
          appended.push(el);
        },
      },
      addEventListener: (type: string, listener: () => void) => {
        const list = listeners.get(type) ?? [];
        list.push(listener);
        listeners.set(type, list);
      },
      createElement: (_tag: 'video') => {
        const video = opts?.video ?? createFakeVideo();
        videos.push(video);
        return video;
      },
    },
    window: {
      addEventListener: (type: string, listener: () => void) => {
        const list = windowListeners.get(type) ?? [];
        list.push(listener);
        windowListeners.set(type, list);
      },
    },
    requestCalls,
    sentinels,
    videos,
    appended,
    setVisible(next: boolean) {
      visibilityState = next ? 'visible' : 'hidden';
      for (const listener of listeners.get('visibilitychange') ?? []) listener();
    },
    setVisibilityQuietly(next: boolean) {
      visibilityState = next ? 'visible' : 'hidden';
    },
    firePageShow() {
      for (const listener of windowListeners.get('pageshow') ?? []) listener();
      for (const listener of listeners.get('pageshow') ?? []) listener();
    },
  };
  return env;
}

describe('recording wake lock', () => {
  const logs: LogRow[] = [];

  beforeEach(() => {
    logs.length = 0;
    setWakeLockEnvForTests(null);
    setWakeLockLogger((level, payload) => {
      const resolved = payload();
      logs.push({ level, message: resolved.message, details: resolved.details });
    });
  });

  afterEach(() => {
    setWakeLockLogger(null);
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
    assert.equal(formatWakeLockStatus(), 'Screen awake · wake lock');
    assert.equal(logs.some((row) => row.level === 'info' && row.message === 'wake lock acquired'), true);

    await setRecordingWakeLockActive(false, 'stop-recording');
    assert.equal(env.sentinels[0]?.released, true);
    assert.equal(getWakeLockDebugState().desiredActive, false);
    assert.equal(getWakeLockDebugState().hasSentinel, false);
    assert.equal(logs.some((row) => row.level === 'info' && row.message === 'wake lock released'), true);
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

  it('re-requests the lock on pageshow while still recording', async () => {
    const env = createEnv({ visible: false });
    setWakeLockEnvForTests(env);
    initializeRecordingWakeLock();

    await setRecordingWakeLockActive(true, 'start-recording');
    assert.equal(env.requestCalls.length, 0);

    env.setVisibilityQuietly(true);
    env.firePageShow();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(env.requestCalls.length, 1);
    assert.equal(getWakeLockDebugState().hasSentinel, true);
  });

  it('does not throw when Wake Lock API is missing and uses the video fallback', async () => {
    const env = createEnv({ available: false });
    setWakeLockEnvForTests(env);
    initializeRecordingWakeLock();
    await setRecordingWakeLockActive(true, 'start-recording');
    assert.equal(getWakeLockDebugState().desiredActive, true);
    assert.equal(getWakeLockDebugState().hasSentinel, false);
    assert.equal(getWakeLockDebugState().videoPlaying, true);
    assert.equal(getWakeLockDebugState().method, 'video');
    assert.equal(env.videos[0]?.muted, true);
    assert.equal(env.videos[0]?.loop, true);
    assert.equal(env.videos[0]?.attrs.playsinline, 'true');
    assert.equal(env.videos[0]?.attrs['webkit-playsinline'], 'true');
    assert.equal(env.videos[0]?.volume, 0);
    assert.equal(logs.some((row) => row.message === 'wake lock unavailable'), true);
    assert.equal(logs.some((row) => row.message === 'wake lock acquired' && row.details?.method === 'video'), true);
    await setRecordingWakeLockActive(false, 'stop-recording');
    assert.equal(getWakeLockDebugState().desiredActive, false);
    assert.equal(getWakeLockDebugState().videoPlaying, false);
    assert.ok((env.videos[0]?.pauseCalls ?? 0) >= 1);
  });

  it('starts the video fallback in the same turn as the Record tap', async () => {
    let playCalls = 0;
    const video = createFakeVideo({
      play: () => {
        playCalls += 1;
      },
    });
    const env = createEnv({ available: false, video });
    setWakeLockEnvForTests(env);
    initializeRecordingWakeLock();
    const pending = setRecordingWakeLockActive(true, 'start-recording');
    assert.equal(playCalls, 1);
    await pending;
    assert.equal(getWakeLockDebugState().videoPlaying, true);
  });

  it('uses video fallback on iOS even when Wake Lock API exists', async () => {
    const env = createEnv({
      available: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    });
    setWakeLockEnvForTests(env);
    initializeRecordingWakeLock();
    await setRecordingWakeLockActive(true, 'start-recording');
    assert.equal(getWakeLockDebugState().hasSentinel, true);
    assert.equal(getWakeLockDebugState().videoPlaying, true);
    assert.equal(getWakeLockDebugState().method, 'wake-lock+video');
    assert.equal(formatWakeLockStatus(), 'Screen awake · wake lock + video');
    assert.equal(env.videos[0]?.muted, true);
    assert.equal(env.videos[0]?.attrs.playsinline, 'true');
  });

  it('starts video fallback when a wake lock request fails', async () => {
    const env = createEnv({
      available: true,
      request: async () => {
        throw new Error('NotAllowedError');
      },
    });
    setWakeLockEnvForTests(env);
    initializeRecordingWakeLock();
    await setRecordingWakeLockActive(true, 'start-recording');
    assert.equal(getWakeLockDebugState().hasSentinel, false);
    assert.equal(getWakeLockDebugState().videoPlaying, true);
    assert.equal(logs.some((row) => row.message === 'wake lock request failed'), true);
    assert.equal(getWakeLockDebugState().method, 'video');
  });

  it('logs a failure when neither wake lock nor video can start', async () => {
    const video = createFakeVideo({
      play: async () => {
        throw new Error('NotAllowedError');
      },
    });
    const env = createEnv({ available: false, video });
    setWakeLockEnvForTests(env);
    initializeRecordingWakeLock();
    await setRecordingWakeLockActive(true, 'start-recording');
    assert.equal(getWakeLockDebugState().method, 'none');
    assert.equal(formatWakeLockStatus(), 'Screen may sleep');
    assert.equal(logs.some((row) => row.level === 'warn' && row.message === 'wake lock acquire failed'), true);
  });

  it('detects iOS standalone / iPhone UA as an unreliable wake-lock environment', () => {
    assert.equal(isIosWakeLockUnreliable({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X)' }), true);
    assert.equal(isIosWakeLockUnreliable({ userAgent: 'Safari', standalone: true }), true);
    assert.equal(isIosWakeLockUnreliable({ userAgent: 'Mozilla/5.0', platform: 'MacIntel', maxTouchPoints: 5 }), true);
    assert.equal(isIosWakeLockUnreliable({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }), false);
  });

  it('resumes the video fallback when the page becomes visible again', async () => {
    const env = createEnv({ available: false });
    setWakeLockEnvForTests(env);
    initializeRecordingWakeLock();
    await setRecordingWakeLockActive(true, 'start-recording');
    const playsBefore = env.videos[0]?.playCalls ?? 0;
    if (env.videos[0]) env.videos[0].paused = true;
    env.setVisible(false);
    env.setVisible(true);
    await Promise.resolve();
    await Promise.resolve();
    assert.ok((env.videos[0]?.playCalls ?? 0) > playsBefore);
    assert.equal(env.videos[0]?.paused, false);
    assert.equal(getWakeLockDebugState().videoPlaying, true);
  });

  it('does not pause or touch a MediaStream — video stays muted with no audio track', async () => {
    const env = createEnv({ available: false });
    setWakeLockEnvForTests(env);
    await setRecordingWakeLockActive(true, 'start-recording');
    const video = env.videos[0];
    assert.equal(video?.muted, true);
    assert.equal(video?.volume, 0);
    assert.equal(video?.src.startsWith('data:video/mp4;base64,'), true);
  });
});
