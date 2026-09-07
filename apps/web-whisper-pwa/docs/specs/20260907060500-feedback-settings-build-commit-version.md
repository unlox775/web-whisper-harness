Spec Status: unresolved
Spec Type: feedback
Created: 2026-09-07T06:05:00Z
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

- [ ] Vite build injects version, git SHA (or `unknown`), and build time
- [ ] Settings **App** section shows muted Version / Build / Built lines
- [ ] Fallback is `unknown` — never a fabricated SHA
- [ ] iPhone DevTools screenshot of Settings showing the new lines
- [ ] `make build` published `docs/` PWA artifacts
- [ ] Spec updated with a Resolution section documenting what shipped
