#!/usr/bin/env bash

# Shared shell helpers for AI Product Slice Harness sub-agent phase scripts.
# Phase scripts should stay human-readable and declare only the work for that phase.

HARNESS_HELPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_ROOT_DIR="$(cd "$HARNESS_HELPER_DIR/../.." && pwd)"

# Optional project config written by bin/install or Phase 01.
# shellcheck source=/dev/null
if [[ -f "$HARNESS_HELPER_DIR/config.env" ]]; then
  source "$HARNESS_HELPER_DIR/config.env"
fi

HARNESS_PROCESS_DOC="${HARNESS_PROCESS_DOC:-docs/AI-PRODUCT-SLICE-HARNESS.md}"
HARNESS_FOUNDER_VISION="${HARNESS_FOUNDER_VISION:-docs/FOUNDER-vision.md}"
HARNESS_SLICE_UP_PLAN="${HARNESS_SLICE_UP_PLAN:-docs/SLICE-UP-plan.md}"

HARNESS_CODEX_BIN="${CODEX_BIN:-codex}"
HARNESS_CODEX_SANDBOX="${CODEX_SANDBOX_MODE:-${CODEX_SANDBOX:-workspace-write}}"
HARNESS_CODEX_ADD_DIRS="${CODEX_ADD_DIRS:-}"
HARNESS_LOG_DIR="$HARNESS_ROOT_DIR/subagents/logs"
HARNESS_STATUS_DIR="$HARNESS_ROOT_DIR/subagents/status"
HARNESS_RESULT_DIR="$HARNESS_ROOT_DIR/subagents/results"
HARNESS_PHASE=""
HARNESS_RUN_ID="${PHASE_RUN_ID:-${HARNESS_RUN_ID:-}}"
HARNESS_JOBS=()
HARNESS_EXTRA_CONTEXT=""
HARNESS_ONLY="${PHASE_ONLY:-}"
HARNESS_DRY_RUN_FOUND=0

start_phase() {
  HARNESS_PHASE="$1"
  mkdir -p "$HARNESS_LOG_DIR" "$HARNESS_STATUS_DIR" "$HARNESS_RESULT_DIR"
  {
    printf '%s\n' "$HARNESS_PHASE"
    printf '%s\n' "$HARNESS_RUN_ID"
  } >"$HARNESS_STATUS_DIR/current-phase"
  if [[ -n "$HARNESS_RUN_ID" ]]; then
    printf '%s\n' "$HARNESS_RUN_ID" >"$HARNESS_STATUS_DIR/${HARNESS_PHASE}.latest-run"
  fi
}

set_phase_context() {
  HARNESS_EXTRA_CONTEXT="$*"
}

enqueue_product_spec_agent() {
  HARNESS_JOBS+=("product_spec|$1")
}

enqueue_customer_request_agent() {
  HARNESS_JOBS+=("customer_request|$1|$2|$3")
}

enqueue_isolation_demo_request_agent() {
  HARNESS_JOBS+=("isolation_demo_request|$1")
}

enqueue_producer_response_agent() {
  HARNESS_JOBS+=("producer_response|$1")
}

enqueue_first_implementation_agent() {
  HARNESS_JOBS+=("first_implementation|$1")
}

enqueue_iteration_specs_for_product() {
  HARNESS_JOBS+=("iteration_specs|$1")
}

run_enqueued_agents_in_parallel() {
  local pids=()
  local job

  _print_phase_watch_command

  for job in "${HARNESS_JOBS[@]}"; do
    if ! _should_run_job "$job"; then
      echo "skipping $(_job_run_label "$job")"
      continue
    fi
    _run_harness_job "$job" &
    pids+=("$!")
  done

  local failed=0
  local pid
  if [[ "${#pids[@]}" -gt 0 ]]; then
    for pid in "${pids[@]}"; do
      if ! wait "$pid"; then
        failed=1
      fi
    done
  fi

  echo "$HARNESS_PHASE complete. Status files are in $HARNESS_STATUS_DIR."
  return "$failed"
}

_print_phase_watch_command() {
  echo "Persistent watcher (safe to start once and leave open):"
  echo "  make watch"
  echo
}

run_enqueued_agents_one_at_a_time() {
  local failed=0
  local job

  for job in "${HARNESS_JOBS[@]}"; do
    if ! _should_run_job "$job"; then
      echo "skipping $(_job_run_label "$job")"
      continue
    fi
    if ! _run_harness_job "$job"; then
      failed=1
    fi
  done

  echo "$HARNESS_PHASE complete. Status files are in $HARNESS_STATUS_DIR."
  return "$failed"
}

dry_run_enqueued_iteration_specs() {
  local group_label="${1:-Phase 07 dry run}"
  local job kind rest group_found
  group_found=0

  echo "$group_label"

  for job in "${HARNESS_JOBS[@]}"; do
    if ! _should_run_job "$job"; then
      echo "skipping $(_job_run_label "$job")"
      continue
    fi

    kind="${job%%|*}"
    rest="${job#*|}"
    if [[ "$kind" != "iteration_specs" ]]; then
      echo "dry-run unsupported job kind: $kind" >&2
      continue
    fi

    if _print_unresolved_specs_for_product "$rest"; then
      group_found=1
      HARNESS_DRY_RUN_FOUND=1
    fi
  done

  if [[ "$group_found" == "0" ]]; then
    echo "  No unresolved specs in this group."
  fi
}

assert_unique_iteration_products() {
  local job kind rest seen duplicate
  seen="|"
  duplicate=0

  for job in "${HARNESS_JOBS[@]}"; do
    if ! _should_run_job "$job"; then
      continue
    fi

    kind="${job%%|*}"
    rest="${job#*|}"
    if [[ "$kind" != "iteration_specs" ]]; then
      continue
    fi

    case "$seen" in
      *"|$rest|"*)
        echo "Phase 07 configuration error: duplicate iteration job for $rest" >&2
        duplicate=1
        ;;
      *)
        seen="${seen}${rest}|"
        ;;
    esac
  done

  if [[ "$duplicate" != "0" ]]; then
    echo "Refusing to launch Phase 07 because a product would have more than one concurrent agent." >&2
    exit 2
  fi
}

require_phase_ready() {
  local message="$1"

  if [[ "${PHASE_CONFIRMED:-${ALLOW_UNREADY:-0}}" != "1" ]]; then
    echo "$message"
    echo "When ready, rerun with PHASE_CONFIRMED=1 if you intentionally want to launch this phase."
    exit 2
  fi
}

require_phase_successes() {
  local required_phase="$1"
  shift

  local missing=0
  local label status_file legacy_status_file status

  for label in "$@"; do
    if [[ -n "$HARNESS_RUN_ID" ]]; then
      status_file="$HARNESS_STATUS_DIR/${required_phase}-${HARNESS_RUN_ID}-${label}.status"
      legacy_status_file="$HARNESS_STATUS_DIR/${required_phase}-${label}.status"
      if [[ ! -f "$status_file" && -f "$legacy_status_file" ]]; then
        status_file="$legacy_status_file"
      fi
    else
      status_file="$HARNESS_STATUS_DIR/${required_phase}-${label}.status"
    fi

    if [[ ! -f "$status_file" ]]; then
      echo "missing required status: $status_file" >&2
      missing=1
      continue
    fi

    IFS= read -r status <"$status_file" || status=""
    if [[ "$status" != "succeeded" ]]; then
      echo "required status is not succeeded: $status_file ($status)" >&2
      missing=1
    fi
  done

  if [[ "$missing" != "0" ]]; then
    echo "Refusing to start $HARNESS_PHASE because $required_phase is not fully succeeded." >&2
    exit 2
  fi
}

_run_harness_job() {
  local job="$1"
  local kind rest
  kind="${job%%|*}"
  rest="${job#*|}"

  case "$kind" in
    product_spec)
      _run_product_spec_agent "$rest"
      ;;
    customer_request)
      IFS="|" read -r consumer_path producer_path customer_file <<<"$rest"
      _run_customer_request_agent "$consumer_path" "$producer_path" "$customer_file"
      ;;
    isolation_demo_request)
      _run_isolation_demo_request_agent "$rest"
      ;;
    producer_response)
      _run_producer_response_agent "$rest"
      ;;
    first_implementation)
      _run_first_implementation_agent "$rest"
      ;;
    iteration_specs)
      _run_iteration_specs_for_product "$rest"
      ;;
    *)
      echo "Unknown harness job kind: $kind" >&2
      return 1
      ;;
  esac
}

_job_run_label() {
  local job="$1"
  local kind rest consumer_path producer_path customer_file
  kind="${job%%|*}"
  rest="${job#*|}"

  case "$kind" in
    product_spec|producer_response|first_implementation|iteration_specs)
      basename "$rest"
      ;;
    isolation_demo_request)
      printf '%s-isolation-demo' "$(basename "$rest")"
      ;;
    customer_request)
      IFS="|" read -r consumer_path producer_path customer_file <<<"$rest"
      printf '%s-uses-%s' "$(basename "$consumer_path")" "$(basename "$producer_path")"
      ;;
    *)
      printf '%s' "$kind"
      ;;
  esac
}

_should_run_job() {
  local job="$1"
  local label

  if [[ -z "$HARNESS_ONLY" ]]; then
    return 0
  fi

  label="$(_job_run_label "$job")"
  case ",$HARNESS_ONLY," in
    *",$label,"*) return 0 ;;
    *) return 1 ;;
  esac
}

_run_codex_agent() {
  local run_label="$1"
  local status_label="$2"
  local prompt="$3"
  local artifact_name
  artifact_name="$(_artifact_name "$run_label")"
  local log_file="$HARNESS_LOG_DIR/${artifact_name}.log"
  local status_file="$HARNESS_STATUS_DIR/${artifact_name}.status"
  local result_file="$HARNESS_RESULT_DIR/${artifact_name}.result"
  local exit_code final_status final_summary
  local codex_args add_dirs dir

  : >"$result_file"
  if [[ -n "$HARNESS_EXTRA_CONTEXT" ]]; then
    prompt="$(cat <<PROMPT
${prompt}

Additional human context for this phase run:
${HARNESS_EXTRA_CONTEXT}

If this is a rerun, update the existing files in place. Keep prior correct work, but revise anything that conflicts with the additional context above.
PROMPT
)"
  fi
  prompt="${prompt//__HARNESS_RESULT_FILE__/$result_file}"

  {
    echo "running"
    echo "$status_label"
    echo "log: $log_file"
    echo "result: $result_file"
  } >"$status_file"
  echo "running $run_label"

  if ! command -v "$HARNESS_CODEX_BIN" >/dev/null 2>&1; then
    {
      echo "blocked"
      echo "$status_label"
      echo "log: $log_file"
      echo "result: $result_file"
      echo "summary: Codex executable not found: $HARNESS_CODEX_BIN"
    } >"$status_file"
    {
      echo "STATUS: blocked"
      echo "SUMMARY: Codex executable not found: $HARNESS_CODEX_BIN"
      echo "DETAILS:"
      echo "Install Codex or set CODEX_BIN to the executable path."
    } >"$result_file"
    echo "Codex executable not found: $HARNESS_CODEX_BIN" >"$log_file"
    return 1
  fi

  set +e
  (
    cd "$HARNESS_ROOT_DIR"
    codex_args=(exec --sandbox "$HARNESS_CODEX_SANDBOX" -C "$HARNESS_ROOT_DIR")
    if [[ -n "$HARNESS_CODEX_ADD_DIRS" ]]; then
      IFS=":" read -r -a add_dirs <<<"$HARNESS_CODEX_ADD_DIRS"
      for dir in "${add_dirs[@]}"; do
        if [[ -n "$dir" ]]; then
          codex_args+=(--add-dir "$dir")
        fi
      done
    fi
    "$HARNESS_CODEX_BIN" "${codex_args[@]}" "$prompt"
  ) >"$log_file" 2>&1
  exit_code="$?"
  set -e

  if [[ "$exit_code" != "0" ]]; then
    final_status="failed"
    final_summary="Codex exited with code $exit_code. See log."
  elif _load_result_file "$result_file"; then
    final_status="$HARNESS_RESULT_STATUS"
    final_summary="$HARNESS_RESULT_SUMMARY"
  else
    final_status="failed"
    final_summary="$HARNESS_RESULT_ERROR"
  fi

  {
    echo "$final_status"
    echo "$status_label"
    echo "log: $log_file"
    echo "result: $result_file"
    echo "summary: $final_summary"
    if [[ -n "${HARNESS_RESULT_DETAILS:-}" ]]; then
      echo "details:"
      printf '%s\n' "$HARNESS_RESULT_DETAILS"
    fi
  } >"$status_file"

  [[ "$final_status" == "succeeded" ]]
}

_load_result_file() {
  local result_file="$1"
  local status_line summary_line details_marker details

  HARNESS_RESULT_STATUS=""
  HARNESS_RESULT_SUMMARY=""
  HARNESS_RESULT_DETAILS=""
  HARNESS_RESULT_ERROR=""

  if [[ ! -s "$result_file" ]]; then
    HARNESS_RESULT_ERROR="Missing or empty result file: $result_file"
    return 1
  fi

  status_line="$(sed -n '1p' "$result_file")"
  summary_line="$(sed -n '2p' "$result_file")"
  details_marker="$(sed -n '3p' "$result_file")"
  details="$(sed -n '4,$p' "$result_file")"

  case "$status_line" in
    "STATUS: succeeded") HARNESS_RESULT_STATUS="succeeded" ;;
    "STATUS: blocked") HARNESS_RESULT_STATUS="blocked" ;;
    "STATUS: failed") HARNESS_RESULT_STATUS="failed" ;;
    *)
      HARNESS_RESULT_ERROR="Invalid first line in result file. Expected STATUS: succeeded|blocked|failed"
      return 1
      ;;
  esac

  if [[ "$summary_line" != SUMMARY:\ * || "$summary_line" == "SUMMARY: " || "$summary_line" == "SUMMARY:" ]]; then
    HARNESS_RESULT_ERROR="Invalid or empty SUMMARY line in result file."
    return 1
  fi

  if [[ "$details_marker" != "DETAILS:" ]]; then
    HARNESS_RESULT_ERROR="Invalid result file. Third line must be exactly DETAILS:"
    return 1
  fi

  if [[ "$HARNESS_RESULT_STATUS" != "succeeded" && -z "$details" ]]; then
    HARNESS_RESULT_ERROR="Blocked or failed result must include DETAILS."
    return 1
  fi

  HARNESS_RESULT_SUMMARY="${summary_line#SUMMARY: }"
  HARNESS_RESULT_DETAILS="$details"
  return 0
}

_run_product_spec_agent() {
  local product_path="$1"
  local product_name prompt
  product_name="$(basename "$product_path")"

  prompt="$(cat <<PROMPT
You are the Phase 03 product-spec agent for ${product_path}.

Read:
- ${HARNESS_PROCESS_DOC}
- docs/ai-product-slice-harness/subagent-runner.sh
- ${HARNESS_FOUNDER_VISION}
- ${HARNESS_SLICE_UP_PLAN}
- SUBAGENTS.md
- ${product_path}/README.md
- ${product_path}/docs/specs/*.md
- ${product_path}/customers/*.md

Your job:
1. Expand or revise the product specs under ${product_path}/docs/specs/ into complete workable specs.
2. Use the short names and plain-language jobs from the slice-up plan. Define any unavoidable specialist term the first time it appears.
3. State whether this product lives under apps/, packages/ui/, packages/lib/, or packages/datastore/. Apps are runnable; UI packages own reusable screens; lib packages own behavior; datastore packages own durable data. Name the durable data it owns, or say explicitly that it owns none.
4. Do not invent another product or UI package. The generated product list must match the selected slice-up headings exactly. Every package must instead own exactly one package-local Isolation Demo: a separately launchable factory-floor UI for exercising that package without the production app. The Isolation Demo is a customer and runnable target inside the package, not another product or phase agent.
5. For every main operation, name a concrete input, action, and output. Prefer simple function-level language such as "findPlayLinks(listingPage) returns play URLs" over broad abstractions.
6. Include an interface inventory. For each callable interface, state the caller, input, output, store read or changed, and failure result.
7. Name every normal product screen and every Isolation Demo screen or tab. For each, list what appears there, the main controls, what changes after the main action, and the exact question the screen answers.
8. Label the data mode of every Isolation Demo screen as fixture, generated, real read-only, real write, or a deliberate switch between modes. State the safe default and make real versus sample data visually unmistakable.
9. If this is a data store, define its small read/write interface and a record inspector UI. Real-data inspection should default to read-only; test writes should use a clearly marked sandbox unless the product spec requires an approved mutation path.
10. Include product goals, boundaries, library or UI surface, customer assumptions, event and telemetry expectations, validation steps, and first implementation checklist.
11. Make every Isolation Demo concrete: name the runtime, device or viewport, orientation assumptions, project or target shape, and the package-local launch command. Center it on the useful package input and output; keep fixtures and internal IDs secondary.
12. If this project is iOS-first, specify whether each Isolation Demo is an iPhone-runnable app, SwiftUI example, Xcode target, or another concrete package-local runner.
13. Fill the top third of each customer document inside ${product_path}/customers/ with this product producer-side understanding of that customer.
14. Leave the customer-request and producer-response sections as TODO placeholders for later phases.
15. Do not edit files outside ${product_path}.
16. Before finishing, write your phase result to this file: __HARNESS_RESULT_FILE__

Result file format:
STATUS: succeeded|blocked|failed
SUMMARY: <one-line summary>
DETAILS:
<details, especially if blocked or failed>
PROMPT
)"

  _run_codex_agent "$product_name" "$product_path" "$prompt"
}

_run_customer_request_agent() {
  local consumer_path="$1"
  local producer_path="$2"
  local customer_file="$3"
  local consumer_name producer_name prompt
  consumer_name="$(basename "$consumer_path")"
  producer_name="$(basename "$producer_path")"

  prompt="$(cat <<PROMPT
You are the Phase 04 customer-request agent for this relationship:
- Consumer: ${consumer_path}
- Producer: ${producer_path}

Read:
- ${HARNESS_PROCESS_DOC}
- docs/ai-product-slice-harness/subagent-runner.sh
- ${HARNESS_FOUNDER_VISION}
- ${HARNESS_SLICE_UP_PLAN}
- SUBAGENTS.md
- ${consumer_path}/README.md
- ${consumer_path}/docs/specs/*.md
- ${producer_path}/README.md
- ${producer_path}/docs/specs/*.md
- ${producer_path}/customers/${customer_file}.md

Your job:
1. Work from the perspective of ${consumer_path}.
2. Fill only the Middle Third: Customer Request section in ${producer_path}/customers/${customer_file}.md.
3. Read the producer document top third first. Treat it as the producer initial understanding, then write the consumer own request in response to it.
4. Use the consumer spec to describe the concrete integration plan: where the producer is used, whether it is imported as a library, embedded as a UI brick, called as a service, used as a data source, or consumed through events.
5. Be specific about requested APIs, function shapes, data models, UI surfaces, event names, event payloads, state snapshots, telemetry, timing, error behavior, undo/retry behavior, and testing hooks.
6. If there are multiple viable integration options, request the preferred option and call out alternatives or tradeoffs.
7. Ask for the details that will make the later implementation phase easier for the consumer. Do not write generic wishes if the consumer spec supports a concrete request.
8. Do not edit any other files.
9. Before finishing, write your phase result to this file: __HARNESS_RESULT_FILE__

Result file format:
STATUS: succeeded|blocked|failed
SUMMARY: <one-line summary>
DETAILS:
<details, especially if blocked or failed>
PROMPT
)"

  _run_codex_agent "${consumer_name}-uses-${producer_name}" "${consumer_path} -> ${producer_path}" "$prompt"
}

_run_isolation_demo_request_agent() {
  local product_path="$1"
  local product_name prompt
  product_name="$(basename "$product_path")"

  prompt="$(cat <<PROMPT
You are the Phase 04 Isolation Demo customer-request agent for ${product_path}.

Read:
- ${HARNESS_PROCESS_DOC}
- ${HARNESS_FOUNDER_VISION}
- ${HARNESS_SLICE_UP_PLAN}
- SUBAGENTS.md
- ${product_path}/README.md
- ${product_path}/docs/specs/*.md
- ${product_path}/customers/00-isolation-demo.md

The Isolation Demo is the standing founder/developer customer for this package.
It must operate the package by itself, without launching or depending on the
production app. It is package-local and is not another product package.

Your job:
1. Work from the perspective of a founder/developer operating ${product_path} alone.
2. Fill only the Middle Third: Customer Request section in ${product_path}/customers/00-isolation-demo.md.
3. Request a concrete package-local runnable UI that exposes every primary interface with representative inputs, outputs, intermediate state, failures, and explanations.
4. Name the launch command, runtime, screens or tabs, controls, fixture/generated/real modes, safe defaults, reset behavior, failure simulations, event feed, and secondary diagnostics.
5. Require the demo to use the same public interfaces promised to production customers. It must not reimplement package behavior or require the production app.
6. Keep this proportional to the package. The Isolation Demo proves the package factory floor; it is not another product team.
7. Do not edit any other files.
8. Before finishing, write your phase result to this file: __HARNESS_RESULT_FILE__

Result file format:
STATUS: succeeded|blocked|failed
SUMMARY: <one-line summary>
DETAILS:
<details, especially if blocked or failed>
PROMPT
)"

  _run_codex_agent "${product_name}-isolation-demo" "${product_path} -> isolation demo" "$prompt"
}

_run_producer_response_agent() {
  local producer_path="$1"
  local producer_name prompt
  producer_name="$(basename "$producer_path")"

  prompt="$(cat <<PROMPT
You are the Phase 05 producer-response agent for ${producer_path}.

Read:
- ${HARNESS_PROCESS_DOC}
- docs/ai-product-slice-harness/subagent-runner.sh
- ${HARNESS_FOUNDER_VISION}
- ${HARNESS_SLICE_UP_PLAN}
- SUBAGENTS.md
- ${producer_path}/README.md
- ${producer_path}/docs/specs/*.md
- ${producer_path}/customers/*.md

Your job:
1. Work from the perspective of ${producer_path}.
2. For each customer document in ${producer_path}/customers/, fill only the Bottom Third: Producer Response section.
3. Explain how this producer will meet the customer request, including accepted requests, rejected requests, tradeoffs, and open questions.
4. Update the relevant specs under ${producer_path}/docs/specs/ so they reflect the producer responses.
5. Do not edit files outside ${producer_path}.
6. Before finishing, write your phase result to this file: __HARNESS_RESULT_FILE__

Result file format:
STATUS: succeeded|blocked|failed
SUMMARY: <one-line summary>
DETAILS:
<details, especially if blocked or failed>
PROMPT
)"

  _run_codex_agent "$producer_name" "$producer_path" "$prompt"
}

_run_first_implementation_agent() {
  local product_path="$1"
  local product_name prompt
  product_name="$(basename "$product_path")"

  prompt="$(cat <<PROMPT
You are the Phase 06 first-implementation agent for ${product_path}.

Read:
- ${HARNESS_PROCESS_DOC}
- docs/ai-product-slice-harness/subagent-runner.sh
- ${HARNESS_FOUNDER_VISION}
- ${HARNESS_SLICE_UP_PLAN}
- SUBAGENTS.md
- ${product_path}/README.md
- ${product_path}/docs/specs/*.md
- ${product_path}/customers/*.md

Your job:
1. Build the first minimum viable product for ${product_path} from its completed spec and customer documents.
2. Include the package core behavior, promised library or UI surface, package-local Isolation Demo, event feed, telemetry/debug views, and validation steps described in the spec.
3. Work only inside ${product_path} unless the spec explicitly requires a scoped integration edit.
4. Do not edit unrelated packages.
5. Before finishing, write your phase result to this file: __HARNESS_RESULT_FILE__

Result file format:
STATUS: succeeded|blocked|failed
SUMMARY: <one-line summary>
DETAILS:
<details, especially if blocked or failed>
PROMPT
)"

  _run_codex_agent "$product_name" "$product_path" "$prompt"
}

_run_iteration_specs_for_product() {
  local product_path="$1"
  local product_name spec_file spec_name failed found
  product_name="$(basename "$product_path")"
  failed=0
  found=0

  shopt -s nullglob
  local spec_files=("$HARNESS_ROOT_DIR/$product_path/docs/specs/"*.md)
  if [[ "${#spec_files[@]}" -eq 0 ]]; then
    _write_noop_status "$product_name" "$product_path" "No unresolved specs found."
    return 0
  fi

  for spec_file in "${spec_files[@]}"; do
    if _spec_is_unresolved "$spec_file"; then
      found=1
      spec_name="$(basename "$spec_file" .md)"
      if ! _run_iteration_spec_agent "$product_path" "$spec_file" "${product_name}-${spec_name}"; then
        failed=1
        break
      fi
    fi
  done

  if [[ "$found" == "0" ]]; then
    _write_noop_status "$product_name" "$product_path" "No unresolved specs found."
  fi

  if [[ "$failed" != "0" ]]; then
    _write_phase_group_status "$product_name" "$product_path" "failed" "Stopped after a blocked or failed spec. Later specs for this product were not run."
    return 1
  fi

  if [[ "$found" == "1" ]]; then
    _write_phase_group_status "$product_name" "$product_path" "succeeded" "All unresolved specs for this product were processed."
  fi

  return 0
}

_write_noop_status() {
  local run_label="$1"
  local status_label="$2"
  local summary="$3"
  local artifact_name
  artifact_name="$(_artifact_name "$run_label")"
  local status_file="$HARNESS_STATUS_DIR/${artifact_name}.status"
  local log_file="$HARNESS_LOG_DIR/${artifact_name}.log"
  local result_file="$HARNESS_RESULT_DIR/${artifact_name}.result"

  {
    echo "STATUS: succeeded"
    echo "SUMMARY: $summary"
    echo "DETAILS:"
  } >"$result_file"

  {
    echo "succeeded"
    echo "$status_label"
    echo "log: $log_file"
    echo "result: $result_file"
    echo "summary: $summary"
  } >"$status_file"

  echo "$summary" >"$log_file"
}

_write_queued_status() {
  local run_label="$1"
  local status_label="$2"
  local summary="$3"
  local artifact_name
  artifact_name="$(_artifact_name "$run_label")"
  local status_file="$HARNESS_STATUS_DIR/${artifact_name}.status"
  local log_file="$HARNESS_LOG_DIR/${artifact_name}.log"
  local result_file="$HARNESS_RESULT_DIR/${artifact_name}.result"

  {
    echo "queued"
    echo "$status_label"
    echo "log: $log_file"
    echo "result: $result_file"
    echo "summary: $summary"
  } >"$status_file"

  echo "$summary" >"$log_file"
  : >"$result_file"
}

_write_phase_group_status() {
  local run_label="$1"
  local status_label="$2"
  local status="$3"
  local summary="$4"
  local artifact_name
  artifact_name="$(_artifact_name "$run_label")"
  local status_file="$HARNESS_STATUS_DIR/${artifact_name}.status"
  local log_file="$HARNESS_LOG_DIR/${artifact_name}.log"
  local result_file="$HARNESS_RESULT_DIR/${artifact_name}.result"

  {
    echo "STATUS: $status"
    echo "SUMMARY: $summary"
    echo "DETAILS:"
    if [[ "$status" != "succeeded" ]]; then
      echo "$summary"
    fi
  } >"$result_file"

  {
    echo "$status"
    echo "$status_label"
    echo "log: $log_file"
    echo "result: $result_file"
    echo "summary: $summary"
  } >"$status_file"

  echo "$summary" >"$log_file"
}

_artifact_name() {
  local run_label="$1"
  if [[ -n "$HARNESS_RUN_ID" ]]; then
    printf '%s-%s-%s' "$HARNESS_PHASE" "$HARNESS_RUN_ID" "$run_label"
  else
    printf '%s-%s' "$HARNESS_PHASE" "$run_label"
  fi
}

_spec_is_unresolved() {
  local spec_file="$1"
  local status

  status="$(awk -F: 'tolower($1) == "spec status" { gsub(/^[ \t]+|[ \t]+$/, "", $2); print tolower($2); exit }' "$spec_file")"
  [[ "$status" == "unresolved" ]]
}

print_phase07_spec_status_summary() {
  python3 - "$HARNESS_ROOT_DIR" <<'PY'
import glob
import os
import re
import sys
from collections import Counter, defaultdict

root_dir = sys.argv[1]
glob_label = "**/docs/specs/*.md"
spec_paths = sorted(
    path
    for path in glob.glob(os.path.join(root_dir, glob_label), recursive=True)
    if os.path.isfile(path)
)

package_statuses = defaultdict(Counter)
status_totals = Counter()

for spec_path in spec_paths:
    relative_path = os.path.relpath(spec_path, root_dir)
    if relative_path.startswith("docs/specs/"):
        package_path = "docs"
    else:
        package_path = relative_path.split("/docs/specs/", 1)[0]
    status = "missing"

    with open(spec_path, "r", encoding="utf-8") as spec_file:
        for line in spec_file:
            match = re.match(r"\s*Spec Status\s*:\s*(.*?)\s*$", line, re.IGNORECASE)
            if match:
                status = match.group(1).strip().lower() or "blank"
                break

    package_statuses[package_path][status] += 1
    status_totals[status] += 1

statuses = sorted(status_totals)

print()
print(f"Phase 07 spec status summary (discovered by {glob_label}):")
if not spec_paths:
    print("  No spec files found.")
    raise SystemExit(0)

for package_path in sorted(package_statuses):
    counts = package_statuses[package_path]
    total = sum(counts.values())
    status_parts = ", ".join(f"{status}: {counts[status]}" for status in statuses if counts[status])
    print(f"  {package_path}: total {total}; {status_parts}")

total_parts = ", ".join(f"{status}: {status_totals[status]}" for status in statuses)
print(f"  TOTAL: total {len(spec_paths)}; {total_parts}")
PY
}

_print_unresolved_specs_for_product() {
  local product_path="$1"
  local product_name spec_file spec_name relative_spec found index
  product_name="$(basename "$product_path")"
  found=0
  index=1

  shopt -s nullglob
  local spec_files=("$HARNESS_ROOT_DIR/$product_path/docs/specs/"*.md)
  if [[ "${#spec_files[@]}" -eq 0 ]]; then
    return 1
  fi

  for spec_file in "${spec_files[@]}"; do
    if _spec_is_unresolved "$spec_file"; then
      if [[ "$found" == "0" ]]; then
        echo "  $product_path"
        found=1
      fi
      spec_name="$(basename "$spec_file" .md)"
      relative_spec="${spec_file#$HARNESS_ROOT_DIR/}"
      echo "    $index. $relative_spec"
      echo "       run label: ${product_name}-${spec_name}"
      index=$((index + 1))
    fi
  done

  [[ "$found" == "1" ]]
}

_run_iteration_spec_agent() {
  local product_path="$1"
  local spec_file="$2"
  local run_label="$3"
  local relative_spec prompt
  relative_spec="${spec_file#$HARNESS_ROOT_DIR/}"

  prompt="$(cat <<PROMPT
You are the Phase 07 iteration agent for ${product_path}.

Read:
- ${HARNESS_PROCESS_DOC}
- docs/ai-product-slice-harness/subagent-runner.sh
- ${HARNESS_FOUNDER_VISION}
- ${HARNESS_SLICE_UP_PLAN}
- SUBAGENTS.md
- ${product_path}/README.md
- ${product_path}/docs/specs/*.md
- ${product_path}/customers/*.md

Your work order spec:
- ${relative_spec}

Your job:
1. Work on ${relative_spec} and files inside ${product_path}.
2. Implement or document the requested feedback in the work order spec.
3. If code changes are made, update the product README or relevant docs with how to run or validate the change.
4. Update ${relative_spec} by changing "Spec Status: unresolved" to "Spec Status: resolved" when complete.
5. Add a "Resolution" section to ${relative_spec} explaining what changed, what was not done, and how to validate it.
6. If blocked, leave "Spec Status: unresolved" and add a "Blocked" section describing what input is needed.
7. Never create actionable specs with "Spec Status: proposed". Phase 07 only detects "Spec Status: unresolved"; proposed specs are ignored by the runner.
8. Do not edit another package or app implementation. The only cross-product write allowed by default is creating a timestamped unresolved downstream request spec under a customer or consumer product's docs/specs/ folder when your change creates new integration work for that product.
9. If you create downstream request specs, mention them in ${relative_spec}'s Resolution or Blocked section.
10. Before finishing, write your phase result to this file: __HARNESS_RESULT_FILE__

Result file format:
STATUS: succeeded|blocked|failed
SUMMARY: <one-line summary>
DETAILS:
<details, especially if blocked or failed>
PROMPT
)"

  _run_codex_agent "$run_label" "$product_path / ${relative_spec}" "$prompt"
}
