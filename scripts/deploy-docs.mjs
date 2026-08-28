import { cp, rm, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'apps/web-whisper-pwa/dist');
const docs = join(root, 'docs');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(dist))) {
  throw new Error(`PWA dist missing at ${dist}. Run the Vite build first.`);
}

await rm(join(docs, 'pwa-assets'), { recursive: true, force: true });
await cp(join(dist, 'index.html'), join(docs, 'index.html'));

if (await exists(join(dist, 'pwa-assets'))) {
  await cp(join(dist, 'pwa-assets'), join(docs, 'pwa-assets'), { recursive: true });
}

const publishNames = [
  'manifest.json',
  'icons',
  'apple-touch-icon.png',
  'favicon.png',
  'favicon.ico',
];

for (const name of publishNames) {
  const from = join(dist, name);
  if (await exists(from)) {
    await rm(join(docs, name), { recursive: true, force: true });
    await cp(from, join(docs, name), { recursive: true });
  }
}

await writeFile(join(docs, '.nojekyll'), '');
// Isolation Demos are published separately by scripts/deploy-isolation-demos.mjs
// into docs/isolation-demos/. Do not delete that tree here.
console.log('Published PWA to docs/ (GitHub Pages docroot)');
