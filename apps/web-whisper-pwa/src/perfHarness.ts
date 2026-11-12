/**
 * Scale-perf harness hook. Active only with `?perfHarness=1`.
 * Exposes importSessionArchive (the real PWA import path) plus store
 * microbench helpers. Does not change production behavior when the flag is off.
 */

import * as sessionStore from '@web-whisper/session-store';
import { getIdbProbe, type IdbProbeSnapshot } from './perfIdbProbe';

export type StoreCallStat = {
  count: number;
  totalMs: number;
  maxMs: number;
};

export type PerfHarnessApi = {
  importArchive: (
    blob: Blob
  ) => Promise<{ sessionId: string; chunkIds: string[] } | { error: string }>;
  listSessions: typeof sessionStore.listSessions;
  getStorageStats: typeof sessionStore.getStorageStats;
  getChunkCoverage: typeof sessionStore.getChunkCoverage;
  getChunksForSession: typeof sessionStore.getChunksForSession;
  getSnipsForSession: typeof sessionStore.getSnipsForSession;
  getTranscriptsForSession: typeof sessionStore.getTranscriptsForSession;
  getVolumeProfile: typeof sessionStore.getVolumeProfile;
  getSession: typeof sessionStore.getSession;
  deleteSession: typeof sessionStore.deleteSession;
  timeStore: (method: string, sessionId?: string) => Promise<{ ms: number; result: unknown }>;
  resetMetrics: () => void;
  metrics: () => {
    store: Record<string, StoreCallStat>;
    idb: IdbProbeSnapshot | null;
  };
  idbSnapshot: () => IdbProbeSnapshot | null;
  idbReset: () => void;
  captureSnapshot: () => {
    chunksEncoded: number;
    currentDuration: number;
    savingBehind: boolean;
    pendingPersistHint: number | null;
  };
};

type TimedStore = Record<string, StoreCallStat>;

function harnessEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if ((window as unknown as { __wwPerfHarness?: boolean }).__wwPerfHarness) return true;
    return new URLSearchParams(window.location.search).get('perfHarness') === '1';
  } catch {
    return false;
  }
}

const storeStats: TimedStore = {};

function noteStore(name: string, ms: number) {
  const row = storeStats[name] || { count: 0, totalMs: 0, maxMs: 0 };
  row.count += 1;
  row.totalMs += ms;
  row.maxMs = Math.max(row.maxMs, ms);
  storeStats[name] = row;
}

async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    noteStore(name, performance.now() - t0);
  }
}

export function installPerfHarness(): void {
  if (!harnessEnabled()) return;
  const w = window as unknown as { __webWhisperPerf?: PerfHarnessApi };
  if (w.__webWhisperPerf) return;

  const api: PerfHarnessApi = {
    importArchive: (blob) => timed('importSessionArchive', () => sessionStore.importSessionArchive(blob)),
    listSessions: (options) => timed('listSessions', () => sessionStore.listSessions(options)),
    getStorageStats: () => timed('getStorageStats', () => sessionStore.getStorageStats()),
    getChunkCoverage: (sessionId) =>
      timed('getChunkCoverage', () => sessionStore.getChunkCoverage(sessionId)),
    getChunksForSession: (sessionId) =>
      timed('getChunksForSession', () => sessionStore.getChunksForSession(sessionId)),
    getSnipsForSession: (sessionId) =>
      timed('getSnipsForSession', () => sessionStore.getSnipsForSession(sessionId)),
    getTranscriptsForSession: (sessionId) =>
      timed('getTranscriptsForSession', () => sessionStore.getTranscriptsForSession(sessionId)),
    getVolumeProfile: (sessionId) =>
      timed('getVolumeProfile', () => sessionStore.getVolumeProfile(sessionId)),
    getSession: (sessionId) => timed('getSession', () => sessionStore.getSession(sessionId)),
    deleteSession: (sessionId) => timed('deleteSession', () => sessionStore.deleteSession(sessionId)),
    async timeStore(method, sessionId) {
      const t0 = performance.now();
      let result: unknown;
      switch (method) {
        case 'getStorageStats':
          result = await sessionStore.getStorageStats();
          break;
        case 'listSessions':
          result = await sessionStore.listSessions({ limit: 200, offset: 0 });
          break;
        case 'getChunkCoverage':
          if (!sessionId) throw new Error('sessionId required');
          result = await sessionStore.getChunkCoverage(sessionId);
          break;
        case 'getChunksForSession':
          if (!sessionId) throw new Error('sessionId required');
          result = await sessionStore.getChunksForSession(sessionId);
          break;
        case 'getSnipsForSession':
          if (!sessionId) throw new Error('sessionId required');
          result = await sessionStore.getSnipsForSession(sessionId);
          break;
        case 'getTranscriptsForSession':
          if (!sessionId) throw new Error('sessionId required');
          result = await sessionStore.getTranscriptsForSession(sessionId);
          break;
        case 'getVolumeProfile':
          if (!sessionId) throw new Error('sessionId required');
          result = await sessionStore.getVolumeProfile(sessionId);
          break;
        case 'getSession':
          if (!sessionId) throw new Error('sessionId required');
          result = await sessionStore.getSession(sessionId);
          break;
        default:
          throw new Error(`unknown method ${method}`);
      }
      return { ms: performance.now() - t0, result };
    },
    resetMetrics() {
      for (const key of Object.keys(storeStats)) delete storeStats[key];
      getIdbProbe()?.reset();
    },
    metrics() {
      const store: Record<string, StoreCallStat> = {};
      for (const [k, v] of Object.entries(storeStats)) store[k] = { ...v };
      return { store, idb: getIdbProbe()?.snapshot() ?? null };
    },
    idbSnapshot() {
      return getIdbProbe()?.snapshot() ?? null;
    },
    idbReset() {
      getIdbProbe()?.reset();
    },
    captureSnapshot() {
      let savingBehind = false;
      try {
        savingBehind = Boolean(document.querySelector('[data-testid="saving-behind"]'));
      } catch {
        savingBehind = false;
      }
      return {
        chunksEncoded: 0,
        currentDuration: 0,
        savingBehind,
        pendingPersistHint: null,
      };
    },
  };

  w.__webWhisperPerf = api;
}
