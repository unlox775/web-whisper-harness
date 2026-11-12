/**
 * Cross-package soak: real capture-engine persist queue + real session-store
 * (fake-indexeddb) + PWA retention / coverage wiring.
 *
 * Spec: apps/web-whisper-pwa/docs/specs/20261103175003-feedback-e2e-soak-60min-no-chunk-loss.md
 */
import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it, type TestContext } from 'node:test';
import * as sessionStore from '../../../../packages/datastore/session-store/src/index.js';
import type {
  CaptureHandle,
  ChunkLostEvent,
  FlushPendingResult,
} from '../../../../packages/lib/capture-engine/src/types.ts';
import {
  formatCoverageSummary,
  formatGapRangeList,
  gapCount,
  gapRanges,
  hasChunkGaps,
  isChunkCoverage,
} from '../../src/chunkCoverage.ts';
import {
  createRetentionGate,
  enforceRetentionAfterPersistIdle,
} from '../../src/retentionAfterIdle.ts';
import {
  isNearCap,
  type RetentionOpportunity,
} from '../../src/retentionPolicy.ts';
import { shouldRunRecordingRetention } from '../../src/recordingUsedBytes.ts';

const CHUNK_SECONDS = 4;
const CHUNK_MS = CHUNK_SECONDS * 1000;
const SOAK_CHUNKS = 900;
const NEGATIVE_CHUNKS = 20;
const PERMANENT_SEQ = 5;
const SEED_CHUNKS = 5_000;
const SEED_LOGS = 20_000;
const SAMPLE_RATE = 1_000;
const SAMPLES_PER_CHUNK = CHUNK_SECONDS * SAMPLE_RATE;
const CLOCK_START_MS = 1_700_000_000_000;
const FAIL_WINDOWS_MS = [
  { startOffsetMs: 40_000, durationMs: 3_000 },
  { startOffsetMs: 400_000, durationMs: 6_000 },
  { startOffsetMs: 2_000_000, durationMs: 10_000 },
] as const;
const SETTINGS_AT_SEQ = 200;
const NEAR_CAP_FORCE_AT_MS = 2_002_000;

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
let startCapture: typeof import('../../../../packages/lib/capture-engine/src/captureEngine.ts').startCapture;
let flushPending: typeof import('../../../../packages/lib/capture-engine/src/captureEngine.ts').flushPending;
let setEncoderFactoryForTests: typeof import('../../../../packages/lib/capture-engine/src/captureEngine.ts').setEncoderFactoryForTests;
let setSessionStoreForTests: typeof import('../../../../packages/lib/capture-engine/src/captureEngine.ts').setSessionStoreForTests;

function installAudioMocks(): void {
  class FakeAudioContext {
    sampleRate = SAMPLE_RATE;
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

const pcmScratch = new Float32Array(SAMPLES_PER_CHUNK);

function pushChunkPcm(): void {
  assert.ok(lastProcessor?.onaudioprocess, 'script processor not connected');
  lastProcessor.onaudioprocess({
    inputBuffer: {
      getChannelData: () => pcmScratch,
    },
  });
}

function flushSetImmediate(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function flushAsyncWork(times = 32): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
    await flushSetImmediate();
  }
}

async function advanceFakeTime(t: TestContext, ms: number, step = 250): Promise<void> {
  let advanced = 0;
  while (advanced < ms) {
    const n = Math.min(step, ms - advanced);
    t.mock.timers.tick(n);
    advanced += n;
    await flushAsyncWork();
  }
}

async function settleWithFakeTime<T>(
  t: TestContext,
  promise: Promise<T>,
  maxMs = 120_000
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
    await flushAsyncWork(80);
  }
  if (!settled) {
    throw new Error(`promise did not settle after ${maxMs}ms of fake time`);
  }
  if (error) throw error;
  await tracked;
  return value as T;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type StoreWriteResult = {
  chunkId?: string;
  error?: string;
  class?: 'transient' | 'permanent';
  [key: string]: unknown;
};

type FaultConfig = {
  recordingStartedAtMs: number;
  windows: ReadonlyArray<{ startOffsetMs: number; durationMs: number }>;
  randomFailRate: number;
  rng: () => number;
  permanentSeq: number | null;
};

function createFaultingStore(fault: FaultConfig) {
  let writeAttempts = 0;
  let transientInjected = 0;
  let randomTransient = 0;
  let windowTransient = 0;

  function inFailWindow(nowMs: number): boolean {
    const elapsed = nowMs - fault.recordingStartedAtMs;
    return fault.windows.some(
      (window) => elapsed >= window.startOffsetMs && elapsed < window.startOffsetMs + window.durationMs
    );
  }

  let inFlightWrites = 0;
  let lastError: string | null = null;
  return {
    stats: () => ({
      writeAttempts,
      transientInjected,
      randomTransient,
      windowTransient,
      inFlightWrites,
      lastError,
    }),
    api: {
      writeChunk: async (
        sessionId: string,
        chunkData: {
          seq: number;
          startTime: number;
          endTime: number;
          duration: number;
          blob: Blob;
          sizeBytes: number;
        }
      ): Promise<StoreWriteResult> => {
        writeAttempts += 1;
        inFlightWrites += 1;
        try {
        if (fault.permanentSeq != null && chunkData.seq === fault.permanentSeq) {
          return { error: 'quota_exceeded', class: 'permanent' };
        }
        if (inFailWindow(Date.now())) {
          transientInjected += 1;
          windowTransient += 1;
          return { error: 'store_busy', class: 'transient' };
        }
        if (fault.rng() < fault.randomFailRate) {
          transientInjected += 1;
          randomTransient += 1;
          return { error: 'store_busy', class: 'transient' };
        }
        const written = await sessionStore.writeChunk(sessionId, chunkData);
        if (written && written.error) lastError = String(written.error);
        return written;
        } finally {
          inFlightWrites -= 1;
        }
      },
      recordChunkLost: (
        sessionId: string,
        loss: { seq: number; startMs: number; endMs: number; reason: string }
      ) => sessionStore.recordChunkLost(sessionId, loss),
      log: (
        packageId: string,
        level: string,
        payload: string | (() => string | { message: string; details?: unknown }),
        options?: { sessionId?: string }
      ) => sessionStore.log(packageId, level, payload, options),
    },
  };
}

type RetentionCall = {
  opportunity: RetentionOpportunity;
  skipped: boolean;
};

function createPwaRetentionController(opts: {
  getCapBytes: () => number;
  getUsedBytes: () => number;
  isRecording: () => boolean;
  getSessionId: () => string | null;
}) {
  const gate = createRetentionGate();
  let lastRecordingRetentionAtMs: number | null = null;
  let lastEnforceAt = 0;
  const calls: RetentionCall[] = [];

  async function enforceCap(options?: {
    force?: boolean;
    opportunity?: RetentionOpportunity;
  }): Promise<void> {
    const recording = opts.isRecording();
    const opportunity: RetentionOpportunity =
      options?.opportunity ?? (recording ? 'recording' : 'idle');

    if (recording && opportunity === 'recording') {
      // Same 90% / 60s gate as the PWA: last-known usedBytes only. Do not
      // call getStorageStats per chunk (that was a whole-library cursor).
      const run = shouldRunRecordingRetention({
        usedBytesKnown: true,
        usedBytes: opts.getUsedBytes(),
        capBytes: opts.getCapBytes(),
        lastRecordingRetentionAtMs,
        nowMs: Date.now(),
      });
      if (!run) {
        calls.push({ opportunity, skipped: true });
        return;
      }
      lastRecordingRetentionAtMs = Date.now();
    } else if (!options?.force && Date.now() - lastEnforceAt < 4000) {
      calls.push({ opportunity, skipped: true });
      return;
    }

    if (opportunity !== 'recording') {
      lastEnforceAt = Date.now();
    }

    calls.push({ opportunity, skipped: false });
    await gate(() =>
      enforceRetentionAfterPersistIdle({
        capBytes: opts.getCapBytes(),
        flushPending,
        skipFlush: recording && opportunity === 'recording',
        enforceRetentionPolicy: (bytes) => sessionStore.enforceRetentionPolicy(bytes),
        sessionId: opts.getSessionId(),
        log: sessionStore.log,
      })
    );
  }

  return { enforceCap, calls };
}

async function seedLargeDb(): Promise<{
  seedSessionId: string;
  usedBytes: number;
  capBytes: number;
}> {
  const seed = await sessionStore.createSession();
  assert.ok(seed.id, seed.error);

  const seedBlob = new Blob([new Uint8Array(64)], { type: 'audio/mpeg' });
  const chunkRecords = [];
  const chunkIds: string[] = [];
  for (let i = 0; i < SEED_CHUNKS; i += 1) {
    const id = `chunk_seed_${i}`;
    chunkIds.push(id);
    chunkRecords.push({
      id,
      sessionId: seed.id,
      seq: i,
      startTime: i * CHUNK_SECONDS,
      endTime: (i + 1) * CHUNK_SECONDS,
      duration: CHUNK_SECONDS,
      blob: seedBlob,
      sizeBytes: 64,
    });
  }
  const seededChunks = await sessionStore.putChunkRecordsBulk(chunkRecords);
  assert.equal(seededChunks.written, SEED_CHUNKS);

  const snip = await sessionStore.writeSnip(seed.id, {
    startChunkIndex: 0,
    endChunkIndex: SEED_CHUNKS - 1,
    startTime: 0,
    endTime: SEED_CHUNKS * CHUNK_SECONDS,
    duration: SEED_CHUNKS * CHUNK_SECONDS,
    chunkIds,
    confidence: 1,
  });
  assert.ok(snip.snipId, snip.error);
  const transcript = await sessionStore.writeTranscript(snip.snipId, 'seed transcript for retention');
  assert.equal(transcript.written, true, transcript.error);

  const now = Date.now();
  const logRows = [];
  for (let i = 0; i < SEED_LOGS; i += 1) {
    logRows.push({
      id: `log_seed_${i}`,
      sessionId: seed.id,
      packageId: 'session-store',
      level: 'info',
      message: 'seed',
      createdAt: new Date(now - i).toISOString(),
      sizeBytes: 80,
    });
  }
  const seededLogs = await sessionStore.putLogRecordsBulk(logRows);
  assert.equal(seededLogs.written, SEED_LOGS);

  const stats = await sessionStore.getStorageStats();
  assert.equal(stats.error, undefined, stats.error);
  assert.ok(stats.chunkCount >= SEED_CHUNKS, `chunkCount ${stats.chunkCount}`);
  assert.ok(stats.logEntryCount >= SEED_LOGS, `logEntryCount ${stats.logEntryCount}`);
  assert.ok(stats.usedBytes > 0);

  const capBytes = Math.max(1, Math.floor(stats.usedBytes / 0.93));
  assert.equal(isNearCap(stats.usedBytes, capBytes), true);

  return { seedSessionId: seed.id, usedBytes: stats.usedBytes, capBytes };
}

const activeHandles: CaptureHandle[] = [];

before(async () => {
  installAudioMocks();
  ({
    startCapture,
    flushPending,
    setEncoderFactoryForTests,
    setSessionStoreForTests,
  } = await import('../../../../packages/lib/capture-engine/src/captureEngine.ts'));
  setEncoderFactoryForTests(() => ({
    encode(): Uint8Array {
      return new Uint8Array([1, 2, 3, 4]);
    },
    flush(): Uint8Array {
      return new Uint8Array();
    },
    createBlob(data: Uint8Array): Blob {
      return new Blob([data], { type: 'audio/mpeg' });
    },
  }));
});

beforeEach(async () => {
  sessionStore.closeDatabase();
  await sessionStore.init({ databaseName: `web-whisper-soak-${Date.now()}-${Math.random()}` });
});

after(async () => {
  if (typeof setSessionStoreForTests === 'function') {
    setSessionStoreForTests({
      writeChunk: async (_sessionId, chunk) => ({ chunkId: `teardown-${chunk.seq}` }),
      recordChunkLost: async () => ({ recorded: true }),
    });
  }
  const handles = activeHandles.splice(0);
  await Promise.all(handles.map((handle) => handle.stop().catch(() => undefined)));
  if (typeof setSessionStoreForTests === 'function') {
    setSessionStoreForTests(null);
  }
  sessionStore.closeDatabase();
});

describe('e2e soak — 60 min recording, zero chunk loss', () => {
  it(
    'saves every seq 0..899 through real persist + store under retention and transient faults',
    { timeout: 60_000 },
    async (t) => {
      const wallStartNs = process.hrtime.bigint();
      const seeded = await seedLargeDb();
      const live = await sessionStore.createSession();
      assert.ok(live.id, live.error);

      t.mock.timers.enable({
        apis: ['setTimeout', 'setInterval', 'Date'],
        now: CLOCK_START_MS,
      });

      const fault = createFaultingStore({
        recordingStartedAtMs: Date.now(),
        windows: FAIL_WINDOWS_MS,
        randomFailRate: 0.05,
        rng: mulberry32(20261103),
        permanentSeq: null,
      });
      setSessionStoreForTests(fault.api);

      let recording = true;
      const pwa = createPwaRetentionController({
        getCapBytes: () => seeded.capBytes,
        getUsedBytes: () => seeded.usedBytes,
        isRecording: () => recording,
        getSessionId: () => live.id,
      });

      const handle = await startCapture(live.id, {
        audioSource: 'simulated',
        inMemory: false,
        chunkTargetDuration: CHUNK_SECONDS,
        stallTimeout: 3600,
        watchdogTimeout: 60,
      });
      activeHandles.push(handle);

      const lostEvents: ChunkLostEvent[] = [];
      const inflight: Promise<void>[] = [];
      let recordingCap = Promise.resolve();
      handle.on('chunk_lost', (event) => lostEvents.push(event));
      handle.on('chunkEncoded', () => {
        recordingCap = recordingCap.then(() =>
          pwa.enforceCap({ opportunity: 'recording' })
        );
      });

      let settingsStarted = false;
      let nearCapForced = false;

      for (let seq = 0; seq < SOAK_CHUNKS; seq += 1) {
        pushChunkPcm();
        await flushAsyncWork();

        if (seq === SETTINGS_AT_SEQ && !settingsStarted) {
          settingsStarted = true;
          inflight.push(pwa.enforceCap({ force: true, opportunity: 'settings' }));
        }
        if (!nearCapForced && Date.now() - CLOCK_START_MS >= NEAR_CAP_FORCE_AT_MS) {
          nearCapForced = true;
          inflight.push(pwa.enforceCap({ opportunity: 'recording' }));
        }

        await advanceFakeTime(t, CHUNK_MS, CHUNK_MS);
      }

      assert.equal(handle.getStatus().chunksEncoded, SOAK_CHUNKS);

      const flushed: FlushPendingResult = await settleWithFakeTime(
        t,
        handle.flushPending(),
        180_000
      );
      recording = false;
      await settleWithFakeTime(t, handle.stop(), 180_000);
      inflight.push(recordingCap);
      await settleWithFakeTime(t, Promise.all(inflight), 180_000);
      await settleWithFakeTime(t, pwa.enforceCap({ force: true, opportunity: 'stop' }), 180_000);

      const faultStats = fault.stats();
      assert.ok(faultStats.windowTransient > 0, 'expected injected fail-window transients');
      assert.ok(faultStats.randomTransient > 0, 'expected ~5% random transients');
      assert.equal(lostEvents.length, 0, `chunk_lost events: ${JSON.stringify(lostEvents)}`);
      assert.deepEqual(flushed.lostChunks, []);
      assert.equal(flushed.savedCount, SOAK_CHUNKS);

      const stored = await sessionStore.getChunksForSession(live.id);
      assert.equal(stored.error, undefined, stored.error);
      const seqs = (stored.chunks || []).map((chunk: { seq: number }) => chunk.seq);
      assert.equal(seqs.length, SOAK_CHUNKS);
      assert.deepEqual(
        seqs,
        Array.from({ length: SOAK_CHUNKS }, (_, i) => i)
      );
      const unique = new Set(seqs);
      assert.equal(unique.size, SOAK_CHUNKS);

      const coverage = await sessionStore.getChunkCoverage(live.id);
      assert.equal(isChunkCoverage(coverage), true, coverage.error);
      if (!isChunkCoverage(coverage)) throw new Error('expected coverage');
      assert.equal(coverage.expectedFirstSeq, 0);
      assert.equal(coverage.lastSeq, SOAK_CHUNKS - 1);
      assert.equal(coverage.savedCount, SOAK_CHUNKS);
      assert.deepEqual(coverage.missingSeqs, []);
      assert.deepEqual(coverage.lostChunks, []);
      const elapsedMs = SOAK_CHUNKS * CHUNK_MS;
      assert.equal(coverage.savedDurationMs, elapsedMs);
      assert.equal(hasChunkGaps(coverage), false);
      assert.equal(gapCount(coverage), 0);
      assert.equal(
        formatCoverageSummary(coverage, elapsedMs / 1000),
        '1:00:00 elapsed · 1:00:00 saved · 0 gaps'
      );

      const opportunities = pwa.calls.filter((call) => !call.skipped).map((call) => call.opportunity);
      assert.ok(opportunities.includes('recording'), `near-cap path missing: ${opportunities.join(',')}`);
      assert.ok(opportunities.includes('settings'), `Settings path missing: ${opportunities.join(',')}`);
      assert.ok(opportunities.includes('stop'), `Stop path missing: ${opportunities.join(',')}`);

      const wallMs = Number(process.hrtime.bigint() - wallStartNs) / 1e6;
      assert.ok(wallMs < 60_000, `soak exceeded 60s wall time: ${wallMs}ms`);
    }
  );

  it(
    'negative control: one permanent error is exactly one reported gap',
    { timeout: 30_000 },
    async () => {
      await seedLargeDb();
      const live = await sessionStore.createSession();
      assert.ok(live.id, live.error);

      const fault = createFaultingStore({
        recordingStartedAtMs: Date.now(),
        windows: [],
        randomFailRate: 0,
        rng: () => 1,
        permanentSeq: PERMANENT_SEQ,
      });
      setSessionStoreForTests(fault.api);

      const handle = await startCapture(live.id, {
        audioSource: 'simulated',
        inMemory: false,
        chunkTargetDuration: CHUNK_SECONDS,
        stallTimeout: 3600,
        watchdogTimeout: 60,
      });
      activeHandles.push(handle);

      const lostEvents: ChunkLostEvent[] = [];
      handle.on('chunk_lost', (event) => lostEvents.push(event));

      for (let seq = 0; seq < NEGATIVE_CHUNKS; seq += 1) {
        pushChunkPcm();
      }

      const flushed = await handle.flushPending();
      await handle.stop();

      assert.equal(lostEvents.length, 1);
      assert.equal(lostEvents[0].seq, PERMANENT_SEQ);
      assert.equal(lostEvents[0].startMs, PERMANENT_SEQ * CHUNK_MS);
      assert.equal(lostEvents[0].endMs, (PERMANENT_SEQ + 1) * CHUNK_MS);
      assert.equal(lostEvents[0].reason, 'quota_exceeded');
      assert.equal(flushed.lostChunks.length, 1);
      assert.equal(flushed.lostChunks[0].seq, PERMANENT_SEQ);
      assert.equal(flushed.savedCount, NEGATIVE_CHUNKS - 1);

      const coverage = await sessionStore.getChunkCoverage(live.id);
      assert.equal(isChunkCoverage(coverage), true, coverage.error);
      if (!isChunkCoverage(coverage)) throw new Error('expected coverage');
      assert.deepEqual(coverage.missingSeqs, [PERMANENT_SEQ]);
      assert.equal(coverage.savedCount, NEGATIVE_CHUNKS - 1);
      assert.equal(coverage.savedDurationMs, (NEGATIVE_CHUNKS - 1) * CHUNK_MS);
      assert.equal(coverage.lostChunks.length, 1);
      assert.equal(coverage.lostChunks[0].seq, PERMANENT_SEQ);
      assert.equal(coverage.lostChunks[0].startMs, PERMANENT_SEQ * CHUNK_MS);
      assert.equal(coverage.lostChunks[0].endMs, (PERMANENT_SEQ + 1) * CHUNK_MS);
      assert.equal(hasChunkGaps(coverage), true);
      const elapsedSeconds = NEGATIVE_CHUNKS * CHUNK_SECONDS;
      assert.equal(
        formatCoverageSummary(coverage, elapsedSeconds),
        '1:20 elapsed · 1:16 saved · 1 gap'
      );
      assert.equal(
        formatGapRangeList(gapRanges(coverage)),
        '0:20–0:24'
      );
    }
  );
});
