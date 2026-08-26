#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/docs/ai-product-slice-harness/subagent-runner.sh"

start_phase "phase-05-producer-responses"
set_phase_context "$*"

require_phase_successes "phase-04-customer-requests" \
  "web-whisper-pwa-uses-capture-engine" \
  "web-whisper-pwa-uses-volume-analyzer" \
  "web-whisper-pwa-uses-transcription-client" \
  "web-whisper-pwa-uses-playback-engine" \
  "web-whisper-pwa-uses-session-store" \
  "capture-engine-uses-session-store" \
  "volume-analyzer-uses-session-store" \
  "playback-engine-uses-session-store" \
  "session-store-isolation-demo" \
  "capture-engine-isolation-demo" \
  "volume-analyzer-isolation-demo" \
  "transcription-client-isolation-demo" \
  "playback-engine-isolation-demo"

enqueue_producer_response_agent "packages/datastore/session-store"
enqueue_producer_response_agent "packages/lib/capture-engine"
enqueue_producer_response_agent "packages/lib/volume-analyzer"
enqueue_producer_response_agent "packages/lib/transcription-client"
enqueue_producer_response_agent "packages/lib/playback-engine"
enqueue_producer_response_agent "apps/web-whisper-pwa"

run_enqueued_agents_in_parallel
# run_enqueued_agents_one_at_a_time
