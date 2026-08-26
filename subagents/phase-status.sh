#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATUS_DIR="$ROOT_DIR/subagents/status"
LOG_DIR="$ROOT_DIR/subagents/logs"
PHASE="${1:-}"
VERBOSE="${2:-}"
RUN_ID="${PHASE_RUN_ID:-}"

if [[ "${2:-}" == "--run-id" ]]; then
  RUN_ID="${3:-}"
  VERBOSE="${4:-}"
elif [[ "${3:-}" == "--run-id" ]]; then
  RUN_ID="${4:-}"
fi

if [[ -z "$PHASE" ]]; then
  echo "Usage: $0 <phase-name> [--verbose] [--run-id <run-id>]"
  echo "Example: $0 phase-03-product-specs"
  exit 2
fi

shopt -s nullglob
if [[ -n "$RUN_ID" ]]; then
  status_files=("$STATUS_DIR/${PHASE}-${RUN_ID}-"*.status)
else
  status_files=("$STATUS_DIR/${PHASE}-"*.status)
fi

if [[ "${#status_files[@]}" -eq 0 ]]; then
  if [[ -n "$RUN_ID" ]]; then
    echo "No status files found for $PHASE run $RUN_ID"
  else
    echo "No status files found for $PHASE"
  fi
  exit 1
fi

total="${#status_files[@]}"
queued=0
running=0
succeeded=0
blocked=0
failed=0

for status_file in "${status_files[@]}"; do
  status="$(sed -n '1p' "$status_file")"
  case "$status" in
    queued) queued=$((queued + 1)) ;;
    running) running=$((running + 1)) ;;
    succeeded) succeeded=$((succeeded + 1)) ;;
    blocked) blocked=$((blocked + 1)) ;;
    failed) failed=$((failed + 1)) ;;
  esac
done

if [[ -n "$RUN_ID" ]]; then
  printf '%s run=%s: total=%s queued=%s running=%s succeeded=%s blocked=%s failed=%s\n' "$PHASE" "$RUN_ID" "$total" "$queued" "$running" "$succeeded" "$blocked" "$failed"
else
  printf '%s: total=%s queued=%s running=%s succeeded=%s blocked=%s failed=%s\n' "$PHASE" "$total" "$queued" "$running" "$succeeded" "$blocked" "$failed"
fi
echo

for status_file in "${status_files[@]}"; do
  run_name="$(basename "$status_file")"
  if [[ -n "$RUN_ID" ]]; then
    run_name="${run_name#$PHASE-$RUN_ID-}"
  else
    run_name="${run_name#$PHASE-}"
  fi
  run_name="${run_name%.status}"

  status="$(sed -n '1p' "$status_file")"
  label="$(sed -n '2p' "$status_file")"
  log_line="$(sed -n '3p' "$status_file")"
  result_line="$(sed -n '4p' "$status_file")"
  if [[ -n "$RUN_ID" ]]; then
    log_file="$LOG_DIR/${PHASE}-${RUN_ID}-${run_name}.log"
  else
    log_file="$LOG_DIR/${PHASE}-${run_name}.log"
  fi

  if [[ -z "$label" ]]; then
    label="$run_name"
  fi

  printf '%-10s %s\n' "$status" "$run_name"
  if [[ "$VERBOSE" == "--verbose" ]]; then
    summary="$(sed -n '5p' "$status_file")"
    if [[ "$summary" == summary:* ]]; then
      printf '           %s\n' "$summary"
    fi
    if [[ "$log_line" == log:* ]]; then
      printf '           %s\n' "$log_line"
    else
      printf '           log: %s\n' "$log_file"
    fi
    if [[ "$result_line" == result:* ]]; then
      printf '           %s\n' "$result_line"
    fi
    printf '           label: %s\n' "$label"
  fi
done
