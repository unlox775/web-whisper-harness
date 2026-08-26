#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/docs/ai-product-slice-harness/subagent-runner.sh"

start_phase "phase-04-customer-requests"
set_phase_context "$*"

require_phase_successes "phase-03-product-specs" \
  "session-store" \
  "capture-engine" \
  "volume-analyzer" \
  "transcription-client" \
  "playback-engine" \
  "web-whisper-pwa"

enqueue_customer_request_agent "apps/web-whisper-pwa" "packages/lib/capture-engine" "web-whisper-pwa"
enqueue_customer_request_agent "apps/web-whisper-pwa" "packages/lib/volume-analyzer" "web-whisper-pwa"
enqueue_customer_request_agent "apps/web-whisper-pwa" "packages/lib/transcription-client" "web-whisper-pwa"
enqueue_customer_request_agent "apps/web-whisper-pwa" "packages/lib/playback-engine" "web-whisper-pwa"
enqueue_customer_request_agent "apps/web-whisper-pwa" "packages/datastore/session-store" "web-whisper-pwa"
enqueue_customer_request_agent "packages/lib/capture-engine" "packages/datastore/session-store" "capture-engine"
enqueue_customer_request_agent "packages/lib/volume-analyzer" "packages/datastore/session-store" "volume-analyzer"
enqueue_customer_request_agent "packages/lib/playback-engine" "packages/datastore/session-store" "playback-engine"
enqueue_isolation_demo_request_agent "packages/datastore/session-store"
enqueue_isolation_demo_request_agent "packages/lib/capture-engine"
enqueue_isolation_demo_request_agent "packages/lib/volume-analyzer"
enqueue_isolation_demo_request_agent "packages/lib/transcription-client"
enqueue_isolation_demo_request_agent "packages/lib/playback-engine"

run_enqueued_agents_in_parallel
# run_enqueued_agents_one_at_a_time
