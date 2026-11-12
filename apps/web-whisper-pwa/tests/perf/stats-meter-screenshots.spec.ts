import { test, expect } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const cacheDir = resolve(here, '.cache');
const qaDir = resolve(repoRoot, 'documentation/qa');
const zipPath = resolve(cacheDir, 'synthetic-session-357x4s.zip');

const SESSION_COUNT = 10;
const REBUILD_DELAY_MS = 15_000;

async function simulateUpgradedDbMissingStats(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('web-whisper-db');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['meta', 'sessions'], 'readwrite');
        tx.objectStore('meta').delete('storage-stats');
        const cursorReq = tx.objectStore('sessions').openCursor();
        cursorReq.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
          if (!cursor) return;
          const row = cursor.value as { chunkCount?: number; sizeBytes?: number };
          if ((row.chunkCount || 0) > 0) {
            row.sizeBytes = 0;
            cursor.update(row);
          }
          cursor.continue();
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
}

test(`storage DATA meter screenshots (iPhone 13, N=${SESSION_COUNT})`, async ({ page }) => {
  if (!existsSync(zipPath)) {
    test.skip(true, 'Run generate-synthetic-archive.mjs first');
  }
  mkdirSync(qaDir, { recursive: true });
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
  });
  await page.goto('/?perfHarness=1&simulate=1');
  await page.getByRole('button', { name: 'Start recording' }).waitFor({ timeout: 120_000 });

  const imported = await page.evaluate(async (count) => {
    const perf = window.__webWhisperPerf;
    if (!perf) return { error: 'no_harness', n: 0 };
    const resp = await fetch('/perf-synthetic-session.zip');
    if (!resp.ok) return { error: `fetch_${resp.status}`, n: 0 };
    const blob = await resp.blob();
    let n = 0;
    for (let i = 0; i < count; i += 1) {
      const result = await perf.importArchive(blob);
      if (result && typeof result === 'object' && 'error' in result && result.error) {
        return { error: String(result.error), n };
      }
      n += 1;
    }
    const listed = await perf.listSessions({ limit: 200, offset: 0 });
    return { n, listed: listed?.sessions?.length ?? 0, error: null };
  }, SESSION_COUNT);
  expect(imported.error).toBeNull();
  expect(imported.n).toBe(SESSION_COUNT);
  expect(imported.listed).toBe(SESSION_COUNT);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Start recording' }).waitFor({ timeout: 120_000 });
  await expect(page.locator('.session-card')).toHaveCount(SESSION_COUNT, { timeout: 300_000 });

  await simulateUpgradedDbMissingStats(page);

  await page.addInitScript((delayMs) => {
    (window as unknown as { __wwStatsRebuildDelayMs?: number }).__wwStatsRebuildDelayMs = delayMs;
  }, REBUILD_DELAY_MS);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Start recording' }).waitFor({ timeout: 120_000 });

  const chip = page.locator('.data-chip .value');
  await expect(chip).toHaveText(/Calculating/, { timeout: 5_000 });
  const firstTileMeta = page.locator('.session-card').first().locator('.session-meta');
  await expect(firstTileMeta).toContainText('0 B', { timeout: 5_000 });

  await page.locator('.data-chip').screenshot({
    path: resolve(qaDir, 'storage-stats-calculating-iphone.png'),
  });
  await page.locator('.session-card').first().screenshot({
    path: resolve(qaDir, 'storage-stats-tiles-before-rebuild-iphone-n10.png'),
  });

  await page.waitForFunction(
    async () => {
      const perf = window.__webWhisperPerf;
      if (!perf?.getStorageStats) return false;
      const stats = (await perf.getStorageStats()) as { usedBytesKnown?: boolean };
      return stats.usedBytesKnown === true;
    },
    undefined,
    { timeout: 120_000 }
  );

  await expect(chip).not.toHaveText(/Calculating/, { timeout: 60_000 });
  const chipAfter = (await chip.textContent())?.trim() ?? '';
  expect(chipAfter).not.toContain('8388608');
  expect(chipAfter).toMatch(/GB|MB/);

  await page.waitForFunction(
    async () => {
      const perf = window.__webWhisperPerf;
      if (!perf?.listSessions) return false;
      const listed = await perf.listSessions({ limit: 1, offset: 0 });
      const first = listed?.sessions?.[0] as { sizeBytes?: number } | undefined;
      return (first?.sizeBytes ?? 0) > 0;
    },
    undefined,
    { timeout: 120_000 }
  );

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Start recording' }).waitFor({ timeout: 120_000 });
  await expect(page.locator('.session-card').first().locator('.session-meta')).not.toContainText(
    '0 B',
    { timeout: 60_000 }
  );

  await page.locator('.data-chip').screenshot({
    path: resolve(qaDir, 'storage-stats-meter-iphone-n10.png'),
  });
  await page.locator('.session-card').first().screenshot({
    path: resolve(qaDir, 'storage-stats-tiles-after-rebuild-iphone-n10.png'),
  });
});

declare global {
  interface Window {
    __webWhisperPerf?: {
      importArchive: (blob: Blob) => Promise<unknown>;
      getStorageStats: () => Promise<unknown>;
      listSessions: (opts: { limit: number; offset: number }) => Promise<{
        sessions?: Array<{ sizeBytes?: number }>;
        error?: string;
      }>;
    };
    __wwStatsRebuildDelayMs?: number;
  }
}
