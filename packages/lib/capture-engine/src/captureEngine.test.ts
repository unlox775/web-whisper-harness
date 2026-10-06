import assert from 'node:assert/strict';
import { afterEach, before, describe, it } from 'node:test';
import type { CaptureHandle, CaptureErrorEvent, AudioStalledEvent, AudioResumedEvent } from './types.js';
import type { StoreWriteFailedDetails } from './types.js';

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

function storeError(event: CaptureErrorEvent): string | undefined {
  if (typeof event.details === 'string') return event.details;
  return event.details?.error;
}

describe('resilient persist queue', () => {
  it('keeps persisting after one failed writeChunk', async () => {
    const persisted: number[] = [];
    let writeCalls = 0;
    setSessionStoreForTests({
      writeChunk: async (_sessionId, chunk) => {
        writeCalls += 1;
        if (writeCalls === 1) {
          return { error: 'quota_exceeded' };
        }
        persisted.push(chunk.seq);
        return { chunkId: `chunk-${chunk.seq}` };
      },
    });

    const handle = await startPersistCapture();
    const errors: CaptureErrorEvent[] = [];
    handle.on('captureError', (event) => errors.push(event));

    pushPcm(1024);
    pushPcm(1024);
    await handle.flushPending();

    assert.equal(writeCalls >= 2, true, 'second writeChunk must still run');
    assert.deepEqual(persisted, [1]);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].reason, 'store_write_failed');
    assert.equal(storeError(errors[0]), 'quota_exceeded');
  });

  it('continues the queue when writeChunk throws (rejected-chain hypothesis)', async () => {
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
    const errors: CaptureErrorEvent[] = [];
    handle.on('captureError', (event) => errors.push(event));

    pushPcm(1024);
    pushPcm(1024);
    await flushPending();

    assert.equal(writeCalls >= 2, true);
    assert.deepEqual(persisted, [1]);
    assert.equal(errors[0]?.reason, 'store_write_failed');
    assert.equal(storeError(errors[0]), 'indexeddb died');
  });

  it('retries transaction_conflict once then persists', async () => {
    let writeCalls = 0;
    const persisted: number[] = [];
    setSessionStoreForTests({
      writeChunk: async (_sessionId, chunk) => {
        writeCalls += 1;
        if (writeCalls === 1) {
          return { error: 'transaction_conflict', sessionId: 'x' };
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
    assert.equal(writeCalls, 2, 'conflict must retry once');
    assert.equal(errors.length, 0, 'successful retry must not emit store_write_failed');
  });

  it('emits retried store_write_failed after a second conflict and continues', async () => {
    let writeCalls = 0;
    const persisted: number[] = [];
    setSessionStoreForTests({
      writeChunk: async (_sessionId, chunk) => {
        writeCalls += 1;
        if (chunk.seq === 0) {
          return { error: 'transaction_conflict' };
        }
        persisted.push(chunk.seq);
        return { chunkId: `chunk-${chunk.seq}` };
      },
    });

    const handle = await startPersistCapture();
    const errors: CaptureErrorEvent[] = [];
    handle.on('captureError', (event) => errors.push(event));

    pushPcm(1024);
    pushPcm(1024);
    await handle.flushPending();

    assert.equal(writeCalls >= 3, true, 'seq 0 retries once (2 calls) then seq 1 writes');
    assert.deepEqual(persisted, [1]);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].reason, 'store_write_failed');
    assert.equal(storeError(errors[0]), 'transaction_conflict');
    assert.equal((errors[0].details as StoreWriteFailedDetails).retried, true);
  });

  it('flushPending / whenPersistIdle resolve immediately when not capturing', async () => {
    await flushPending();
    await whenPersistIdle();
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
