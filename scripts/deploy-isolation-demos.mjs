/**
 * Build package Isolation Demos and publish them under docs/isolation-demos/
 * for GitHub Pages. Uses the PWA's Vite / React so isolation-demo folders do
 * not need their own node_modules.
 */
import { mkdir, rm, writeFile, access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isolationDemoAliases, lamejsBrowserBundle, repoRoot } from './isolation-demo-vite.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pwaDir = join(root, 'apps/web-whisper-pwa');
const pwaNm = join(pwaDir, 'node_modules');
const docsIsolation = join(root, 'docs/isolation-demos');

const DEMOS = [
  {
    id: 'capture-engine',
    title: 'Capture Engine',
    root: join(root, 'packages/lib/capture-engine/isolation-demo'),
    react: false,
    storage: 'In-memory only (no IndexedDB / localStorage)',
    namespace: 'web-whisper-isolation-demo-capture-engine',
    blurb: 'Live mic (primary) or simulated PCM. Real capture-engine, MP3 chunks in RAM until Reset.',
  },
  {
    id: 'playback-engine',
    title: 'Playback Engine',
    root: join(root, 'packages/lib/playback-engine/isolation-demo'),
    react: false,
    storage: 'Live chunks in RAM; optional fixture blobs (no store writes)',
    namespace: 'web-whisper-isolation-demo-playback-engine',
    blurb: 'Record live audio then play it. Fixture session/chunk/snip remains optional.',
  },
  {
    id: 'volume-analyzer',
    title: 'Volume Analyzer',
    root: join(root, 'packages/lib/volume-analyzer/isolation-demo'),
    react: true,
    storage: 'Live/fixture chunks in RAM; tuner settings in isolated IndexedDB',
    namespace: 'web-whisper-volume-analyzer-demo-db',
    blurb: 'Live mic → volume profile + snip proposals (in-memory). Fixtures optional. Isolated tuner DB.',
  },
  {
    id: 'transcription-client',
    title: 'Transcription Client',
    root: join(root, 'packages/lib/transcription-client/isolation-demo'),
    react: false,
    storage: 'No persistence (API key stays in the input)',
    namespace: 'ww-iso-transcription-client:',
    blurb: 'Record live audio then transcribe (mock or real Groq). Fixture blob optional. No PWA keys.',
  },
  {
    id: 'session-store',
    title: 'Session Store',
    root: join(root, 'packages/datastore/session-store/isolation-demo'),
    react: false,
    storage: 'Sandbox IndexedDB only',
    namespace: 'web-whisper-isolation-demo-session-store',
    blurb: 'Live mic chunks flush into the sandbox DB. Never opens web-whisper-db.',
  },
];

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function pwaEsm(relPath) {
  return pathToFileURL(join(pwaNm, relPath)).href;
}

if (!(await exists(join(pwaNm, 'vite/dist/node/index.js')))) {
  throw new Error('PWA node_modules/vite missing. Run make install / make build first.');
}

const { build } = await import(pwaEsm('vite/dist/node/index.js'));
const { default: react } = await import(pwaEsm('@vitejs/plugin-react/dist/index.js'));
const compactMobileCss = await readFile(
  join(root, 'packages/isolation-demo-shared/compact-mobile.css'),
  'utf8'
);

function indexHtml() {
  const cards = DEMOS.map(
    (demo) => `      <a class="card" href="./${demo.id}/">
        <h2>${demo.title}</h2>
        <p>${demo.blurb}</p>
        <dl>
          <div><dt>Storage</dt><dd>${demo.storage}</dd></div>
          <div><dt>Namespace</dt><dd><code>${demo.namespace}</code></dd></div>
        </dl>
        <span class="open">Open demo</span>
      </a>`
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0a0f18" />
  <title>Web Whisper Isolation Demos</title>
  <style>
    :root {
      --bg: #0a0f18;
      --card: #111a26;
      --border: rgba(255,255,255,0.08);
      --text: #f3f6fb;
      --muted: #9aa8b8;
      --accent: #22d3ee;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      min-height: 100dvh;
      padding: 20px 16px calc(24px + env(safe-area-inset-bottom));
    }
    header { margin-bottom: 20px; }
    .kicker {
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent);
      font-weight: 700;
      margin: 0 0 8px;
    }
    h1 { font-size: 28px; margin: 0 0 8px; }
    .lead { color: var(--muted); margin: 0 0 16px; line-height: 1.45; }
    .back {
      color: var(--accent);
      font-weight: 600;
      text-decoration: none;
    }
    .grid { display: flex; flex-direction: column; gap: 12px; }
    .card {
      display: block;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 16px;
      color: inherit;
      text-decoration: none;
    }
    .card h2 { margin: 0 0 8px; font-size: 18px; }
    .card p { margin: 0 0 12px; color: var(--muted); font-size: 14px; line-height: 1.45; }
    dl { margin: 0 0 12px; }
    dl div { margin-bottom: 8px; }
    dt { font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
    dd { margin: 2px 0 0; font-size: 13px; }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      word-break: break-all;
      color: var(--accent);
    }
    .open { color: var(--accent); font-weight: 700; font-size: 14px; }
    .note {
      margin-top: 20px;
      font-size: 13px;
      color: var(--muted);
      line-height: 1.45;
    }
    ${compactMobileCss}
  </style>
</head>
<body>
  <header>
    <p class="kicker">Factory floor</p>
    <h1>Isolation Demos</h1>
    <p class="lead">Package-local HTML stacks with live microphone capture. Each demo uses its own storage namespace so it cannot corrupt PWA sessions or other demos. Capture stays in-memory; session-store writes only to its sandbox DB.</p>
    <a class="back" href="../">← Web Whisper PWA</a>
  </header>
  <main class="grid">
${cards}
  </main>
  <p class="note">Published with <code>make build</code> to GitHub Pages. IndexedDB names and localStorage prefixes are distinct from production <code>web-whisper-db</code>.</p>
</body>
</html>
`;
}

await rm(docsIsolation, { recursive: true, force: true });
await mkdir(docsIsolation, { recursive: true });

for (const demo of DEMOS) {
  if (!(await exists(join(demo.root, 'index.html')))) {
    throw new Error(`Isolation demo missing index.html at ${demo.root}`);
  }
  console.log(`Building isolation demo: ${demo.id}`);
  const aliases = {
    ...isolationDemoAliases(),
    ...(demo.react
      ? {
          react: join(pwaNm, 'react'),
          'react-dom': join(pwaNm, 'react-dom'),
          'react/jsx-runtime': join(pwaNm, 'react/jsx-runtime.js'),
          'react/jsx-dev-runtime': join(pwaNm, 'react/jsx-dev-runtime.js'),
        }
      : {}),
  };
  await build({
    configFile: false,
    root: demo.root,
    base: './',
    plugins: [...(demo.react ? [react()] : []), lamejsBrowserBundle()],
    resolve: {
      alias: aliases,
      dedupe: demo.react ? ['react', 'react-dom'] : [],
    },
    optimizeDeps: {
      exclude: ['lamejs'],
    },
    server: {
      fs: { allow: [repoRoot] },
    },
    build: {
      outDir: join(docsIsolation, demo.id),
      emptyOutDir: true,
      assetsDir: 'assets',
      sourcemap: false,
    },
    logLevel: 'warn',
  });
}

await writeFile(join(docsIsolation, 'index.html'), indexHtml());

for (const demo of DEMOS) {
  const page = join(docsIsolation, demo.id, 'index.html');
  if (!(await exists(page))) {
    throw new Error(`Expected published demo at ${page}`);
  }
}

const indexPath = join(docsIsolation, 'index.html');
if (!(await exists(indexPath))) {
  throw new Error(`Expected isolation demos index at ${indexPath}`);
}

console.log('Published Isolation Demos to docs/isolation-demos/ (GitHub Pages)');
