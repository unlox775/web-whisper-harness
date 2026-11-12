/**
 * IndexedDB read/write probe used by the scale perf harness.
 * Active only when `?perfHarness=1` (or `window.__wwPerfHarness = true`).
 * Safe to import from main.tsx: no session-store dependency, so it wraps
 * IDB before AppProvider calls init().
 */

export type IdbStoreStats = {
  reads: number;
  writes: number;
  cursors: number;
  cursorContinues: number;
  estimatedReadBytes: number;
  estimatedWriteBytes: number;
  writeMsTotal: number;
  writeMsMax: number;
  writeMsSamples: number[];
};

export type IdbProbeSnapshot = {
  startedAt: number;
  now: number;
  byStore: Record<string, IdbStoreStats>;
  ops: number;
};

type MutableStoreStats = IdbStoreStats;

const emptyStore = (): MutableStoreStats => ({
  reads: 0,
  writes: 0,
  cursors: 0,
  cursorContinues: 0,
  estimatedReadBytes: 0,
  estimatedWriteBytes: 0,
  writeMsTotal: 0,
  writeMsMax: 0,
  writeMsSamples: [],
});

function harnessEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if ((window as unknown as { __wwPerfHarness?: boolean }).__wwPerfHarness) return true;
    return new URLSearchParams(window.location.search).get('perfHarness') === '1';
  } catch {
    return false;
  }
}

function estimateRecordBytes(value: unknown): number {
  if (value == null) return 0;
  if (typeof value !== 'object') return 8;
  const rec = value as {
    sizeBytes?: unknown;
    blob?: { size?: number };
    logBytes?: unknown;
    chunkVolumes?: unknown;
    samples?: unknown;
    text?: unknown;
  };
  let bytes = 0;
  if (typeof rec.sizeBytes === 'number') bytes += rec.sizeBytes;
  if (rec.blob && typeof rec.blob.size === 'number') bytes += rec.blob.size;
  if (typeof rec.logBytes === 'number') bytes += rec.logBytes;
  if (typeof rec.text === 'string') bytes += rec.text.length * 2;
  if (Array.isArray(rec.samples)) bytes += rec.samples.length * 8;
  if (Array.isArray(rec.chunkVolumes)) {
    for (const row of rec.chunkVolumes as Array<{ samples?: unknown[] }>) {
      bytes += 32;
      if (Array.isArray(row?.samples)) bytes += row.samples.length * 8;
    }
  }
  if (bytes === 0) {
    try {
      bytes = JSON.stringify(value).length;
    } catch {
      bytes = 64;
    }
  }
  return bytes;
}

function installIdbProbe(): void {
  if (typeof indexedDB === 'undefined') return;
  const w = window as unknown as { __wwIdbProbeInstalled?: boolean; __wwIdb?: IdbProbeApi };
  if (w.__wwIdbProbeInstalled) return;
  w.__wwIdbProbeInstalled = true;

  const byStore = new Map<string, MutableStoreStats>();
  let ops = 0;
  const startedAt = performance.now();

  const statsFor = (name: string): MutableStoreStats => {
    let row = byStore.get(name);
    if (!row) {
      row = emptyStore();
      byStore.set(name, row);
    }
    return row;
  };

  const noteRead = (store: string, value: unknown, cursor = false) => {
    const row = statsFor(store);
    row.reads += 1;
    if (cursor) row.cursorContinues += 1;
    row.estimatedReadBytes += estimateRecordBytes(value);
    ops += 1;
  };

  const noteWrite = (store: string, value: unknown) => {
    const row = statsFor(store);
    row.writes += 1;
    row.estimatedWriteBytes += estimateRecordBytes(value);
    ops += 1;
  };

  const noteWriteMs = (store: string, ms: number) => {
    const row = statsFor(store);
    row.writeMsTotal += ms;
    row.writeMsMax = Math.max(row.writeMsMax, ms);
    if (row.writeMsSamples.length < 256) row.writeMsSamples.push(Math.round(ms * 10) / 10);
  };

  const trackRequest = (store: string, req: IDBRequest, value: unknown) => {
    const t0 = performance.now();
    noteWrite(store, value);
    const done = () => noteWriteMs(store, performance.now() - t0);
    req.addEventListener('success', done);
    req.addEventListener('error', done);
  };

  const proto = IDBObjectStore.prototype;
  const origGet = proto.get;
  proto.get = function getPatched(query: IDBValidKey | IDBKeyRange) {
    const store = this.name;
    const req = origGet.call(this, query);
    req.addEventListener('success', () => noteRead(store, req.result));
    return req;
  };

  const origGetAll = proto.getAll;
  proto.getAll = function getAllPatched(
    query?: IDBValidKey | IDBKeyRange | null,
    count?: number
  ) {
    const store = this.name;
    const req = origGetAll.call(this, query as IDBValidKey | IDBKeyRange, count);
    req.addEventListener('success', () => {
      const rows = (req.result || []) as unknown[];
      for (const row of rows) noteRead(store, row);
    });
    return req;
  };

  const origGetAllKeys = proto.getAllKeys;
  proto.getAllKeys = function getAllKeysPatched(
    query?: IDBValidKey | IDBKeyRange | null,
    count?: number
  ) {
    const store = this.name;
    const req = origGetAllKeys.call(this, query as IDBValidKey | IDBKeyRange, count);
    req.addEventListener('success', () => {
      const keys = (req.result || []) as unknown[];
      statsFor(store).reads += keys.length || 1;
      ops += 1;
    });
    return req;
  };

  const origCount = proto.count;
  proto.count = function countPatched(query?: IDBValidKey | IDBKeyRange) {
    const store = this.name;
    const req = origCount.call(this, query);
    req.addEventListener('success', () => {
      statsFor(store).reads += 1;
      ops += 1;
    });
    return req;
  };

  const origPut = proto.put;
  proto.put = function putPatched(value: unknown, key?: IDBValidKey) {
    const req =
      key === undefined ? origPut.call(this, value) : origPut.call(this, value, key);
    trackRequest(this.name, req, value);
    return req;
  };

  const origAdd = proto.add;
  proto.add = function addPatched(value: unknown, key?: IDBValidKey) {
    const req =
      key === undefined ? origAdd.call(this, value) : origAdd.call(this, value, key);
    trackRequest(this.name, req, value);
    return req;
  };

  const origDelete = proto.delete;
  proto.delete = function deletePatched(query: IDBValidKey | IDBKeyRange) {
    statsFor(this.name).writes += 1;
    ops += 1;
    return origDelete.call(this, query);
  };

  const origClear = proto.clear;
  proto.clear = function clearPatched() {
    statsFor(this.name).writes += 1;
    ops += 1;
    return origClear.call(this);
  };

  const patchCursor = (
    orig: typeof proto.openCursor,
    kind: 'openCursor' | 'openKeyCursor'
  ) =>
    function cursorPatched(
      this: IDBObjectStore,
      query?: IDBValidKey | IDBKeyRange | null,
      direction?: IDBCursorDirection
    ) {
      const store = this.name;
      statsFor(store).cursors += 1;
      const req = orig.call(this, query as IDBValidKey | IDBKeyRange, direction);
      req.addEventListener('success', () => {
        const cursor = req.result as IDBCursorWithValue | IDBCursor | null;
        if (!cursor) return;
        if (kind === 'openCursor' && 'value' in cursor) {
          noteRead(store, (cursor as IDBCursorWithValue).value, true);
        } else {
          statsFor(store).reads += 1;
          statsFor(store).cursorContinues += 1;
          ops += 1;
        }
      });
      return req;
    };

  proto.openCursor = patchCursor(proto.openCursor, 'openCursor') as typeof proto.openCursor;
  proto.openKeyCursor = patchCursor(
    proto.openKeyCursor,
    'openKeyCursor'
  ) as typeof proto.openKeyCursor;

  const indexProto = IDBIndex.prototype;
  const patchIndexCursor = (
    orig: typeof indexProto.openCursor,
    kind: 'openCursor' | 'openKeyCursor'
  ) =>
    function indexCursorPatched(
      this: IDBIndex,
      query?: IDBValidKey | IDBKeyRange | null,
      direction?: IDBCursorDirection
    ) {
      const store = this.objectStore.name;
      statsFor(store).cursors += 1;
      const req = orig.call(this, query as IDBValidKey | IDBKeyRange, direction);
      req.addEventListener('success', () => {
        const cursor = req.result as IDBCursorWithValue | IDBCursor | null;
        if (!cursor) return;
        if (kind === 'openCursor' && 'value' in cursor) {
          noteRead(store, (cursor as IDBCursorWithValue).value, true);
        } else {
          statsFor(store).reads += 1;
          statsFor(store).cursorContinues += 1;
          ops += 1;
        }
      });
      return req;
    };
  indexProto.openCursor = patchIndexCursor(
    indexProto.openCursor,
    'openCursor'
  ) as typeof indexProto.openCursor;
  indexProto.openKeyCursor = patchIndexCursor(
    indexProto.openKeyCursor,
    'openKeyCursor'
  ) as typeof indexProto.openKeyCursor;

  const api: IdbProbeApi = {
    reset() {
      byStore.clear();
      ops = 0;
    },
    snapshot(): IdbProbeSnapshot {
      const out: Record<string, IdbStoreStats> = {};
      for (const [name, row] of byStore.entries()) {
        out[name] = { ...row };
      }
      return {
        startedAt,
        now: performance.now(),
        byStore: out,
        ops,
      };
    },
  };

  w.__wwIdb = api;
}

type IdbProbeApi = {
  reset: () => void;
  snapshot: () => IdbProbeSnapshot;
};

if (harnessEnabled()) {
  installIdbProbe();
}

export function getIdbProbe(): IdbProbeApi | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { __wwIdb?: IdbProbeApi }).__wwIdb ?? null;
}
