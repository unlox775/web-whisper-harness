Spec Status: resolved
Spec Type: feedback
Created: 2026-09-07T06:05:00Z
Updated: 2026-09-07T06:25:00Z
Resolved: 2026-09-07T06:25:00Z
Product: apps/web-whisper-pwa

# Feedback: Settings shows build commit / version

## User Feedback

Dave runs Web Whisper as an iOS home-screen PWA. Clearing Safari Website Data would wipe IndexedDB sessions — he will not do that just to pick up a new GitHub Pages build.

He needs a visible **build / Git commit / version** in Settings so he can tell whether the installed PWA includes work such as “Include snips + transcripts (debug)” without nuking data.

Today Settings has no identity line. After a `make build` deploy, there is no in-app way to confirm the running commit.

## Requested Outcome

### 1. Inject build identity at Vite / `make build`

At PWA build time (`apps/web-whisper-pwa`, invoked by root `make build`):

- package.json `version` (currently `0.1.0`)
- short git SHA (`git rev-parse --short HEAD`); full SHA if cheap
- ISO build timestamp

Prefer Vite `define` / `import.meta.env` (`VITE_APP_VERSION`, `VITE_GIT_SHA`, `VITE_BUILD_TIME`) set from `vite.config.ts` via `execSync` git.

Do **not** invent a fake SHA. If git is missing or the command fails, the fallback label must be obviously `unknown`.

### 2. Settings UI

In `SettingsModal.tsx` under the **App** section (footer of that section is fine):

- Small muted line(s), e.g.
  - `Version 0.1.0`
  - `Build <shortsha>` (or `Build unknown`)
  - optional `Built <local-friendly or ISO date>`
- Readable on iPhone (~390px). No clutter. Not a marketing badge.

### 3. Publish

Run **`make build`** from the repo root so `docs/` Pages artifacts update (new hashed `pwa-assets/` + `index.html`). That new asset hash is itself proof of a new deploy.

### iPhone-first proof

Screenshot Settings showing the new lines (iPhone DevTools ~390px or device). Required before marking resolved.

## Notes For Phase 07

- Keep changes scoped to `apps/web-whisper-pwa` plus published `docs/` PWA artifacts.
- Cursor Cloud Agent only — never Codex.
- Write this spec and resolve it in the same implementation PR.
- Do **not** mark this spec resolved until Settings shows version + commit on a fresh `make build` and a screenshot exists.

## Out of scope

- Service worker / update prompt (a one-line “open in Safari to refresh” help under the version is optional and not required)
- Clearing storage / cache UI
- Snip algorithm
- Changing export defaults

## Resolution Criteria

Mark this spec resolved when:

- [x] Vite build injects version, git SHA (or `unknown`), and build time
- [x] Settings **App** section shows muted Version / Build / Built lines
- [x] Fallback is `unknown` — never a fabricated SHA
- [x] iPhone DevTools screenshot of Settings showing the new lines
- [x] `make build` published `docs/` PWA artifacts
- [x] Spec updated with a Resolution section documenting what shipped

## Resolution

**Resolved:** 2026-09-07T06:25:00Z on branch `cursor/settings-build-commit-version-d1ab` (draft PR).

### What shipped

- `apps/web-whisper-pwa/vite.config.ts` injects via Vite `define`:
  - `import.meta.env.VITE_APP_VERSION` from `package.json` (`0.1.0`)
  - `import.meta.env.VITE_GIT_SHA` / `VITE_GIT_SHA_FULL` from `git rev-parse --short HEAD` / `HEAD`
  - `import.meta.env.VITE_BUILD_TIME` ISO timestamp
  - Git missing or empty → `unknown` (never a fabricated SHA)
- Settings **App** section footer (`SettingsModal.tsx`) renders muted `Version` / `Build` / `Built` lines via `buildIdentity.ts`.
- Unit tests cover unknown fallback and line formatting (`src/buildIdentity.test.ts`).
- `make build` refreshed `docs/` PWA artifacts only (`index.html`, `pwa-assets/`). New hashed bundle: `docs/pwa-assets/index-DLqeZ9Uc.js`.

### Baked identity in this publish

- Version `0.1.0`
- Build `3dfe949` (`3dfe9491b4f9fc5cebd7ba79cede00cd3b9cdd77`)
- Built `2026-09-07T06:07:46.049Z` (Settings shows local-friendly `Built Today at 6:07 AM`)

### Proof shot (iPhone 12 Pro DevTools, 390×844)

- `documentation/qa/settings-build-commit-version.png`
- Notes: `documentation/qa/settings-build-commit-version.md`

### Untouched

Service worker / update prompt, storage-clear UI, snip algorithm, export defaults.
