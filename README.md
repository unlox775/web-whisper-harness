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

**Phase 01 complete**: Harness installed, founder vision captured, slice-up alternatives proposed.

**Next**: Human chooses a slice-up philosophy, then Phase 02 scaffolds packages and customer relationships.

## Repository structure

```
docs/
  FOUNDER-vision.md          Detailed founder perspective and product goals
  SLICE-UP-plan.md           Alternative product-boundary philosophies
  VISUAL-BASELINE.md         Visual design and UI architecture baseline
  AI-PRODUCT-SLICE-HARNESS.md The multi-phase build process
  ai-product-slice-harness/  Harness helpers, runners, and config

subagents/                   Phase scripts and re-architecture helpers
Makefile                     Harness phase targets (see `make harness-help`)
```

After Phase 02, this structure will grow to include:

```
apps/                        Runnable applications (final PWA)
packages/
  ui/                        Substantial, independently valuable UI systems
  lib/                       Reusable behavior packages
  datastore/                 Durable data authorities with clear ownership
```

## Target device

**iPhone** as a Progressive Web App (Add to Home Screen). Desktop/web is backlog, not the default.

## Development

See [docs/AI-PRODUCT-SLICE-HARNESS.md](docs/AI-PRODUCT-SLICE-HARNESS.md) for the full process.

Quick harness commands:

```bash
make harness-help                    # Show all available targets
make watch                           # Start persistent phase watcher
HARNESS_COMMIT_DIRTY=1 make phase-2-5 # After Phase 02 scaffold
```

## Source repositories

- **This rebuild**: https://github.com/unlox775/web-whisper-harness
- **Original Web Whisper**: https://github.com/unlox775/web-whisper
- **Live PWA**: https://unlox775.github.io/web-whisper/
- **AI Product Slice Harness**: https://github.com/unlox775/ai-product-slice-harness
