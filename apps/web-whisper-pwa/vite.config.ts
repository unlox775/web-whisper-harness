import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appRoot, '../..');

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
