#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PHASE_RUN_ID="${PHASE_RUN_ID:-$(date '+%Y%m%d%H%M%S')}"
source "$ROOT_DIR/docs/ai-product-slice-harness/subagent-runner.sh"

PHASE_DRY_RUN="${PHASE_DRY_RUN:-0}"
PHASE_RUN_MODE="${PHASE_RUN_MODE:-parallel}"
PHASE_GENERATE_NOTES="${PHASE_GENERATE_NOTES:-1}"
if [[ "${PHASE_SERIAL:-0}" == "1" ]]; then
  PHASE_RUN_MODE="serial"
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) PHASE_DRY_RUN=1; shift ;;
    --serial|--one-at-a-time) PHASE_RUN_MODE="serial"; shift ;;
    --parallel) PHASE_RUN_MODE="parallel"; shift ;;
    --) shift; break ;;
    *) break ;;
  esac
done

start_phase "phase-07-iterate"
set_phase_context "$*"

if [[ "$PHASE_DRY_RUN" != "1" && "${PHASE_ALLOW_CONCURRENT:-0}" != "1" ]]; then
  shopt -s nullglob
  active_statuses=("$ROOT_DIR/subagents/status/phase-07-iterate-"*.status)
  for active_status in "${active_statuses[@]}"; do
    if [[ "$(sed -n '1p' "$active_status")" == "running" ]]; then
      echo "Refusing to start Phase 07 because another Phase 07 job is still running:"
      echo "  $active_status"
      echo "Rerun with PHASE_ALLOW_CONCURRENT=1 only if you intentionally want concurrent Phase 07 runs."
      exit 2
    fi
  done
fi

if [[ "$PHASE_DRY_RUN" != "1" ]]; then
  echo "$PHASE_RUN_ID" >"$ROOT_DIR/subagents/status/phase-07-iterate.latest-run"
fi

if [[ "$PHASE_DRY_RUN" == "1" ]]; then
  echo "Phase 07 dry run skips prerequisite gating and only reports unresolved spec detection."
  echo
else
  require_phase_successes "phase-06-first-implementation" \
  "session-store" \
  "capture-engine" \
  "volume-analyzer" \
  "transcription-client" \
  "playback-engine" \
  "web-whisper-pwa"
fi

enqueue_iteration_specs_for_product "packages/datastore/session-store"
enqueue_iteration_specs_for_product "packages/lib/capture-engine"
enqueue_iteration_specs_for_product "packages/lib/volume-analyzer"
enqueue_iteration_specs_for_product "packages/lib/transcription-client"
enqueue_iteration_specs_for_product "packages/lib/playback-engine"

assert_unique_iteration_products

if [[ "$PHASE_DRY_RUN" == "1" ]]; then
  echo "Phase 07 dry run. No agents will be launched."
  echo
  if [[ "$PHASE_RUN_MODE" == "serial" ]]; then
    dry_run_enqueued_iteration_specs "Independent package group (would run one at a time):"
  else
    dry_run_enqueued_iteration_specs "Independent package group (would run in parallel):"
  fi
else
  if _should_run_job "iteration_specs|apps/web-whisper-pwa"; then
    _write_queued_status "web-whisper-pwa" "apps/web-whisper-pwa" "Waiting for package iteration group to finish."
  fi

  phase_exit=0
  if [[ "$PHASE_RUN_MODE" == "serial" ]]; then
    run_enqueued_agents_one_at_a_time || phase_exit="$?"
  else
    run_enqueued_agents_in_parallel || phase_exit="$?"
  fi

  if [[ "$phase_exit" != "0" ]]; then
    if [[ "$PHASE_GENERATE_NOTES" == "1" ]]; then
      python3 "$ROOT_DIR/scripts/generate-phase-07-notes.py" "$PHASE_RUN_ID" || true
    fi
    print_phase07_spec_status_summary
    exit "$phase_exit"
  fi
fi

HARNESS_JOBS=()
enqueue_iteration_specs_for_product "apps/web-whisper-pwa"
assert_unique_iteration_products

if [[ "$PHASE_DRY_RUN" == "1" ]]; then
  echo
  dry_run_enqueued_iteration_specs "Final app group (would run after packages):"
  if [[ "$HARNESS_DRY_RUN_FOUND" == "0" ]]; then
    echo
    echo "No unresolved Phase 07 specs found."
  fi
  print_phase07_spec_status_summary
  exit 0
fi

run_enqueued_agents_one_at_a_time
phase_exit="$?"

if [[ "$PHASE_GENERATE_NOTES" == "1" ]]; then
  python3 "$ROOT_DIR/scripts/generate-phase-07-notes.py" "$PHASE_RUN_ID" || true
fi
print_phase07_spec_status_summary
exit "$phase_exit"
