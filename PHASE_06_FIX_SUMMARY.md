# Phase 06 Fix: Import Real Packages (Not Stubs)

## Fixed Issues
✅ Deleted `apps/web-whisper-pwa/src/lib/*.ts` stub implementations
✅ Configured Vite and TypeScript to import the **real** packages from `packages/`
✅ Built TypeScript packages (capture-engine, playback-engine, volume-analyzer) to `dist/`
✅ All screens now use actual package imports via aliases

## Package Import Strategy
- **@session-store** → `packages/datastore/session-store/src/index.js` (JavaScript, no build needed)
- **@capture-engine** → `packages/lib/capture-engine/dist/index.js` (TypeScript, built from src/)
- **@playback-engine** → `packages/lib/playback-engine/dist/index.js` (TypeScript, built from src/)
- **@transcription-client** → `packages/lib/transcription-client/src/index.js` (JavaScript, no build needed)
- **@volume-analyzer** → `packages/lib/volume-analyzer/dist/index.js` (TypeScript, built from src/)

## Build Process
TypeScript packages were compiled using their own `npm run build` scripts:
\`\`\`bash
cd packages/lib/capture-engine && npm install && npm run build
cd packages/lib/playback-engine && npm install && npm run build
cd packages/lib/volume-analyzer && npm install && npm run build
\`\`\`

PWA installs lamejs (required by capture-engine):
\`\`\`bash
cd apps/web-whisper-pwa && npm install lamejs
\`\`\`

## Verification Commands
\`\`\`bash
# Verify no junk files committed
git ls-files | grep -E 'node_modules|/dist/'  # should be empty

# Verify lib/ stubs are deleted
git ls-files apps/web-whisper-pwa/src/lib  # should be empty

# Build PWA
cd apps/web-whisper-pwa
npm install
npm run build  # succeeds with 375KB bundle

# Run dev server
npm run dev  # starts at http://localhost:5173
\`\`\`

## Commits on Branch
- c34ad9a: Fix Phase 06: import real packages (not stubs)
- ec2c542: Merge origin/main to get real package implementations
- 3dc041a: Phase 06: implement web-whisper-pwa (uses real packages) [initial, had stubs]

## Branch
\`cursor/phase-06-pwa-real-packages-8822\`

## PR Instructions
Use GitHub web UI or CLI to create PR from \`cursor/phase-06-pwa-real-packages-8822\` to \`main\`.

Suggested PR title:
**Phase 06: Implement web-whisper-pwa (imports real packages)**

Suggested PR body:
See inline PR description provided above.
