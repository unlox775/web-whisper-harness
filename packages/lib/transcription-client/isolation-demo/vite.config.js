import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import {
  isolationDemoAliases,
  lamejsBrowserBundle,
  repoRoot,
} from '../../../../scripts/isolation-demo-vite.mjs';

const demoRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  plugins: [lamejsBrowserBundle()],
  resolve: {
    alias: isolationDemoAliases(),
  },
  optimizeDeps: {
    exclude: ['lamejs'],
  },
  server: {
    host: true,
    fs: { allow: [repoRoot] },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.join(demoRoot, 'index.html'),
        'context-chain': path.join(demoRoot, 'context-chain.html'),
      },
    },
  },
});
