import { test, expect, type Page, type CDPSession } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const cacheDir = resolve(here, '.cache');
const qaDir = resolve(repoRoot, 'documentation/qa');

const CHUNK_COUNT = Math.max(1, Number(process.env.PERF_CHUNK_COUNT || 357));
const NS = (process.env.PERF_N || '0,10,20,50,100')
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n >= 0);
const RECORD_SECONDS = Math.max(8, Number(process.env.PERF_RECORD_SECONDS || 60));
const CPU_RATE = Math.max(1, Number(process.env.PERF_CPU_THROTTLE || 4));
const ZIP_NAME = `synthetic-session-${CHUNK_COUNT}x4s.zip`;
const zipPath = resolve(cacheDir, ZIP_NAME);
const infoPath = resolve(cacheDir, `synthetic-session-${CHUNK_COUNT}x4s.json`);

const APP_URL = '/?perfHarness=1&simulate=1';

type IdbSnap = {
  ops: number;
  byStore: Record<
    string,
    {
      reads: number;
      writes: number;
      cursors: number;
      cursorContinues: number;
      estimatedReadBytes: number;
      estimatedWriteBytes: number;
      writeMsTotal: number;
      writeMsMax: number;
      writeMsSamples: number[];
    }
  >;
};

type Phase = {
  name: string;
  wallMs: number;
  idb?: IdbSnap | null;
  extra?: Record<string, unknown>;
};

function loadFixtureInfo() {
  if (!existsSync(zipPath)) {
    throw new Error(
      `Missing ${zipPath}. Run: node tests/perf/generate-synthetic-archive.mjs`
    );
  }
  const info = existsSync(infoPath)
    ? JSON.parse(readFileSync(infoPath, 'utf8'))
    : { zipPath, chunkCount: CHUNK_COUNT };
  return info as {
    zipPath: string;
    chunkCount: number;
    durationSeconds: number;
    chunkBytes: number;
    zipBytes: number;
    snipCount: number;
    transcriptCount: number;
  };
}

async function setCpu(page: Page, rate: number): Promise<CDPSession> {
  const client = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate });
  return client;
}

async function overrideOriginQuota(page: Page, bytes = 32 * 1024 * 1024 * 1024) {
  const client = await page.context().newCDPSession(page);
  const origin = new URL(page.url()).origin;
  try {
    await client.send('Storage.overrideQuotaForOrigin', {
      origin,
      quotaSize: bytes,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(`[perf] quota override failed: ${error instanceof Error ? error.message : error}`);
  }
  try {
    await page.evaluate(async () => {
      await navigator.storage?.persist?.();
    });
  } catch {
    // persist is best-effort
  }
}

async function waitReady(page: Page) {
  await page.getByRole('button', { name: 'Start recording' }).waitFor({ timeout: 120_000 });
}

async function waitCards(page: Page, n: number) {
  if (n <= 0) {
    await page.locator('.empty-sessions, .session-card').first().waitFor({ timeout: 120_000 });
    return;
  }
  await expect(page.locator('.session-card')).toHaveCount(n, { timeout: 120_000 });
}

async function waitIdbIdle(page: Page, stableMs = 400, timeout = 45_000) {
  return page.evaluate(
    async ({ stableMs, timeout }) => {
      const start = performance.now();
      const snap = () => window.__webWhisperPerf?.idbSnapshot()?.ops ?? 0;
      let last = snap();
      let lastChange = performance.now();
      while (performance.now() - start < timeout) {
        await new Promise((r) => setTimeout(r, 50));
        const ops = snap();
        if (ops !== last) {
          last = ops;
          lastChange = performance.now();
        } else if (performance.now() - lastChange >= stableMs) {
          return { idleWaitMs: performance.now() - start, ops, timedOut: false };
        }
      }
      return { idleWaitMs: timeout, ops: last, timedOut: true };
    },
    { stableMs, timeout }
  );
}

async function idbReset(page: Page) {
  await page.evaluate(() => window.__webWhisperPerf?.idbReset());
  await page.evaluate(() => {
    window.__wwLongTasks = [];
  });
}

async function snapshotIdb(page: Page): Promise<IdbSnap | null> {
  return page.evaluate(() => window.__webWhisperPerf?.idbSnapshot() ?? null);
}

async function longTasks(page: Page) {
  return page.evaluate(() => {
    const rows = window.__wwLongTasks || [];
    const durations = rows.map((r) => r.duration);
    const over50 = durations.filter((d) => d >= 50);
    const over200 = durations.filter((d) => d >= 200);
    return {
      count: rows.length,
      over50: over50.length,
      over200: over200.length,
      maxMs: durations.reduce((m, d) => Math.max(m, d), 0),
      sumMs: durations.reduce((s, d) => s + d, 0),
    };
  });
}

async function microbench(page: Page, n: number) {
  return page.evaluate(async (sessionCount) => {
    const perf = window.__webWhisperPerf;
    if (!perf) throw new Error('perf harness missing');
    const once = async (method: string, sessionId?: string) => {
      const runs = [];
      for (let i = 0; i < 3; i += 1) {
        const { ms } = await perf.timeStore(method, sessionId);
        runs.push(ms);
      }
      runs.sort((a, b) => a - b);
      return { minMs: runs[0], medianMs: runs[1], maxMs: runs[2] };
    };
    const listed = await perf.timeStore('listSessions');
    const sessions = (listed.result as { sessions?: Array<{ id: string }> })?.sessions || [];
    const firstId = sessions[0]?.id;
    const out: Record<string, unknown> = {
      n: sessionCount,
      listedCount: sessions.length,
      listSessions: { ms: listed.ms, ...((await once('listSessions')) as object) },
      getStorageStats: await once('getStorageStats'),
    };
    if (firstId) {
      out.getSession = await once('getSession', firstId);
      out.getChunkCoverage = await once('getChunkCoverage', firstId);
      out.getChunksForSession = await once('getChunksForSession', firstId);
      out.getSnipsForSession = await once('getSnipsForSession', firstId);
      out.getTranscriptsForSession = await once('getTranscriptsForSession', firstId);
      out.getVolumeProfile = await once('getVolumeProfile', firstId);
      const tParallel = performance.now();
      await Promise.all(sessions.map((s) => perf.getChunkCoverage(s.id)));
      out.listLikeGetChunkCoverageParallelMs = performance.now() - tParallel;
      const tSerial = performance.now();
      for (const s of sessions) await perf.getChunkCoverage(s.id);
      out.listLikeGetChunkCoverageSerialMs = performance.now() - tSerial;
      const tTiles = performance.now();
      await Promise.all(
        sessions.map(async (s) => {
          await perf.getSnipsForSession(s.id);
          await perf.getTranscriptsForSession(s.id);
          await perf.getChunkCoverage(s.id);
        })
      );
      out.listLikeTileFanoutMs = performance.now() - tTiles;
    }
    return out;
  }, n);
}

async function importMore(page: Page, count: number) {
  if (count <= 0) return { ids: [] as string[], error: null as string | null, ms: 0 };
  const t0 = Date.now();
  const result = await page.evaluate(async (add) => {
    const perf = window.__webWhisperPerf;
    if (!perf) return { error: 'no_harness', ids: [] as string[] };
    const resp = await fetch('/perf-synthetic-session.zip');
    if (!resp.ok) return { error: `fetch_zip_${resp.status}`, ids: [] as string[] };
    const blob = await resp.blob();
    const ids: string[] = [];
    for (let i = 0; i < add; i += 1) {
      const imported = await perf.importArchive(blob);
      if ('error' in imported && imported.error) {
        return { error: imported.error, ids, failedAt: i };
      }
      if (!('sessionId' in imported)) {
        return { error: 'invalid_import', ids, failedAt: i };
      }
      ids.push(imported.sessionId);
      if ((i + 1) % 5 === 0 || i === add - 1) {
        console.log(`[perf] imported ${i + 1}/${add}`);
      }
    }
    return { error: null, ids };
  }, count);
  return { ...result, ms: Date.now() - t0 };
}

async function storageEstimate(page: Page) {
  return page.evaluate(async () => {
    try {
      const est = await navigator.storage?.estimate?.();
      return { usage: est?.usage ?? null, quota: est?.quota ?? null };
    } catch {
      return { usage: null, quota: null };
    }
  });
}

async function deleteNewestSession(page: Page) {
  await page.evaluate(async () => {
    const perf = window.__webWhisperPerf;
    if (!perf) return;
    const listed = await perf.listSessions({ limit: 1, offset: 0 });
    const id = listed.sessions?.[0]?.id;
    if (id) await perf.deleteSession(id);
  });
}

test.describe.configure({ mode: 'serial' });

test('PWA scale baseline (iPhone emulation, CPU 4x)', async ({ page }) => {
  const fixture = loadFixtureInfo();
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(qaDir, { recursive: true });

  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[perf]') || msg.type() === 'error') {
      // eslint-disable-next-line no-console
      console.log(`console:${msg.type()} ${text}`);
    }
  });

  await page.route('**/perf-synthetic-session.zip', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/zip',
      path: zipPath,
    });
  });

  await page.addInitScript({ path: resolve(here, 'idbHook.js') });
  await page.addInitScript(() => {
    try {
      localStorage.setItem('storage_cap_mb', '16384');
      localStorage.setItem('onboarding_dismissed', 'true');
    } catch {
      // ignore
    }
    try {
      void navigator.storage?.persist?.();
    } catch {
      // ignore
    }
  });

  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    fixture,
    cpuThrottle: CPU_RATE,
    device: 'iPhone 13 (Playwright Chromium)',
    recordSeconds: RECORD_SECONDS,
    notes: [
      'Chromium with iPhone 13 device metrics + Emulation.setCPUThrottlingRate. Not WebKit/Safari.',
      'Sessions seeded through session-store importSessionArchive (same path as PWA zip import).',
      'Storage cap raised to 16384 MB so retention does not purge transcribed audio during the run.',
    ],
    ns: [] as unknown[],
  };

  await page.goto(APP_URL);
  await waitReady(page);
  await overrideOriginQuota(page);

  let seeded = 0;
  let quotaCapped: string | null = null;
  const sorted = [...NS].sort((a, b) => a - b);

  for (const target of sorted) {
    let n = target;
    const need = n - seeded;
    if (need > 0) {
      await setCpu(page, 1);
      await overrideOriginQuota(page);
      // eslint-disable-next-line no-console
      console.log(`[perf] seeding +${need} sessions to reach N=${n}`);
      const imported = await importMore(page, need);
      seeded += imported.ids.length;
      if (imported.error) {
        quotaCapped = imported.error;
        // eslint-disable-next-line no-console
        console.log(
          `[perf] import stopped at ${seeded} sessions: ${imported.error} (wanted N=${n})`
        );
        if (seeded === 0) {
          (report.ns as unknown[]).push({
            n,
            error: imported.error,
            importedSoFar: seeded,
            importMs: imported.ms,
            storage: await storageEstimate(page),
          });
          writeFileSync(resolve(cacheDir, 'perf-baseline-raw.json'), `${JSON.stringify(report, null, 2)}\n`);
          break;
        }
        n = seeded;
      } else {
        expect(seeded).toBe(n);
      }
    }

    const storeMicro = await microbench(page, n);
    const storage = await storageEstimate(page);

    await setCpu(page, CPU_RATE);
    await idbReset(page);
    const coldStart = Date.now();
    await page.goto(APP_URL);
    await overrideOriginQuota(page);
    await setCpu(page, CPU_RATE);
    await waitReady(page);
    const coldInteractiveMs = Date.now() - coldStart;
    await waitCards(page, n);
    const coldCardsMs = Date.now() - coldStart;
    const coldIdle = await waitIdbIdle(page);
    const coldListMs = Date.now() - coldStart;
    const coldIdb = await snapshotIdb(page);
    const coldTasks = await longTasks(page);

    if (n === 10 || n === sorted[sorted.length - 1] || n === 20) {
      const shot = resolve(qaDir, `perf-baseline-list-n${n}.png`);
      await page.screenshot({ path: shot, fullPage: false });
    }

    const phases: Phase[] = [
      {
        name: 'coldLoadToInteractiveList',
        wallMs: coldInteractiveMs,
        extra: {
          cardsVisibleMs: coldCardsMs,
          idleMs: coldListMs,
          idle: coldIdle,
          longTasks: coldTasks,
        },
        idb: coldIdb,
      },
    ];

    if (n > 0) {
      await idbReset(page);
      const openStart = Date.now();
      await page.locator('.session-card').first().click();
      await page.locator('.session-detail-card').waitFor({ timeout: 120_000 });
      const openCardMs = Date.now() - openStart;
      await page.locator('.session-detail-meta').waitFor({ timeout: 120_000 });
      const openIdle = await waitIdbIdle(page);
      const openMs = Date.now() - openStart;
      phases.push({
        name: 'openSessionDetail',
        wallMs: openMs,
        extra: { headingMs: openCardMs, idle: openIdle, longTasks: await longTasks(page) },
        idb: await snapshotIdb(page),
      });

      await idbReset(page);
      const backStart = Date.now();
      await page.getByRole('button', { name: '← Sessions' }).click();
      await waitReady(page);
      await waitCards(page, n);
      const backIdle = await waitIdbIdle(page);
      phases.push({
        name: 'backToList',
        wallMs: Date.now() - backStart,
        extra: { idle: backIdle, longTasks: await longTasks(page) },
        idb: await snapshotIdb(page),
      });
    }

    await idbReset(page);
    const recStart = Date.now();
    await page.getByRole('button', { name: 'Start recording' }).click();
    await expect(page.getByTestId('recording-hud-label')).toHaveText('Recording', {
      timeout: 120_000,
    });
    const recordActiveMs = Date.now() - recStart;
    const recordStartIdb = await snapshotIdb(page);

    const recSamples: Array<Record<string, unknown>> = [];
    const recUntil = Date.now() + RECORD_SECONDS * 1000;
    if (n === 10 || (sorted.includes(10) === false && n === sorted.find((v) => v > 0))) {
      await page.waitForTimeout(2500);
      await page.screenshot({
        path: resolve(qaDir, 'recording-no-library-scan-iphone.png'),
        fullPage: false,
      });
    }
    while (Date.now() < recUntil) {
      await page.waitForTimeout(2000);
      recSamples.push(
        await page.evaluate(() => {
          const cap = window.__wwCapture;
          const status = cap?.getStatus?.();
          const idb = window.__webWhisperPerf?.idbSnapshot();
          const chunks = idb?.byStore?.chunks;
          return {
            at: performance.now(),
            chunksEncoded: status?.chunksEncoded ?? null,
            currentDuration: status?.currentDuration ?? null,
            persistEvents: cap?.persist?.length ?? 0,
            lastPersist: cap?.persist?.at?.(-1) ?? null,
            savingBehind: Boolean(document.querySelector('[data-testid="saving-behind"]')),
            chunkWrites: chunks?.writes ?? 0,
            chunkWriteMsMax: chunks?.writeMsMax ?? 0,
            chunkWriteMsTotal: chunks?.writeMsTotal ?? 0,
            chunkCursors: chunks?.cursors ?? 0,
            chunkCursorContinues: chunks?.cursorContinues ?? 0,
            chunkReadBytes: chunks?.estimatedReadBytes ?? 0,
          };
        })
      );
    }

    // Snapshot before Stop. Stop → home `refresh()` + tile fan-out is the
    // list spec; this phase is the live record path only.
    const recordIdb = await snapshotIdb(page);
    const recordCapture = await page.evaluate(() => ({
      persistEvents: window.__wwCapture?.persist ?? [],
      encodedCount: window.__wwCapture?.encoded?.length ?? 0,
      status: window.__wwCapture?.getStatus?.() ?? null,
    }));
    const recordTasks = await longTasks(page);

    const stopStart = Date.now();
    await page.getByTestId('stop-recording').click();
    await waitReady(page);
    const stopInteractiveMs = Date.now() - stopStart;
    await waitIdbIdle(page, 600, 90_000);
    const stopMs = Date.now() - stopStart;

    phases.push({
      name: 'tapRecordToActive',
      wallMs: recordActiveMs,
      idb: recordStartIdb,
    });
    phases.push({
      name: 'recordWindow',
      wallMs: RECORD_SECONDS * 1000,
      extra: {
        samples: recSamples,
        longTasks: recordTasks,
        capture: recordCapture,
      },
      idb: recordIdb,
    });
    phases.push({
      name: 'stopToFinished',
      wallMs: stopMs,
      extra: { interactiveMs: stopInteractiveMs, longTasks: await longTasks(page) },
      idb: await snapshotIdb(page),
    });

    await setCpu(page, 1);
    await deleteNewestSession(page);

    (report.ns as unknown[]).push({
      n,
      seeded,
      storage,
      quotaCapped,
      storeMicrobench: storeMicro,
      phases,
    });
    writeFileSync(resolve(cacheDir, 'perf-baseline-raw.json'), `${JSON.stringify(report, null, 2)}\n`);
    if (quotaCapped) break;
  }

  writeFileSync(resolve(qaDir, 'perf-baseline-raw.json'), `${JSON.stringify(report, null, 2)}\n`);
  expect((report.ns as unknown[]).length).toBeGreaterThan(0);
});

declare global {
  interface Window {
    __webWhisperPerf?: {
      importArchive: (blob: Blob) => Promise<{ sessionId: string; chunkIds: string[] } | { error: string }>;
      listSessions: (options?: { limit?: number; offset?: number }) => Promise<{
        sessions?: Array<{ id: string }>;
        error?: string;
      }>;
      deleteSession: (id: string) => Promise<unknown>;
      timeStore: (method: string, sessionId?: string) => Promise<{ ms: number; result: unknown }>;
      getChunkCoverage: (id: string) => Promise<unknown>;
      getSnipsForSession: (id: string) => Promise<unknown>;
      getTranscriptsForSession: (id: string) => Promise<unknown>;
      idbSnapshot: () => IdbSnap | null;
      idbReset: () => void;
    };
    __wwLongTasks?: Array<{ duration: number; startTime: number; name: string }>;
    __wwCapture?: {
      getStatus?: () => {
        chunksEncoded?: number;
        currentDuration?: number;
      };
      persist?: Array<{ at: number; pendingCount?: number; oldestSeq?: number }>;
      encoded?: Array<{ at: number; seq?: number }>;
    };
  }
}
