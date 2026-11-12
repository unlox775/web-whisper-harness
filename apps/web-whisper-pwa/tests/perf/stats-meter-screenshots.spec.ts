import { test, expect } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const cacheDir = resolve(here, '.cache');
const qaDir = resolve(repoRoot, 'documentation/qa');
const zipPath = resolve(cacheDir, 'synthetic-session-357x4s.zip');

test('storage DATA meter screenshots (iPhone 13)', async ({ page }) => {
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
      localStorage.setItem('storage_cap_mb', '500');
      localStorage.setItem('onboarding_dismissed', 'true');
    } catch {
      // ignore
    }
  });
  await page.goto('/?perfHarness=1&simulate=1');
  await page.getByRole('button', { name: 'Start recording' }).waitFor({ timeout: 120_000 });

  await page.evaluate(async () => {
    const perf = window.__webWhisperPerf;
    if (!perf) throw new Error('perf harness missing');
    const resp = await fetch('/perf-synthetic-session.zip');
    const blob = await resp.blob();
    for (let i = 0; i < 3; i += 1) {
      await perf.importArchive(blob);
    }
  });

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

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.data-chip .value').waitFor({ timeout: 60_000 });
  const chipMid = (await page.locator('.data-chip .value').textContent())?.trim() ?? '';
  expect(chipMid).toMatch(/Calculating/);
  expect(chipMid).not.toContain('8388608');
  await page.screenshot({
    path: resolve(qaDir, 'storage-stats-calculating-iphone.png'),
    fullPage: false,
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
  const chipAfter = (await page.locator('.data-chip .value').textContent())?.trim() ?? '';
  expect(chipAfter).not.toMatch(/Calculating/);
  expect(chipAfter).not.toContain('8388608');
  await page.screenshot({
    path: resolve(qaDir, 'storage-stats-meter-iphone-n100.png'),
    fullPage: false,
  });
});

declare global {
  interface Window {
    __webWhisperPerf?: {
      importArchive: (blob: Blob) => Promise<unknown>;
      getStorageStats: () => Promise<unknown>;
    };
  }
}
