/**
 * Shared Vite resolve/plugins for Isolation Demos.
 * Demos may import capture-engine (lamejs) without their own node_modules.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pwaNm = path.join(repoRoot, 'apps/web-whisper-pwa/node_modules');

export { repoRoot, pwaNm };

export function lamejsBrowserBundle() {
  return {
    name: 'lamejs-browser-bundle',
    transform(code, id) {
      const normalized = id.replace(/\\/g, '/').split('?')[0];
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

export function isolationDemoAliases() {
  return {
    lamejs: path.join(pwaNm, 'lamejs/lame.min.js'),
    '@web-whisper/capture-engine': path.join(repoRoot, 'packages/lib/capture-engine/src/index.ts'),
    '@web-whisper/playback-engine': path.join(repoRoot, 'packages/lib/playback-engine/src/index.ts'),
    '@web-whisper/session-store': path.join(repoRoot, 'packages/datastore/session-store/src/index.js'),
    '@web-whisper/volume-analyzer': path.join(repoRoot, 'packages/lib/volume-analyzer/src/index.ts'),
    '@web-whisper/transcription-client': path.join(repoRoot, 'packages/lib/transcription-client/src/index.js'),
  };
}
