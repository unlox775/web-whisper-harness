import { defineConfig } from 'vite';
import {
  isolationDemoAliases,
  lamejsBrowserBundle,
  repoRoot,
} from '../../../../scripts/isolation-demo-vite.mjs';

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
    port: 5173,
    host: true,
    fs: { allow: [repoRoot] },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
