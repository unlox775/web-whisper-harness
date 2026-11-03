import assert from 'node:assert/strict';
import { afterEach, before, describe, it, type TestContext } from 'node:test';
import type {
  CaptureHandle,
  CaptureErrorEvent,
  AudioStalledEvent,
  AudioResumedEvent,
  ChunkLostEvent,
  FlushPendingResult,
} from './types.js';

class FakeAudioNode {
  connect(): void {}
  disconnect(): void {}
}

class FakeOscillator extends FakeAudioNode {
  type = 'sine';
  frequency = { setValueAtTime(): void {} };
  start(): void {}
  stop(): void {}
}

class FakeGain extends FakeAudioNode {
  gain = { value: 0 };
}

class FakeScriptProcessor extends FakeAudioNode {
  onaudioprocess: ((event: { inputBuffer: { getChannelData: () => Float32Array } }) => void) | null =
    null;
}

let lastProcessor: FakeScriptProcessor | null = null;
let startCapture: typeof import('./captureEngine.js').startCapture;
let setEncoderFactoryForTests: typeof import('./captureEngine.js').setEncoderFactoryForTests;
let setSessionStoreForTests: typeof import('./captureEngine.js').setSessionStoreForTests;
let flushPending: typeof import('./captureEngine.js').flushPending;
let whenPersistIdle: typeof import('./captureEngine.js').whenPersistIdle;

function installAudioMocks(): void {
  class FakeAudioContext {
    sampleRate = 44100;
    currentTime = 0;
    destination = {};

    createOscillator(): FakeOscillator {
      return new FakeOscillator();
    }

    createGain(): FakeGain {
      return new FakeGain();
    }

    createScriptProcessor(): FakeScriptProcessor {
      lastProcessor = new FakeScriptProcessor();
      return lastProcessor;
    }

    createMediaStreamSource(): FakeAudioNode {
      return new FakeAudioNode();
    }

    close(): Promise<void> {
      return Promise.resolve();
    }
  }

  (globalThis as { AudioContext?: unknown }).AudioContext = FakeAudioContext;
}

function pushPcm(sampleCount = 1024): void {
  assert.ok(lastProcessor?.onaudioprocess, 'script processor not connected');
  const data = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    data[i] = Math.sin(i / 20);
  }
  lastProcessor.onaudioprocess({
    inputBuffer: {
      getChannelData: () => data,
    },
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sessionId(label: string): string {
  return `stall-test-${label}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const activeHandles: CaptureHandle[] = [];

async function startTestCapture(options: {
  stallTimeout?: number;
  watchdogTimeout?: number;
} = {}): Promise<CaptureHandle> {
  const handle = await startCapture(sessionId('cap'), {
    audioSource: 'simulated',
    inMemory: true,
    chunkTargetDuration: 60,
    stallTimeout: options.stallTimeout ?? 0.08,
    watchdogTimeout: options.watchdogTimeout ?? 2.0,
  });
  activeHandles.push(handle);
  return handle;
}

before(async () => {
  installAudioMocks();
  ({
    startCapture,
    setEncoderFactoryForTests,
    setSessionStoreForTests,
    flushPending,
    whenPersistIdle,
  } = await import('./captureEngine.js'));
  setEncoderFactoryForTests(() => ({
    encode(): Uint8Array {
      return new Uint8Array([1, 2, 3]);
    },
    flush(): Uint8Array {
      return new Uint8Array();
    },
    createBlob(data: Uint8Array): Blob {
      return new Blob([data], { type: 'audio/mpeg' });
    },
  }));
});

afterEach(async () => {
  setSessionStoreForTests({
    writeChunk: async (_sessionId, chunk) => ({ chunkId: `teardown-${chunk.seq}` }),
    recordChunkLost: async () => ({ recorded: true }),
  });
  const handles = activeHandles.splice(0);
  await Promise.all(handles.map((handle) => handle.stop().catch(() => undefined)));
  setSessionStoreForTests(null);
});

describe('mid-stream stall detection', () => {
  it('emits audioStalled after stallTimeout and does not stop capture', async () => {
    const handle = await startTestCapture({ stallTimeout: 0.08, watchdogTimeout: 2.0 });
    const stalled: AudioStalledEvent[] = [];
    const errors: CaptureErrorEvent[] = [];
    const stopped: unknown[] = [];

    handle.on('audioStalled', (event) => stalled.push(event));
    handle.on('captureError', (event) => errors.push(event));
    handle.on('captureStopped', (event) => stopped.push(event));

    pushPcm();
    await wait(30);
    assert.equal(stalled.length, 0, 'must not stall before stallTimeout');
    assert.equal(handle.getStatus().isActive, true);

    await wait(120);
    assert.equal(stalled.length, 1);
    assert.equal(stalled[0].reason, 'mid_stream_stall');
    assert.equal(stalled[0].pcmSeen, true);
    assert.ok(stalled[0].stalledFor >= 0.08);
    assert.equal(typeof stalled[0].lastProgressAt, 'number');
    assert.ok(stalled[0].lastProgressAt > 0);
    assert.equal(handle.getStatus().isActive, true);
    assert.equal(handle.getStatus().stalled, true);
    assert.ok(handle.getStatus().stalledFor >= 0.08);
    assert.equal(stopped.length, 0);
    assert.equal(
      errors.filter((error) => error.reason === 'no_audio_received').length,
      0,
      'mid-stream stall must not reuse no_audio_received'
    );
  });

  it('emits audioResumed once when PCM returns after a stall', async () => {
    const handle = await startTestCapture({ stallTimeout: 0.08, watchdogTimeout: 2.0 });
    const resumed: AudioResumedEvent[] = [];
    const stalled: AudioStalledEvent[] = [];

    handle.on('audioStalled', (event) => stalled.push(event));
    handle.on('audioResumed', (event) => resumed.push(event));

    pushPcm();
    await wait(140);
    assert.equal(stalled.length, 1);

    pushPcm();
    assert.equal(resumed.length, 1);
    assert.ok(resumed[0].stalledFor >= 0.08);
    assert.equal(handle.getStatus().stalled, false);
    assert.equal(handle.getStatus().stalledFor, 0);
    assert.equal(handle.getStatus().isActive, true);

    pushPcm();
    pushPcm();
    assert.equal(resumed.length, 1, 'audioResumed must fire once, not on every later callback');
  });

  it('setPcmPaused ignores PCM until unpaused, then resumes once', async () => {
    const handle = await startTestCapture({ stallTimeout: 0.08, watchdogTimeout: 2.0 });
    const stalled: AudioStalledEvent[] = [];
    const resumed: AudioResumedEvent[] = [];
    handle.on('audioStalled', (event) => stalled.push(event));
    handle.on('audioResumed', (event) => resumed.push(event));

    pushPcm();
    handle.setPcmPaused(true);
    pushPcm();
    await wait(140);
    assert.equal(stalled.length, 1);
    assert.equal(handle.getStatus().isActive, true);

    handle.setPcmPaused(false);
    pushPcm();
    assert.equal(resumed.length, 1);
    assert.equal(handle.getStatus().stalled, false);
  });

  it('does not emit no_audio_received or auto-stop on mid-stream stall', async () => {
    const handle = await startTestCapture({ stallTimeout: 0.08, watchdogTimeout: 0.12 });
    const errors: CaptureErrorEvent[] = [];
    const stopped: unknown[] = [];

    handle.on('captureError', (event) => errors.push(event));
    handle.on('captureStopped', (event) => stopped.push(event));

    pushPcm();
    await wait(200);

    assert.equal(handle.getStatus().isActive, true);
    assert.equal(handle.getStatus().stalled, true);
    assert.equal(errors.length, 0);
    assert.equal(stopped.length, 0);
  });
});

describe('start watchdog isolation', () => {
  it('emits no_audio_received and auto-stops when zero audio arrives', async () => {
    const handle = await startTestCapture({ stallTimeout: 2.0, watchdogTimeout: 0.08 });
    const errors: CaptureErrorEvent[] = [];
    const stalled: AudioStalledEvent[] = [];
    const stopped: unknown[] = [];

    handle.on('captureError', (event) => errors.push(event));
    handle.on('audioStalled', (event) => stalled.push(event));
    handle.on('captureStopped', (event) => stopped.push(event));

    await wait(180);

    assert.equal(errors.length, 1);
    assert.equal(errors[0].reason, 'no_audio_received');
    assert.equal(stalled.length, 0, 'start ghost must not emit audioStalled');
    assert.equal(stopped.length, 1);
    assert.equal(handle.getStatus().isActive, false);
  });
});

async function startPersistCapture(): Promise<CaptureHandle> {
  const handle = await startCapture(sessionId('persist'), {
    audioSource: 'simulated',
    inMemory: false,
    chunkTargetDuration: 0.02,
    stallTimeout: 5.0,
    watchdogTimeout: 5.0,
  });
  activeHandles.push(handle);
  return handle;
}

async function flushMicrotasks(times = 10): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

async function advanceFakeTime(t: TestContext, ms: number): Promise<void> {
  const step = 50;
  let advanced = 0;
  while (advanced < ms) {
    const n = Math.min(step, ms - advanced);
    t.mock.timers.tick(n);
    advanced += n;
    await flushMicrotasks();
  }
}

async function settleWithFakeTime<T>(
  t: TestContext,
  promise: Promise<T>,
  maxMs = 60_000
): Promise<T> {
  let settled = false;
  let value: T | undefined;
  let error: unknown;
  const tracked = promise.then(
    (next) => {
      settled = true;
      value = next;
    },
    (err) => {
      settled = true;
      error = err;
    }
  );
  let elapsed = 0;
  while (!settled && elapsed < maxMs) {
    t.mock.timers.tick(250);
    elapsed += 250;
    await flushMicrotasks();
  }
  if (!settled) {
    throw new Error(`promise did not settle after ${maxMs}ms of fake time`);
  }
  if (error) throw error;
  await tracked;
  return value as T;
}

describe('resilient persist queue', () => {
  it('holds a permanent first-write loss and still persists later seqs', async () => {
    const persisted: number[] = [];
    const lostRecords: Array<{ seq: number }> = [];
    setSessionStoreForTests({
      writeChunk: async (_sessionId, chunk) => {
        if (chunk.seq === 0) {
          return { error: 'quota_exceeded', class: 'permanent' };
        }
        persisted.push(chunk.seq);
        return { chunkId: `chunk-${chunk.seq}` };
      },
      recordChunkLost: async (_sessionId, loss) => {
        lostRecords.push({ seq: loss.seq });
        return { recorded: true };
      },
    });

    const handle = await startPersistCapture();
    const lost: ChunkLostEvent[] = [];
    handle.on('chunk_lost', (event) => lost.push(event));

    pushPcm(1024);
    pushPcm(1024);
    const result = await handle.flushPending();

    assert.deepEqual(persisted, [1]);
    assert.equal(lost.length, 1);
    assert.equal(lost[0].seq, 0);
    assert.equal(lost[0].reason, 'quota_exceeded');
    assert.deepEqual(lostRecords, [{ seq: 0 }]);
    assert.equal(result.savedCount, 1);
    assert.equal(result.lostChunks.length, 1);
  });

  it('retries a thrown writeChunk until it succeeds (no skip)', async () => {
    const persisted: number[] = [];
    let writeCalls = 0;
    setSessionStoreForTests({
      writeChunk: async (_sessionId, chunk) => {
        writeCalls += 1;
        if (writeCalls === 1) {
          throw new Error('indexeddb died');
        }
        persisted.push(chunk.seq);
        return { chunkId: `chunk-${chunk.seq}` };
      },
    });

    const handle = await startPersistCapture();
    const lost: ChunkLostEvent[] = [];
    handle.on('chunk_lost', (event) => lost.push(event));

    pushPcm(1024);
    pushPcm(1024);
    await flushPending();

    assert.equal(writeCalls >= 2, true);
    assert.deepEqual(persisted, [0, 1]);
    assert.equal(lost.length, 0);
  });

  it('retries store_busy until the write succeeds', async () => {
    let writeCalls = 0;
    const persisted: number[] = [];
    setSessionStoreForTests({
      writeChunk: async (_sessionId, chunk) => {
        writeCalls += 1;
        if (writeCalls === 1) {
          return { error: 'store_busy', class: 'transient' };
        }
        persisted.push(chunk.seq);
        return { chunkId: `chunk-${chunk.seq}` };
      },
    });

    const handle = await startPersistCapture();
    const errors: CaptureErrorEvent[] = [];
    handle.on('captureError', (event) => errors.push(event));

    pushPcm(1024);
    await handle.whenPersistIdle();

    assert.equal(persisted[0], 0);
    assert.equal(writeCalls >= 2, true);
    assert.equal(
      errors.filter((event) => event.reason === 'store_write_failed').length,
      0,
      'successful retry must not emit store_write_failed as a loss signal'
    );
  });

  it('flushPending / whenPersistIdle resolve immediately when not capturing', async () => {
    const flushed = await flushPending();
    const idle = await whenPersistIdle();
    assert.deepEqual(flushed, { savedCount: 0, lostChunks: [] });
    assert.deepEqual(idle, { savedCount: 0, lostChunks: [] });
  });

  it('stop waits for persist idle before returning', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writesFinished = 0;
    setSessionStoreForTests({
      writeChunk: async () => {
        await gate;
        writesFinished += 1;
        return { chunkId: 'late' };
      },
    });

    const handle = await startPersistCapture();
    pushPcm(1024);
    const stopping = handle.stop();
    await wait(20);
    assert.equal(writesFinished, 0, 'stop must not resolve before writeChunk settles');
    release();
    await stopping;
    assert.equal(writesFinished >= 1, true);
  });
});

describe('never-drop encoded chunks', () => {
  it('stores every seq in order after 3s of transient rejects while chunks arrive every 4s', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_000_000 });
    const started = Date.now();
    const persisted: number[] = [];
    setSessionStoreForTests({
      writeChunk: async (_sessionId, chunk) => {
        if (Date.now() - started < 3_000) {
          return { error: 'store_busy', class: 'transient' };
        }
        persisted.push(chunk.seq);
        return { chunkId: `chunk-${chunk.seq}` };
      },
    });

    const handle = await startPersistCapture();
    const lost: ChunkLostEvent[] = [];
    const errors: CaptureErrorEvent[] = [];
    handle.on('chunk_lost', (event) => lost.push(event));
    handle.on('captureError', (event) => errors.push(event));

    pushPcm(1024);
    await flushMicrotasks();
    await advanceFakeTime(t, 4_000);
    pushPcm(1024);
    await flushMicrotasks();
    await advanceFakeTime(t, 4_000);
    pushPcm(1024);
    await flushMicrotasks();

    const result = await settleWithFakeTime(t, handle.flushPending());
    assert.deepEqual(persisted, [0, 1, 2]);
    assert.equal(lost.length, 0);
    assert.equal(
      errors.filter((event) => event.reason === 'store_write_failed').length,
      0
    );
    assert.equal(result.savedCount, 3);
    assert.equal(result.lostChunks.length, 0);
    await settleWithFakeTime(t, handle.stop());
  });

  it('saves a chunk after 40s of transient rejects and does not skip later seqs', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 2_000_000 });
    const started = Date.now();
    const persisted: number[] = [];
    setSessionStoreForTests({
      writeChunk: async (_sessionId, chunk) => {
        if (chunk.seq === 0 && Date.now() - started < 40_000) {
          return { error: 'store_busy', class: 'transient' };
        }
        persisted.push(chunk.seq);
        return { chunkId: `chunk-${chunk.seq}` };
      },
    });

    const handle = await startPersistCapture();
    const lost: ChunkLostEvent[] = [];
    handle.on('chunk_lost', (event) => lost.push(event));

    pushPcm(1024);
    await flushMicrotasks();
    await advanceFakeTime(t, 4_000);
    pushPcm(1024);
    await flushMicrotasks();
    await advanceFakeTime(t, 4_000);
    pushPcm(1024);
    await flushMicrotasks();

    const result = await settleWithFakeTime(t, handle.flushPending(), 80_000);
    assert.deepEqual(persisted, [0, 1, 2]);
    assert.equal(lost.length, 0);
    assert.equal(result.savedCount, 3);
    await settleWithFakeTime(t, handle.stop());
  });

  it('emits chunk_lost for a permanent error on seq 5 and continues later seqs', async () => {
    const persisted: number[] = [];
    const times = new Map<number, { startTime: number; endTime: number }>();
    const recorded: Array<{ seq: number; startMs: number; endMs: number; reason: string }> = [];
    setSessionStoreForTests({
      writeChunk: async (_sessionId, chunk) => {
        times.set(chunk.seq, { startTime: chunk.startTime, endTime: chunk.endTime });
        if (chunk.seq === 5) {
          return { error: 'quota_exceeded', class: 'permanent' };
        }
        persisted.push(chunk.seq);
        return { chunkId: `chunk-${chunk.seq}` };
      },
      recordChunkLost: async (_sessionId, loss) => {
        recorded.push(loss);
        return { recorded: true };
      },
    });

    const handle = await startPersistCapture();
    const lost: ChunkLostEvent[] = [];
    handle.on('chunk_lost', (event) => lost.push(event));

    for (let i = 0; i < 8; i++) {
      pushPcm(1024);
    }
    const result: FlushPendingResult = await handle.flushPending();

    assert.deepEqual(persisted, [0, 1, 2, 3, 4, 6, 7]);
    assert.equal(lost.length, 1);
    assert.equal(lost[0].seq, 5);
    const expected = times.get(5);
    assert.ok(expected);
    assert.equal(lost[0].startMs, Math.round(expected.startTime * 1000));
    assert.equal(lost[0].endMs, Math.round(expected.endTime * 1000));
    assert.equal(lost[0].reason, 'quota_exceeded');
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].seq, 5);
    assert.equal(recorded[0].startMs, lost[0].startMs);
    assert.equal(recorded[0].endMs, lost[0].endMs);
    assert.equal(recorded[0].reason, 'quota_exceeded');
    assert.equal(result.savedCount, 7);
    assert.equal(result.lostChunks.length, 1);
    assert.equal(result.lostChunks[0].seq, 5);
  });

  it('flushPending with one lost chunk resolves lostChunks.length === 1', async () => {
    setSessionStoreForTests({
      writeChunk: async (_sessionId, chunk) => {
        if (chunk.seq === 0) {
          return { error: 'database_unavailable', class: 'permanent' };
        }
        return { chunkId: `chunk-${chunk.seq}` };
      },
      recordChunkLost: async () => ({ recorded: true }),
    });

    const handle = await startPersistCapture();
    pushPcm(1024);
    pushPcm(1024);
    const result = await handle.flushPending();
    assert.equal(result.savedCount, 1);
    assert.equal(result.lostChunks.length, 1);
    assert.equal(result.lostChunks[0].seq, 0);
    assert.equal(result.lostChunks[0].reason, 'database_unavailable');
  });
});
