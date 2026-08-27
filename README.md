# Web Whisper — Ground-Up Rebuild

This repository is a from-scratch rebuild of [Web Whisper](https://github.com/unlox775/web-whisper) using the [AI Product Slice Harness](docs/AI-PRODUCT-SLICE-HARNESS.md).

## What is Web Whisper?

Web Whisper is a trustworthy long-form audio recorder for iPhone (Progressive Web App) that:

- **Records** spoken audio with one tap and persists chunks immediately (~4s each) so you never lose a recording
- **Plays** back sessions, chunks, and snips to prove the recording exists
- **Transcribes** speech to text via Groq Whisper (optional; works as a recorder even without an API key)
- **Segments** recordings into snips based on volume profiles for manageable transcription
- **Diagnoses** capture issues when things go wrong (developer mode)

The existing live PWA at [https://unlox775.github.io/web-whisper/](https://unlox775.github.io/web-whisper/) and its documentation are the **behavioral and visual source of truth**. This rebuild preserves the theme, visual identity, and overall look while replacing the architecture.

## Why rebuild?

The original Web Whisper proves that browser-based long-form recording can be trustworthy. This rebuild uses product slicing to:

- Make the capture, storage, playback, and transcription pipelines independently testable
- Create package-local Isolation Demos so each piece can be proven before final integration
- Support phased parallel agent development with clear product boundaries
- Maintain the calm, immediate, durable feel of the original while making the architecture extensible

## Project status

**Phase 06 complete**: The Web Whisper PWA is assembled from the lib packages and session-store, and `make build` publishes it to `docs/` for GitHub Pages.

## Repository structure

```
docs/                        GitHub Pages docroot (PWA + harness markdown)
  index.html                 Published PWA
  pwa-assets/                Built JS/CSS
  FOUNDER-vision.md          Detailed founder perspective and product goals
  SLICE-UP-plan.md           Alternative product-boundary philosophies
  VISUAL-BASELINE.md         Visual design and UI architecture baseline
  AI-PRODUCT-SLICE-HARNESS.md The multi-phase build process
  ai-product-slice-harness/  Harness helpers, runners, and config

apps/web-whisper-pwa         Source for the iPhone PWA
packages/
  lib/                       Capture, playback, volume, transcription
  datastore/                 session-store (IndexedDB)

Makefile                     `make start` / `make build` plus harness targets
```

## Target device

**iPhone** as a Progressive Web App (Add to Home Screen). Desktop/web is backlog, not the default.

## Development

The runnable PWA lives in `apps/web-whisper-pwa`. GitHub Pages is served from the repository `docs/` folder (existing harness docs stay there; the app is published beside them).

```bash
make start    # local Vite server
make build    # production build → docs/ (GitHub Pages docroot)
make harness-help
```

See [docs/AI-PRODUCT-SLICE-HARNESS.md](docs/AI-PRODUCT-SLICE-HARNESS.md) for the full process.

## Source repositories

- **This rebuild**: https://github.com/unlox775/web-whisper-harness
- **Original Web Whisper**: https://github.com/unlox775/web-whisper
- **Live PWA**: https://unlox775.github.io/web-whisper/
- **AI Product Slice Harness**: https://github.com/unlox775/ai-product-slice-harness
