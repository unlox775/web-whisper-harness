import { defineConfig, devices } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pwaRoot = resolve(here, '../..');
const port = Number(process.env.PERF_PORT || 4173);
const baseURL = process.env.PERF_BASE_URL || `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: here,
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45 * 60 * 1000,
  expect: { timeout: 60_000 },
  reporter: [['list'], ['json', { outputFile: resolve(here, '.cache/playwright-results.json') }]],
  outputDir: resolve(here, '.cache/test-output'),
  use: {
    ...devices['iPhone 13'],
    baseURL,
    browserName: 'chromium',
    headless: true,
    ignoreHTTPSErrors: true,
    trace: 'off',
    video: 'off',
    launchOptions: {
      args: ['--disable-features=StoragePressureReclamation'],
    },
  },
  webServer: process.env.PERF_BASE_URL
    ? undefined
    : {
        command: `npm run preview -- --host --port ${port}`,
        cwd: pwaRoot,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
