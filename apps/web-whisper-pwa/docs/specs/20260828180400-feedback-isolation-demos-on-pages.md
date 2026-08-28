Spec Status: resolved
Spec Type: feedback
Created: 2026-08-28T18:04:00Z
Resolved: 2026-08-28T18:30:00Z
Product: apps/web-whisper-pwa

# Feedback: Isolation Demos on GitHub Pages

## User Feedback (Dave, 2026-08-28)

He wants to view Isolation Demos as part of the regular GitHub Pages deploy. They are HTML stacks using browser-side storage. Isolation means isolation — demos should NOT share IndexedDB/localStorage with the PWA or each other (unless a demo truly depends on live capture audio from the capture demo for showcase; capture demo itself stays in-memory only per earlier decisions).

Entry point: debug mode / Settings / ladybug — a button that opens the isolation demos index.

## Requested Outcome

- Publish each package's isolation-demo under `docs/` (e.g. `docs/isolation-demos/` with an index + per-package pages). Wire `make build` so they ship with GitHub Pages at https://unlox775.github.io/web-whisper-harness/
- Index page listing capture, playback, volume-analyzer, transcription, session-store demos (whatever exists).
- Each demo uses a distinct storage namespace / DB name so playing with demos cannot corrupt real PWA sessions.
- PWA: in developer mode (Settings and/or ladybug), add a clear button/link **Isolation Demos** that navigates to the Pages path (relative `isolation-demos/` or absolute github.io path).
- iPhone 1170×2532 shots: (1) Settings/debug entry to Isolation Demos, (2) demos index on Pages. `documentation/qa/` + PR body.
- Keep PR **draft**. Do not merge.

## Out of Scope

- Session-detail copy UX
- Recording overlay Stop layout
- Snip algorithm defaults
- `node_modules`

## Storage Isolation Contract

GitHub Pages is same-origin (`https://unlox775.github.io`), so path is not isolation. Each surface must use a distinct IndexedDB name / localStorage key prefix:

| Surface | Persistence | Namespace |
|---|---|---|
| PWA | IndexedDB + localStorage | IndexedDB `web-whisper-db`; keys `groq_api_key`, `developer_mode_enabled`, … |
| capture-engine demo | In-memory only | Reserved `web-whisper-isolation-demo-capture-engine` (unused; no IDB / localStorage writes) |
| playback-engine demo | In-memory fixtures | Reserved `web-whisper-isolation-demo-playback-engine` (unused; fixture RAM only) |
| volume-analyzer demo | Fixture chunks in RAM; tuner settings in isolated IndexedDB | IndexedDB `web-whisper-volume-analyzer-demo-db` (live-capture toggle stays unimplemented) |
| transcription-client demo | None | Reserved prefix `ww-iso-transcription-client:` (API key stays in the input; not written to PWA keys) |
| session-store demo | Sandbox IndexedDB | IndexedDB `web-whisper-isolation-demo-session-store`; sessionStorage `ww-iso-session-store:*` |

No demo opens `web-whisper-db`. Capture remains in-memory. Volume-analyzer does not share capture-demo storage.

## Implementation Notes

- `make build` publishes PWA to `docs/` then isolation demos to `docs/isolation-demos/<package>/` plus `docs/isolation-demos/index.html`.
- Demo Vite `base` is `./` so nested Pages paths resolve assets.
- Isolation Demos link is gated on developer mode: Settings App section + ladybug Developer Console.
- Href is relative `isolation-demos/` from the published PWA (`docs/index.html`). Canonical URL: https://unlox775.github.io/web-whisper-harness/isolation-demos/
- QA helper: `?screenshot=isolation-settings` opens Settings with developer mode enabled.

## QA Shots Required (1170×2532, `documentation/qa/`)

- [x] `isolation-demos-settings-entry.png` — Settings (developer mode on) showing Isolation Demos control
- [x] `isolation-demos-index.png` — Pages index listing the five package demos

## Resolution Criteria

Mark resolved when:

- [x] `make build` publishes `docs/isolation-demos/index.html` and per-package pages
- [x] Index lists capture, playback, volume-analyzer, transcription, session-store
- [x] Session-store demo uses a DB name other than `web-whisper-db`
- [x] Other demos do not write PWA storage
- [x] Developer-mode Settings and ladybug expose Isolation Demos
- [x] iPhone 1170×2532 shots in `documentation/qa/` and PR body
- [x] Session detail, recording Stop layout, and snip defaults untouched
- [x] PR kept draft

## Resolution

Shipped on branch `cursor/isolation-demos-on-pages-7e5a` (PR draft #23).

### What changed

- `scripts/deploy-isolation-demos.mjs` builds each package isolation-demo with the PWA’s Vite/React and publishes to `docs/isolation-demos/`.
- `Makefile` `build` target runs that script after PWA `deploy-docs`.
- Session-store isolation demo uses IndexedDB `web-whisper-isolation-demo-session-store` and prefixed sessionStorage keys.
- PWA Settings (developer mode) and ladybug Developer Console link to the Isolation Demos index via `isolationDemosHref()`.
- Spec + QA report under `documentation/qa/`.

### Proof shots (1170×2532)

![Settings entry to Isolation Demos](../../../documentation/qa/isolation-demos-settings-entry.png)

![Isolation Demos index on Pages](../../../documentation/qa/isolation-demos-index.png)

### Verification

- Interactive iPhone viewport pass: developer-mode gate, Settings + ladybug entry, index cards, Capture IN-MEMORY, Session Store sandbox DB name.
- `make build` publishes PWA + `docs/isolation-demos/`.
- Session detail, recording Stop layout, and snip defaults untouched.
