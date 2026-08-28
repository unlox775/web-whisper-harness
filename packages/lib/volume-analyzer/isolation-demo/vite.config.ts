import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const demoRoot = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(demoRoot, '..');

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@web-whisper/volume-analyzer': path.join(packageRoot, 'src/index.ts'),
    },
  },
  server: {
    port: 3000,
    host: true,
    fs: {
      allow: [path.resolve(packageRoot, '../..')],
    },
  },
});
