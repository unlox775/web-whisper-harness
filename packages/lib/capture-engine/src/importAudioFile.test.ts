import assert from 'node:assert/strict';
import { afterEach, before, describe, it } from 'node:test';
import type { DecodedAudio, ImportProgress } from './types.js';

let importAudioFile: typeof import('./captureEngine.js').importAudioFile;
let setEncoderFactoryForTests: typeof import('./captureEngine.js').setEncoderFactoryForTests;
let setSessionStoreForTests: typeof import('./captureEngine.js').setSessionStoreForTests;
let flushPending: typeof import('./captureEngine.js').flushPending;
let CaptureError: typeof import('./captureEngine.js').CaptureError;

const encodedLengths: number[] = [];
let flushCalls = 0;

before(async () => {
  ({ importAudioFile, setEncoderFactoryForTests, setSessionStoreForTests, flushPending, CaptureError } =
    await import('./captureEngine.js'));
  setEncoderFactoryForTests(() => ({
    encode(samples: Float32Array): Uint8Array {
      encodedLengths.push(samples.length);
      return new Uint8Array([1, 2, 3, 4]);
    },
    flush(): Uint8Array {
      flushCalls += 1;
      return new Uint8Array([9]);
    },
    createBlob(data: Uint8Array): Blob {
      return new Blob([data], { type: 'audio/mpeg' });
    },
  }));
});

afterEach(() => {
  setSessionStoreForTests(null);
  encodedLengths.length = 0;
  flushCalls = 0;
});

const RATE = 1000;

function tone(seconds: number, value = 0.5): Float32Array {
  return new Float32Array(Math.round(seconds * RATE)).fill(value);
}

function decoder(decoded: DecodedAudio) {
  return async () => decoded;
}

function sid(label: string): string {
  return `import-${label}-${Math.random().toString(16).slice(2)}`;
}

type Written = { seq: number; startTime: number; endTime: number; duration: number; blob: Blob; sizeBytes: number };

describe('importAudioFile', () => {
  it('writes ~4 s MP3 chunks with contiguous seq and session times', async () => {
    const written: Written[] = [];
    setSessionStoreForTests({
      writeChunk: async (_id, chunk) => {
        written.push(chunk);
        return { chunkId: `c-${chunk.seq}` };
      },
    });
    const progress: ImportProgress[] = [];
    const summary = await importAudioFile(sid('basic'), new Blob([new Uint8Array(10)]), {
      decode: decoder({ sampleRate: RATE, channels: [tone(10.5)] }),
      onProgress: (p) => progress.push(p),
    });
    assert.equal(summary.chunksWritten, 3);
    assert.equal(summary.hasAudio, true);
    assert.equal(summary.sampleRate, RATE);
    assert.equal(summary.totalDuration, 10.5);
    assert.deepEqual(summary.lostChunks, []);
    assert.deepEqual(written.map((c) => c.seq), [0, 1, 2]);
    assert.deepEqual(written.map((c) => [c.startTime, c.endTime]), [[0, 4], [4, 8], [8, 10.5]]);
    assert.ok(written.every((c) => c.blob.type === 'audio/mpeg'));
    assert.deepEqual(encodedLengths, [4000, 4000, 2500]);
    assert.equal(flushCalls, 1, 'final chunk flushes the encoder exactly once');
    assert.equal(progress[0].phase, 'decoding');
    assert.ok(progress.some((p) => p.phase === 'encoding' && p.totalChunks === 3));
    const last = progress[progress.length - 1];
    assert.equal(last.chunksSaved, 3);
  });

  it('mixes stereo down to mono', async () => {
    const seen: number[] = [];
    setEncoderFactoryForTests(() => ({
      encode(samples: Float32Array) {
        seen.push(samples[0]);
        return new Uint8Array([1]);
      },
      flush: () => new Uint8Array(),
      createBlob: (d: Uint8Array) => new Blob([d], { type: 'audio/mpeg' }),
    }));
    setSessionStoreForTests({ writeChunk: async (_id, c) => ({ chunkId: `c-${c.seq}` }) });
    await importAudioFile(sid('stereo'), new ArrayBuffer(4), {
      decode: decoder({ sampleRate: RATE, channels: [tone(2, 1), tone(2, 0)] }),
    });
    assert.deepEqual(seen, [0.5]);
    setEncoderFactoryForTests(() => ({
      encode(samples: Float32Array) {
        encodedLengths.push(samples.length);
        return new Uint8Array([1, 2, 3, 4]);
      },
      flush() {
        flushCalls += 1;
        return new Uint8Array([9]);
      },
      createBlob: (d: Uint8Array) => new Blob([d], { type: 'audio/mpeg' }),
    }));
  });

  it('decode failure rejects with decode_failed and writes nothing', async () => {
    let writes = 0;
    setSessionStoreForTests({
      writeChunk: async () => {
        writes += 1;
        return { chunkId: 'x' };
      },
    });
    await assert.rejects(
      importAudioFile(sid('bad'), new Blob([new Uint8Array(3)]), {
        decode: async () => {
          throw new DOMException('Unable to decode audio data', 'EncodingError');
        },
      }),
      (error: unknown) => error instanceof CaptureError && (error as InstanceType<typeof CaptureError>).code === 'decode_failed'
    );
    assert.equal(writes, 0);
    const idle = await flushPending();
    assert.equal(idle.savedCount, 0);
  });

  it('empty decoded audio rejects with empty_audio', async () => {
    setSessionStoreForTests({ writeChunk: async () => ({ chunkId: 'x' }) });
    await assert.rejects(
      importAudioFile(sid('empty'), new ArrayBuffer(1), {
        decode: decoder({ sampleRate: RATE, channels: [new Float32Array(0)] }),
      }),
      (error: unknown) => (error as { code?: string }).code === 'empty_audio'
    );
  });

  it('retries transient store errors until saved (no loss, no skip)', async () => {
    const saved: number[] = [];
    let calls = 0;
    setSessionStoreForTests({
      writeChunk: async (_id, chunk) => {
        calls += 1;
        if (chunk.seq === 1 && calls < 4) return { error: 'store_busy', class: 'transient' };
        saved.push(chunk.seq);
        return { chunkId: `c-${chunk.seq}` };
      },
    });
    const summary = await importAudioFile(sid('retry'), new ArrayBuffer(1), {
      decode: decoder({ sampleRate: RATE, channels: [tone(12)] }),
    });
    assert.deepEqual(saved, [0, 1, 2]);
    assert.equal(summary.chunksWritten, 3);
    assert.deepEqual(summary.lostChunks, []);
  });

  it('permanent store error is reported precisely in lostChunks', async () => {
    const lostRecords: number[] = [];
    setSessionStoreForTests({
      writeChunk: async (_id, chunk) =>
        chunk.seq === 0 ? { error: 'quota_exceeded', class: 'permanent' } : { chunkId: `c-${chunk.seq}` },
      recordChunkLost: async (_id, loss) => {
        lostRecords.push(loss.seq);
        return { recorded: true };
      },
    });
    const summary = await importAudioFile(sid('perm'), new ArrayBuffer(1), {
      decode: decoder({ sampleRate: RATE, channels: [tone(8)] }),
    });
    assert.equal(summary.chunksWritten, 1);
    assert.equal(summary.lostChunks.length, 1);
    assert.deepEqual(
      { seq: summary.lostChunks[0].seq, startMs: summary.lostChunks[0].startMs, endMs: summary.lostChunks[0].endMs },
      { seq: 0, startMs: 0, endMs: 4000 }
    );
    assert.deepEqual(lostRecords, [0]);
  });

  it('applies backpressure: never more than 8 chunks pending persist', async () => {
    let inFlightMax = 0;
    let encodedNotSaved = 0;
    setEncoderFactoryForTests(() => ({
      encode() {
        encodedNotSaved += 1;
        inFlightMax = Math.max(inFlightMax, encodedNotSaved);
        return new Uint8Array([1]);
      },
      flush: () => new Uint8Array(),
      createBlob: (d: Uint8Array) => new Blob([d], { type: 'audio/mpeg' }),
    }));
    setSessionStoreForTests({
      writeChunk: async (_id, c) => {
        await new Promise((r) => setTimeout(r, 5));
        encodedNotSaved -= 1;
        return { chunkId: `c-${c.seq}` };
      },
    });
    const summary = await importAudioFile(sid('bp'), new ArrayBuffer(1), {
      decode: decoder({ sampleRate: RATE, channels: [tone(4 * 40)] }),
    });
    assert.equal(summary.chunksWritten, 40);
    assert.ok(inFlightMax <= 9, `in flight ${inFlightMax}`);
  });

  it('package flushPending() waits for an in-flight import', async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((r) => (release = r));
    const saved: number[] = [];
    setSessionStoreForTests({
      writeChunk: async (_id, c) => {
        await gate;
        saved.push(c.seq);
        return { chunkId: `c-${c.seq}` };
      },
    });
    const running = importAudioFile(sid('flush'), new ArrayBuffer(1), {
      decode: decoder({ sampleRate: RATE, channels: [tone(4)] }),
    });
    await new Promise((r) => setTimeout(r, 20));
    let flushed = false;
    const flushing = flushPending().then((result) => {
      flushed = true;
      return result;
    });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(flushed, false, 'flushPending must wait for the import chunk');
    release!();
    const result = await flushing;
    assert.equal(result.savedCount, 1);
    await running;
    assert.deepEqual(saved, [0]);
  });
});
