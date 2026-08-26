#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/docs/ai-product-slice-harness/subagent-runner.sh"

start_phase "phase-03-product-specs"
set_phase_context "$*"

enqueue_product_spec_agent "packages/datastore/session-store"
enqueue_product_spec_agent "packages/lib/capture-engine"
enqueue_product_spec_agent "packages/lib/volume-analyzer"
enqueue_product_spec_agent "packages/lib/transcription-client"
enqueue_product_spec_agent "packages/lib/playback-engine"
enqueue_product_spec_agent "apps/web-whisper-pwa"

# Default: run the queued agents in parallel.
run_enqueued_agents_in_parallel
# run_enqueued_agents_one_at_a_time
