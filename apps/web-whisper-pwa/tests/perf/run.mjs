#!/usr/bin/env node
/**
 * Generate the synthetic archive, build the PWA, install Chromium if needed,
 * and run the Playwright scale harness.
 *
 *   npm run test:perf
 *
 * Env:
 *   PERF_CHUNK_COUNT     default 357
 *   PERF_N               default 0,10,20,50,100
 *   PERF_RECORD_SECONDS  default 60
 *   PERF_CPU_THROTTLE    default 4
 *   PERF_SKIP_BUILD      1 to reuse dist/
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const pwaRoot = resolve(here, '../..');

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: pwaRoot,
    stdio: 'inherit',
    env: process.env,
    ...opts,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(process.execPath, [resolve(here, 'generate-synthetic-archive.mjs')]);

if (process.env.PERF_SKIP_BUILD !== '1' || !existsSync(resolve(pwaRoot, 'dist/index.html'))) {
  run('npm', ['run', 'build']);
}

run('npx', ['playwright', 'install', 'chromium']);
run('npx', [
  'playwright',
  'test',
  '-c',
  resolve(here, 'playwright.config.ts'),
]);
