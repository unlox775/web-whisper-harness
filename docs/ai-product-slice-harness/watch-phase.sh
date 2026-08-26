#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REQUESTED_PHASE="${1:-auto}"
PHASE=""
LINES="${2:-5}"
INTERVAL="${3:-1}"
RUN_ID="${4:-${PHASE_RUN_ID:-}}"

if [[ "$REQUESTED_PHASE" == "-h" || "$REQUESTED_PHASE" == "--help" ]]; then
  echo "Usage: $0 [auto|phase-name] [tail-lines] [interval-seconds] [run-id]"
  echo "With no phase, keeps running and follows whichever phase starts next."
  echo "Example: $0 phase-03-product-specs 5 1"
  echo "Run filter: PHASE_RUN_ID=20260614220150 $0 phase-07-iterate 5 1"
  echo "Width override: WATCH_COLS=180 $0 phase-03-product-specs 5 1"
  exit 0
fi

select_phase() {
  if [[ "$REQUESTED_PHASE" != "auto" ]]; then
    PHASE="$REQUESTED_PHASE"
    if [[ -z "$RUN_ID" && -f "$ROOT_DIR/subagents/status/${PHASE}.latest-run" ]]; then
      RUN_ID="$(sed -n '1p' "$ROOT_DIR/subagents/status/${PHASE}.latest-run")"
    fi
    return
  fi

  PHASE=""
  RUN_ID=""
  if [[ -f "$ROOT_DIR/subagents/status/current-phase" ]]; then
    PHASE="$(sed -n '1p' "$ROOT_DIR/subagents/status/current-phase")"
    RUN_ID="$(sed -n '2p' "$ROOT_DIR/subagents/status/current-phase")"
  fi
}

terminal_cols() {
  local cols=""

  if [[ -n "${WATCH_COLS:-}" ]]; then
    cols="$WATCH_COLS"
  elif cols="$(stty size 2>/dev/null < /dev/tty | awk '{ print $2 }')"; then
    :
  elif cols="$(stty size 2>/dev/null | awk '{ print $2 }')"; then
    :
  elif cols="$(tput cols 2>/dev/null)"; then
    :
  elif [[ -n "${COLUMNS:-}" ]]; then
    cols="$COLUMNS"
  else
    cols=""
  fi

  if [[ -z "$cols" || ! "$cols" =~ ^[0-9]+$ || "$cols" -lt 20 ]]; then
    cols="120"
  fi

  printf '%s' "$cols"
}

COLS="$(terminal_cols)"
BLUE="$(tput setaf 4 2>/dev/null || true)"
GREEN="$(tput setaf 2 2>/dev/null || true)"
RED="$(tput setaf 1 2>/dev/null || true)"
CYAN="$(tput setaf 6 2>/dev/null || true)"
BOLD="$(tput bold 2>/dev/null || true)"
DIM="$(tput dim 2>/dev/null || true)"
RESET="$(tput sgr0 2>/dev/null || true)"

print_line() {
  local line="${1:-}"
  printf '%s\033[K\n' "${line:0:COLS}"
}

print_status_line() {
  local line="${1:-}"
  print_line "$line"
}

print_header() {
  local line="${1:-}"
  local color="${2:-$CYAN}"
  line="${line:0:COLS}"
  printf '%s%s%s\033[K\n' "$color" "$line" "$RESET"
}

status_color() {
  local status="${1:-}"

  case "$status" in
    queued) printf '%s' "$CYAN" ;;
    running) printf '%s' "$BLUE" ;;
    succeeded) printf '%s' "$GREEN" ;;
    blocked|failed) printf '%s' "$RED" ;;
    *) printf '%s' "$CYAN" ;;
  esac
}

log_status() {
  local log_file="$1"
  local run_name status_file status

  run_name="$(basename "$log_file")"
  if [[ -n "$RUN_ID" ]]; then
    run_name="${run_name#$PHASE-$RUN_ID-}"
  else
    run_name="${run_name#$PHASE-}"
  fi
  run_name="${run_name%.log}"
  if [[ -n "$RUN_ID" ]]; then
    status_file="$ROOT_DIR/subagents/status/${PHASE}-${RUN_ID}-${run_name}.status"
  else
    status_file="$ROOT_DIR/subagents/status/${PHASE}-${run_name}.status"
  fi

  if [[ -f "$status_file" ]]; then
    IFS= read -r status <"$status_file" || status=""
    printf '%s' "$status"
  fi
}

phase_all_succeeded() {
  shopt -s nullglob
  local status_files
  if [[ -n "$RUN_ID" ]]; then
    status_files=("$ROOT_DIR/subagents/status/${PHASE}-${RUN_ID}-"*.status)
  else
    status_files=("$ROOT_DIR/subagents/status/${PHASE}-"*.status)
  fi
  local status_file status

  if [[ "${#status_files[@]}" -eq 0 ]]; then
    return 1
  fi

  for status_file in "${status_files[@]}"; do
    IFS= read -r status <"$status_file" || status=""
    if [[ "$status" != "succeeded" ]]; then
      return 1
    fi
  done

  return 0
}

render_phase() {
  COLS="$(terminal_cols)"

  print_line "${BOLD}$(date)${RESET}"
  if [[ -z "$PHASE" ]]; then
    print_line ""
    print_line "Waiting for a harness phase to start."
    print_line "Leave this window open; it will switch automatically."
    return
  fi

  print_line "Phase: $PHASE"
  if [[ -n "$RUN_ID" ]]; then
    print_line "Run: $RUN_ID"
  fi
  print_line ""
  while IFS= read -r status_line; do
    print_status_line "$status_line"
  done < <(PHASE_RUN_ID="$RUN_ID" bash "$ROOT_DIR/subagents/phase-status.sh" "$PHASE" || true)
  print_line ""

  shopt -s nullglob
  if [[ -n "$RUN_ID" ]]; then
    logs=("$ROOT_DIR/subagents/logs/${PHASE}-${RUN_ID}-"*.log)
  else
    logs=("$ROOT_DIR/subagents/logs/${PHASE}-"*.log)
  fi

  if [[ "${#logs[@]}" -eq 0 ]]; then
    if [[ -n "$RUN_ID" ]]; then
      print_line "No logs found for $PHASE run $RUN_ID yet."
    else
      print_line "No logs found for $PHASE yet."
    fi
  else
    print_line "${DIM}Showing ${#logs[@]} log(s), last $LINES line(s) each.${RESET}"
    print_line ""
    for log_file in "${logs[@]}"; do
      status="$(log_status "$log_file")"
      print_header "==> ${status:-unknown} ${log_file#$ROOT_DIR/} <==" "$(status_color "$status")"
      while IFS= read -r log_line; do
        print_line "$log_line"
      done < <(tail -n "$LINES" "$log_file" || true)
      print_line ""
    done
  fi
}

restore_cursor() {
  printf '\033[?25h\n'
}

printf '\033[?25l'
trap restore_cursor EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

while true; do
  select_phase
  output="$(render_phase)"
  printf '\033[H%s\033[J' "$output"
  sleep "$INTERVAL"
done
