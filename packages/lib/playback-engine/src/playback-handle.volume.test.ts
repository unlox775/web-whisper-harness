import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

class FakeGainParam {
  value = 1;
}

class FakeGainNode {
  gain = new FakeGainParam();
  connectedTo: unknown[] = [];
  connect(target: unknown) {
    this.connectedTo.push(target);
  }
  disconnect() {
    this.connectedTo = [];
  }
}

class FakeMediaElementSource {
  connectedTo: unknown[] = [];
  connect(target: unknown) {
    this.connectedTo.push(target);
  }
  disconnect() {
    this.connectedTo = [];
  }
}

class FakeAudioContext {
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  destination = { id: 'destination' };
  createGainCalls = 0;
  createMediaElementSourceCalls = 0;
  resumeCalls = 0;
  closeCalls = 0;
  gainNode = new FakeGainNode();
  mediaSource = new FakeMediaElementSource();

  createGain() {
    this.createGainCalls += 1;
    return this.gainNode;
  }

  createMediaElementSource(_element: unknown) {
    this.createMediaElementSourceCalls += 1;
    if (this.createMediaElementSourceCalls > 1) {
      throw new Error('InvalidStateError: already connected');
    }
    return this.mediaSource;
  }

  resume() {
    this.resumeCalls += 1;
    this.state = 'running';
    return Promise.resolve();
  }

  close() {
    this.closeCalls += 1;
    this.state = 'closed';
    return Promise.resolve();
  }
}

class FakeAudio {
  volume = 1;
  src = '';
  currentTime = 0;
  duration = 4;
  paused = true;
  playsInline = false;
  preload = '';
  isConnected = false;
  parentNode: { removeChild: (node: FakeAudio) => void } | null = null;
  style: Record<string, string> = {};
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  setAttribute() {}
  addEventListener(type: string, callback: (...args: unknown[]) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(callback);
  }
  removeEventListener(type: string, callback: (...args: unknown[]) => void) {
    this.listeners.get(type)?.delete(callback);
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

const contexts: FakeAudioContext[] = [];
const originalAudio = (globalThis as { Audio?: unknown }).Audio;
const originalAudioContext = (globalThis as { AudioContext?: unknown }).AudioContext;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

before(() => {
  (globalThis as { Audio: typeof FakeAudio }).Audio = FakeAudio;
  (globalThis as { AudioContext: new () => FakeAudioContext }).AudioContext = class extends FakeAudioContext {
    constructor() {
      super();
      contexts.push(this);
    }
  };
  URL.createObjectURL = () => 'blob:playback-volume-test';
  URL.revokeObjectURL = () => undefined;
});

after(() => {
  if (originalAudio) {
    (globalThis as { Audio: unknown }).Audio = originalAudio;
  } else {
    delete (globalThis as { Audio?: unknown }).Audio;
  }
  if (originalAudioContext) {
    (globalThis as { AudioContext: unknown }).AudioContext = originalAudioContext;
  } else {
    delete (globalThis as { AudioContext?: unknown }).AudioContext;
  }
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

describe('PlaybackHandleImpl.setVolume (GainNode graph)', () => {
  it('builds MediaElementSource → GainNode → destination once and writes gain', async () => {
    const { PlaybackHandleImpl } = await import('./playback-handle.js');
    const handle = new PlaybackHandleImpl(new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }));
    const ctx = contexts.at(-1);
    assert.ok(ctx, 'AudioContext should be created');
    assert.equal(ctx.createMediaElementSourceCalls, 1);
    assert.equal(ctx.createGainCalls, 1);
    assert.deepEqual(ctx.mediaSource.connectedTo, [ctx.gainNode]);
    assert.deepEqual(ctx.gainNode.connectedTo, [ctx.destination]);
    assert.equal(ctx.gainNode.gain.value, 1, 'default volume is 1');

    handle.setVolume(0.35);
    assert.equal(ctx.gainNode.gain.value, 0.35);
    handle.setVolume(1.8);
    assert.equal(ctx.gainNode.gain.value, 1);
    handle.setVolume(-0.5);
    assert.equal(ctx.gainNode.gain.value, 0);

    // Creating the source a second time would throw; setVolume must not.
    handle.setVolume(0.7);
    assert.equal(ctx.createMediaElementSourceCalls, 1);
    assert.equal(ctx.gainNode.gain.value, 0.7);

    const audio = (handle as unknown as { audio: FakeAudio }).audio;
    assert.equal(audio.volume, 1, 'element.volume stays 1 while GainNode carries level');

    await handle.start();
    assert.ok(ctx.resumeCalls >= 1, 'AudioContext must resume on play (iOS suspends contexts)');

    handle.stop();
    assert.ok(ctx.closeCalls >= 1, 'graph closes on stop/release');
  });

  it('is a no-op on a released handle', async () => {
    const { PlaybackHandleImpl } = await import('./playback-handle.js');
    const handle = new PlaybackHandleImpl(new Blob([new Uint8Array([9])], { type: 'audio/mpeg' }));
    const ctx = contexts.at(-1)!;
    handle.stop();
    handle.setVolume(0.2);
    assert.equal(ctx.gainNode.gain.value, 1);
  });
});
