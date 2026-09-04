import assert from 'node:assert/strict';
import { afterEach, before, describe, it } from 'node:test';
import type { CaptureHandle, CaptureErrorEvent, AudioStalledEvent, AudioResumedEvent } from './types.js';

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
  ({ startCapture } = await import('./captureEngine.js'));
});

afterEach(async () => {
  const handles = activeHandles.splice(0);
  await Promise.all(handles.map((handle) => handle.stop().catch(() => undefined)));
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
