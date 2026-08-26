#!/usr/bin/env bash
# Generate Phase 03–07 shell scripts from a product/relationship list.
# Run from the project root after Phase 02 product boundaries are chosen.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$ROOT_DIR/subagents"
PRODUCTS=()
RELATIONS=() # consumer_path|producer_path|customer_file
FINAL_APP=""
IMPLEMENTATION_ORDER=()
PHASE04_LABELS=()
IOS_SANDBOX=0
FORCE=0

usage() {
  cat <<'EOF'
Usage:
  bash docs/ai-product-slice-harness/write-phase-scripts.sh [options]

Options:
  --product <path>                 Add an apps/... or packages/{ui,lib,datastore}/... path
  --relation <consumer>:<producer>[:customer-file]
                                   Consumer->producer customer relationship.
                                   customer-file defaults to the consumer basename.
  --final-app <path>               Product that runs last in Phase 07
  --implementation-order <path>    Explicit Phase 06 order (repeatable).
                                   Defaults to --product order.
  --ios-sandbox                    Pre-set CODEX_ADD_DIRS for SwiftPM/Xcode caches
  --force                          Overwrite existing phase-03..07 scripts
  -h, --help                       Show this help

Example:
  bash docs/ai-product-slice-harness/write-phase-scripts.sh \
    --product packages/lib/audio-chunk-recorder \
    --product packages/lib/volume-silence-analyzer \
    --product apps/final-app \
    --relation apps/final-app:packages/lib/audio-chunk-recorder \
    --relation apps/final-app:packages/lib/volume-silence-analyzer \
    --relation packages/lib/volume-silence-analyzer:packages/lib/audio-chunk-recorder \
    --final-app apps/final-app \
    --implementation-order packages/lib/audio-chunk-recorder \
    --implementation-order packages/lib/volume-silence-analyzer \
    --implementation-order apps/final-app
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --product) PRODUCTS+=("$2"); shift 2 ;;
    --relation)
      raw="$2"
      consumer="${raw%%:*}"
      rest="${raw#*:}"
      producer="${rest%%:*}"
      if [[ "$rest" == *:* ]]; then
        customer="${rest#*:}"
      else
        customer="$(basename "$consumer")"
      fi
      RELATIONS+=("${consumer}|${producer}|${customer}")
      shift 2
      ;;
    --final-app) FINAL_APP="$2"; shift 2 ;;
    --implementation-order) IMPLEMENTATION_ORDER+=("$2"); shift 2 ;;
    --ios-sandbox) IOS_SANDBOX=1; shift ;;
    --force) FORCE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "${#PRODUCTS[@]}" -eq 0 ]]; then
  echo "At least one --product is required." >&2
  usage >&2
  exit 2
fi

if [[ -z "$FINAL_APP" ]]; then
  for product in "${PRODUCTS[@]}"; do
    if [[ "$product" == apps/* ]]; then
      FINAL_APP="$product"
    fi
  done
fi
if [[ -z "$FINAL_APP" ]]; then
  FINAL_APP="${PRODUCTS[${#PRODUCTS[@]}-1]}"
fi

if [[ "${#IMPLEMENTATION_ORDER[@]}" -eq 0 ]]; then
  IMPLEMENTATION_ORDER=("${PRODUCTS[@]}")
fi

for rel in "${RELATIONS[@]}"; do
  IFS='|' read -r consumer producer _ <<<"$rel"
  PHASE04_LABELS+=("$(basename "$consumer")-uses-$(basename "$producer")")
done
for product in "${PRODUCTS[@]}"; do
  if [[ "$product" == packages/* ]]; then
    PHASE04_LABELS+=("$(basename "$product")-isolation-demo")
  fi
done

mkdir -p "$OUT_DIR"

write_or_die() {
  local path="$1"
  local content="$2"
  if [[ -e "$path" && "$FORCE" != "1" ]]; then
    echo "Refusing to overwrite $path (pass --force)." >&2
    exit 1
  fi
  printf '%s\n' "$content" >"$path"
  chmod +x "$path"
  echo "wrote $path"
}

emit_basenames_require() {
  local -a items=("$@")
  local i=0
  local n="${#items[@]}"
  for item in "${items[@]}"; do
    i=$((i + 1))
    if [[ "$i" -eq "$n" ]]; then
      printf '  "%s"\n' "$(basename "$item")"
    else
      printf '  "%s" \\\n' "$(basename "$item")"
    fi
  done
}

emit_labels_require() {
  local -a labels=("$@")
  local i=0
  local n="${#labels[@]}"
  for label in "${labels[@]}"; do
    i=$((i + 1))
    if [[ "$i" -eq "$n" ]]; then
      printf '  "%s"\n' "$label"
    else
      printf '  "%s" \\\n' "$label"
    fi
  done
}

ios_export_line() {
  if [[ "$IOS_SANDBOX" == "1" ]]; then
    echo 'export CODEX_ADD_DIRS="${CODEX_ADD_DIRS:-$HOME/Library/Caches/org.swift.swiftpm:$HOME/Library/Caches/com.apple.dt.Xcode:$HOME/Library/Developer/Xcode/DerivedData:/private/tmp}"'
  fi
}

# --- phase 03 ---
{
  echo '#!/usr/bin/env bash'
  echo 'set -euo pipefail'
  echo
  echo 'ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"'
  echo 'source "$ROOT_DIR/docs/ai-product-slice-harness/subagent-runner.sh"'
  echo
  echo 'start_phase "phase-03-product-specs"'
  echo 'set_phase_context "$*"'
  echo
  for product in "${PRODUCTS[@]}"; do
    echo "enqueue_product_spec_agent \"$product\""
  done
  cat <<'FTR'

# Default: run the queued agents in parallel.
run_enqueued_agents_in_parallel
# run_enqueued_agents_one_at_a_time
FTR
} >"$OUT_DIR/phase-03-product-specs.sh"
chmod +x "$OUT_DIR/phase-03-product-specs.sh"
echo "wrote $OUT_DIR/phase-03-product-specs.sh"

# --- phase 04 ---
{
  echo '#!/usr/bin/env bash'
  echo 'set -euo pipefail'
  echo
  echo 'ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"'
  echo 'source "$ROOT_DIR/docs/ai-product-slice-harness/subagent-runner.sh"'
  echo
  echo 'start_phase "phase-04-customer-requests"'
  echo 'set_phase_context "$*"'
  echo
  echo 'require_phase_successes "phase-03-product-specs" \'
  emit_basenames_require "${PRODUCTS[@]}"
  echo
  if [[ "${#RELATIONS[@]}" -eq 0 ]]; then
    echo '# TODO: enqueue_customer_request_agent "<consumer>" "<producer>" "<customer-file>"'
  else
    for rel in "${RELATIONS[@]}"; do
      IFS='|' read -r consumer producer customer <<<"$rel"
      echo "enqueue_customer_request_agent \"$consumer\" \"$producer\" \"$customer\""
    done
  fi
  for product in "${PRODUCTS[@]}"; do
    if [[ "$product" == packages/* ]]; then
      echo "enqueue_isolation_demo_request_agent \"$product\""
    fi
  done
  cat <<'FTR'

run_enqueued_agents_in_parallel
# run_enqueued_agents_one_at_a_time
FTR
} >"$OUT_DIR/phase-04-customer-requests.sh"
chmod +x "$OUT_DIR/phase-04-customer-requests.sh"
echo "wrote $OUT_DIR/phase-04-customer-requests.sh"

# --- phase 05 ---
{
  echo '#!/usr/bin/env bash'
  echo 'set -euo pipefail'
  echo
  echo 'ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"'
  echo 'source "$ROOT_DIR/docs/ai-product-slice-harness/subagent-runner.sh"'
  echo
  echo 'start_phase "phase-05-producer-responses"'
  echo 'set_phase_context "$*"'
  echo
  if [[ "${#PHASE04_LABELS[@]}" -gt 0 ]]; then
    echo 'require_phase_successes "phase-04-customer-requests" \'
    emit_labels_require "${PHASE04_LABELS[@]}"
  else
    echo '# No Phase 04 customer requests are configured.'
  fi
  echo
  for product in "${PRODUCTS[@]}"; do
    echo "enqueue_producer_response_agent \"$product\""
  done
  cat <<'FTR'

run_enqueued_agents_in_parallel
# run_enqueued_agents_one_at_a_time
FTR
} >"$OUT_DIR/phase-05-producer-responses.sh"
chmod +x "$OUT_DIR/phase-05-producer-responses.sh"
echo "wrote $OUT_DIR/phase-05-producer-responses.sh"

# --- phase 06 ---
{
  echo '#!/usr/bin/env bash'
  echo 'set -euo pipefail'
  echo
  echo 'ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"'
  ios_export_line
  echo 'source "$ROOT_DIR/docs/ai-product-slice-harness/subagent-runner.sh"'
  echo
  echo 'start_phase "phase-06-first-implementation"'
  echo 'set_phase_context "$*"'
  echo
  echo 'require_phase_successes "phase-05-producer-responses" \'
  emit_basenames_require "${PRODUCTS[@]}"
  echo
  echo 'require_phase_ready "Phase 05 has succeeded. Phase 06 is intentionally gated for human review of the completed specs and producer responses before implementation starts."'
  echo
  for product in "${IMPLEMENTATION_ORDER[@]}"; do
    echo "enqueue_first_implementation_agent \"$product\""
  done
  cat <<'FTR'

# Phase 06 defaults to dependency order so downstream products can use upstream outputs.
# run_enqueued_agents_in_parallel
run_enqueued_agents_one_at_a_time
FTR
} >"$OUT_DIR/phase-06-first-implementation.sh"
chmod +x "$OUT_DIR/phase-06-first-implementation.sh"
echo "wrote $OUT_DIR/phase-06-first-implementation.sh"

# --- phase 07 ---
final_basename="$(basename "$FINAL_APP")"
{
  echo '#!/usr/bin/env bash'
  echo 'set -euo pipefail'
  echo
  echo 'ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"'
  ios_export_line
  echo 'export PHASE_RUN_ID="${PHASE_RUN_ID:-$(date '"'"'+%Y%m%d%H%M%S'"'"')}"'
  echo 'source "$ROOT_DIR/docs/ai-product-slice-harness/subagent-runner.sh"'
  cat <<'MID'

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
MID
  emit_basenames_require "${PRODUCTS[@]}"
  echo 'fi'
  echo
  for product in "${PRODUCTS[@]}"; do
    if [[ "$product" == "$FINAL_APP" ]]; then
      continue
    fi
    echo "enqueue_iteration_specs_for_product \"$product\""
  done
  cat <<MID2

assert_unique_iteration_products

if [[ "\$PHASE_DRY_RUN" == "1" ]]; then
  echo "Phase 07 dry run. No agents will be launched."
  echo
  if [[ "\$PHASE_RUN_MODE" == "serial" ]]; then
    dry_run_enqueued_iteration_specs "Independent package group (would run one at a time):"
  else
    dry_run_enqueued_iteration_specs "Independent package group (would run in parallel):"
  fi
else
  if _should_run_job "iteration_specs|${FINAL_APP}"; then
    _write_queued_status "${final_basename}" "${FINAL_APP}" "Waiting for package iteration group to finish."
  fi

  phase_exit=0
  if [[ "\$PHASE_RUN_MODE" == "serial" ]]; then
    run_enqueued_agents_one_at_a_time || phase_exit="\$?"
  else
    run_enqueued_agents_in_parallel || phase_exit="\$?"
  fi

  if [[ "\$phase_exit" != "0" ]]; then
    if [[ "\$PHASE_GENERATE_NOTES" == "1" ]]; then
      python3 "\$ROOT_DIR/scripts/generate-phase-07-notes.py" "\$PHASE_RUN_ID" || true
    fi
    print_phase07_spec_status_summary
    exit "\$phase_exit"
  fi
fi

HARNESS_JOBS=()
enqueue_iteration_specs_for_product "${FINAL_APP}"
assert_unique_iteration_products

if [[ "\$PHASE_DRY_RUN" == "1" ]]; then
  echo
  dry_run_enqueued_iteration_specs "Final app group (would run after packages):"
  if [[ "\$HARNESS_DRY_RUN_FOUND" == "0" ]]; then
    echo
    echo "No unresolved Phase 07 specs found."
  fi
  print_phase07_spec_status_summary
  exit 0
fi

run_enqueued_agents_one_at_a_time
phase_exit="\$?"

if [[ "\$PHASE_GENERATE_NOTES" == "1" ]]; then
  python3 "\$ROOT_DIR/scripts/generate-phase-07-notes.py" "\$PHASE_RUN_ID" || true
fi
print_phase07_spec_status_summary
exit "\$phase_exit"
MID2
} >"$OUT_DIR/phase-07-iterate.sh"
chmod +x "$OUT_DIR/phase-07-iterate.sh"
echo "wrote $OUT_DIR/phase-07-iterate.sh"

echo
echo "Phase scripts ready under $OUT_DIR."
echo "Next: review the Phase 02 scaffold and keep 'make watch' open."
echo "Then commit Phase 02 and run all planning rounds with:"
echo "  HARNESS_COMMIT_DIRTY=1 make phase-2-5"
