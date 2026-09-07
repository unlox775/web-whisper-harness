import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appRoot, '../..');

function gitOutput(args: string): string {
  try {
    return execSync(`git ${args}`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function packageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.join(appRoot, 'package.json'), 'utf8')) as {
      version?: unknown;
    };
    return typeof pkg.version === 'string' && pkg.version.trim() ? pkg.version.trim() : 'unknown';
  } catch {
    return 'unknown';
  }
}

const gitShaFull = gitOutput('rev-parse HEAD');
const gitShaShort = gitOutput('rev-parse --short HEAD');
const appVersion = packageVersion();
const buildTime = new Date().toISOString();

const buildIdentityDefine = {
  'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  'import.meta.env.VITE_GIT_SHA': JSON.stringify(gitShaShort || 'unknown'),
  'import.meta.env.VITE_GIT_SHA_FULL': JSON.stringify(gitShaFull || 'unknown'),
  'import.meta.env.VITE_BUILD_TIME': JSON.stringify(buildTime),
};

function lamejsBrowserBundle() {
  return {
    name: 'lamejs-browser-bundle',
    transform(code: string, id: string) {
      const normalized = id.replace(/\\/g, '/').split('?')[0]; // Remove query params
      if (!normalized.endsWith('/lamejs/lame.min.js') && !normalized.endsWith('/lamejs/lame.all.js')) {
        return null;
      }
      return {
        code: `${code}\nexport default lamejs;\n`,
        map: null,
      };
    },
  };
}

export default defineConfig({
  base: './',
  define: buildIdentityDefine,
  plugins: [react(), lamejsBrowserBundle()],
  resolve: {
    alias: {
      lamejs: path.join(appRoot, 'node_modules/lamejs/lame.min.js'),
      '@web-whisper/session-store': path.join(
        repoRoot,
        'packages/datastore/session-store/src/index.js'
      ),
      '@web-whisper/capture-engine': path.join(
        repoRoot,
        'packages/lib/capture-engine/src/index.ts'
      ),
      '@web-whisper/playback-engine': path.join(
        repoRoot,
        'packages/lib/playback-engine/src/index.ts'
      ),
      '@web-whisper/volume-analyzer': path.join(
        repoRoot,
        'packages/lib/volume-analyzer/src/index.ts'
      ),
      '@web-whisper/transcription-client': path.join(
        repoRoot,
        'packages/lib/transcription-client/src/index.js'
      ),
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
    exclude: ['lamejs'],
  },
  server: {
    port: 5173,
    host: true,
    fs: {
      allow: [repoRoot],
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'pwa-assets',
    emptyOutDir: true,
    sourcemap: true,
  },
});
