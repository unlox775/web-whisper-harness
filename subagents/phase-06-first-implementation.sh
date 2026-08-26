#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/docs/ai-product-slice-harness/subagent-runner.sh"

start_phase "phase-06-first-implementation"
set_phase_context "$*"

require_phase_successes "phase-05-producer-responses" \
  "session-store" \
  "capture-engine" \
  "volume-analyzer" \
  "transcription-client" \
  "playback-engine" \
  "web-whisper-pwa"

require_phase_ready "Phase 05 has succeeded. Phase 06 is intentionally gated for human review of the completed specs and producer responses before implementation starts."

enqueue_first_implementation_agent "packages/datastore/session-store"
enqueue_first_implementation_agent "packages/lib/capture-engine"
enqueue_first_implementation_agent "packages/lib/volume-analyzer"
enqueue_first_implementation_agent "packages/lib/transcription-client"
enqueue_first_implementation_agent "packages/lib/playback-engine"
enqueue_first_implementation_agent "apps/web-whisper-pwa"

# Phase 06 defaults to dependency order so downstream products can use upstream outputs.
# run_enqueued_agents_in_parallel
run_enqueued_agents_one_at_a_time
