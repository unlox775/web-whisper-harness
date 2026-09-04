# Cursor Cloud Agent Runner (Replaces Codex)

This repository uses **Cursor Cloud Agents** as the phase runner instead of Codex.

## Why Cloud Agents?

The stock AI Product Slice Harness uses Codex (`codex exec`) to run phase agents. This repository replaces Codex with Cursor Cloud Agents for the following reasons:

- **Code Monkey / Cursor Cloud Agents** are the preferred AI tooling for this project
- **One cloud agent per scoped job** (e.g., one agent for Phase 03 session-store, one agent for Phase 03 capture-engine)
- **Merge to main between rounds** (each phase agent works on the same branch, commits changes, pushes to PR; human reviews and merges before next phase)
- **Never Codex** (Codex is not used in this workflow)

## Phase Workflow

### Phase 03: Product Specs (6 agents, one per product)

Each agent reads the founder vision, slice-up plan, and its product's stub spec, then expands it into a complete workable spec.

**Prompt files** (one markdown file per agent):
- `docs/ai-product-slice-harness/cloud-agents/phase-03-session-store.md`
- `docs/ai-product-slice-harness/cloud-agents/phase-03-capture-engine.md`
- `docs/ai-product-slice-harness/cloud-agents/phase-03-volume-analyzer.md`
- `docs/ai-product-slice-harness/cloud-agents/phase-03-transcription-client.md`
- `docs/ai-product-slice-harness/cloud-agents/phase-03-playback-engine.md`
- `docs/ai-product-slice-harness/cloud-agents/phase-03-web-whisper-pwa.md`

**How to run**:
1. Launch 6 Cursor Cloud Agents in parallel (one per product)
2. Copy/paste the markdown prompt file content into each agent's initial prompt
3. Wait for all agents to complete (each commits its changes to the same branch)
4. Review all commits, test locally if needed, merge to main

### Phase 04: Customer Requests (N agents, one per consumer→producer relationship)

Each agent reads the customer docs and writes the customer's request to the producer.

**Prompt files** (to be generated after Phase 03 completes):
- `docs/ai-product-slice-harness/cloud-agents/phase-04-*.md` (one per relationship)

**How to run**:
1. Launch N Cursor Cloud Agents in parallel (one per relationship)
2. Copy/paste the markdown prompt file content into each agent's initial prompt
3. Wait for all agents to complete (each commits its changes to the same branch)
4. Review all commits, merge to main

### Phase 05: Producer Responses (N agents, one per producer)

Each agent reads all customer requests for its product and writes the producer's response.

**Prompt files** (to be generated after Phase 04 completes):
- `docs/ai-product-slice-harness/cloud-agents/phase-05-*.md` (one per producer)

**How to run**:
1. Launch N Cursor Cloud Agents in parallel (one per producer)
2. Copy/paste the markdown prompt file content into each agent's initial prompt
3. Wait for all agents to complete (each commits its changes to the same branch)
4. Review all commits, merge to main

### Phase 06: First Implementation (6 agents, one per product, sequential)

Each agent reads its product spec and implements the code (library interfaces, Isolation Demo, PWA screens).

**Prompt files** (to be generated after Phase 05 completes):
- `docs/ai-product-slice-harness/cloud-agents/phase-06-*.md` (one per product, in dependency order)

**How to run** (SEQUENTIAL, not parallel):
1. Launch agent for `session-store` (no dependencies)
2. Wait for completion, review, merge to main
3. Launch agents for `capture-engine`, `volume-analyzer`, `transcription-client`, `playback-engine` (depend on session-store)
4. Wait for completion, review, merge to main
5. Launch agent for `web-whisper-pwa` (depends on all lib packages + session-store)
6. Wait for completion, review, merge to main

### Phase 07: Iterate (N agents, one per feedback spec, on-demand)

When a feedback spec is created (e.g., `packages/lib/capture-engine/docs/specs/20260827120000-fix-mic-ghost-detection.md`), launch a cloud agent to implement the change.

**Prompt files** (generated on-demand per feedback spec):
- `docs/ai-product-slice-harness/cloud-agents/phase-07-*.md` (one per feedback spec)

**How to run** (on-demand):
1. Human writes feedback spec (lists what to fix/change)
2. Launch Cursor Cloud Agent for that spec
3. Wait for completion, review, merge to main

#### Phase 07-02 roster (specs + prompts only)

Roster: `docs/PHASE-07-02.md`. Five unresolved feedback specs. **Serial:** stall detection (1) before PWA durability (2). **Parallel:** volume loudness (3), snips text (4), histogram playhead (5) with each other (and with 1 if careful).

| Spec | Product | Prompt |
| --- | --- | --- |
| Mid-stream stall detection | `packages/lib/capture-engine` | `docs/ai-product-slice-harness/cloud-agents/phase-07-ongoing-audio-stream-stall-detection.md` |
| Recording durability UX | `apps/web-whisper-pwa` | `docs/ai-product-slice-harness/cloud-agents/phase-07-recording-durability-ux.md` |
| Playback volume loudness | `packages/lib/playback-engine` | `docs/ai-product-slice-harness/cloud-agents/phase-07-playback-volume-loudness.md` |
| Snips list transcript text | `apps/web-whisper-pwa` | `docs/ai-product-slice-harness/cloud-agents/phase-07-snips-list-transcript-text.md` |
| Histogram playhead | `apps/web-whisper-pwa` | `docs/ai-product-slice-harness/cloud-agents/phase-07-histogram-playhead.md` |

Implementers must use Cursor Cloud Agents (not Codex). PWA UI specs need iPhone DevTools screenshot proof before marking resolved, then `make build` before push.

#### Phase 07-03 roster (specs + prompts only)

Roster: `docs/PHASE-07-03.md`. Five unresolved feedback specs. **Serial:** session-store archive APIs (1) first. **Parallel after 1:** PWA Export Session (2), playback demo upload (3), volume-analyzer demo upload (4), transcription demo upload (5).

| Spec | Product | Prompt |
| --- | --- | --- |
| Session audio archive export/import | `packages/datastore/session-store` | `docs/ai-product-slice-harness/cloud-agents/phase-07-session-audio-archive-export-import.md` |
| Debug Export Session download | `apps/web-whisper-pwa` | `docs/ai-product-slice-harness/cloud-agents/phase-07-debug-export-session-download.md` |
| Isolation Demo archive as play source | `packages/lib/playback-engine` | `docs/ai-product-slice-harness/cloud-agents/phase-07-playback-upload-session-archive.md` |
| Isolation Demo archive as analyze source | `packages/lib/volume-analyzer` | `docs/ai-product-slice-harness/cloud-agents/phase-07-volume-analyzer-upload-session-archive.md` |
| Isolation Demo archive as transcribe source | `packages/lib/transcription-client` | `docs/ai-product-slice-harness/cloud-agents/phase-07-transcription-upload-session-archive.md` |

Implementers must use Cursor Cloud Agents (not Codex). PWA UI spec (2) needs iPhone DevTools screenshot proof before marking resolved, then `make build` before push. Specs 3–5 consume `parseSessionArchive` and must not reimplement the zip format.

## Makefile Integration

The `Makefile` targets for Phase 03–07 have been modified to **print the cloud-agent prompt paths** and **refuse to call Codex** (clear error). This prevents accidental Codex invocations and reminds the human to launch Cursor Cloud Agents instead.

**Example**:
```sh
$ make phase-3
Phase 03: Product Specs (6 agents, one per product)

Cursor Cloud Agent prompts:
  docs/ai-product-slice-harness/cloud-agents/phase-03-session-store.md
  docs/ai-product-slice-harness/cloud-agents/phase-03-capture-engine.md
  docs/ai-product-slice-harness/cloud-agents/phase-03-volume-analyzer.md
  docs/ai-product-slice-harness/cloud-agents/phase-03-transcription-client.md
  docs/ai-product-slice-harness/cloud-agents/phase-03-playback-engine.md
  docs/ai-product-slice-harness/cloud-agents/phase-03-web-whisper-pwa.md

Launch 6 Cursor Cloud Agents in parallel. Copy/paste each prompt file content into each agent.

ERROR: This repository uses Cursor Cloud Agents, not Codex.
Do NOT run `codex exec`. Launch Cursor Cloud Agents manually instead.
```

## Summary

- **Phase runner**: Cursor Cloud Agents (not Codex)
- **One agent per scoped job**: Phase 03 (6 agents), Phase 04 (N agents), Phase 05 (N agents), Phase 06 (6 agents), Phase 07 (on-demand)
- **Merge between rounds**: Each phase agent commits, pushes; human reviews and merges before next phase
- **Prompt files**: Under `docs/ai-product-slice-harness/cloud-agents/` (one markdown file per agent with full scoped prompt)
- **Makefile targets**: Print cloud-agent prompt paths, refuse to call Codex
