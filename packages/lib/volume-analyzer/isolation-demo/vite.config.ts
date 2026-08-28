import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {
  isolationDemoAliases,
  lamejsBrowserBundle,
  repoRoot,
} from '../../../../scripts/isolation-demo-vite.mjs';

export default defineConfig({
  base: './',
  plugins: [react(), lamejsBrowserBundle()],
  resolve: {
    alias: isolationDemoAliases(),
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    exclude: ['lamejs'],
  },
  server: {
    port: 3000,
    host: true,
    fs: { allow: [repoRoot] },
  },
});
