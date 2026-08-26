#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export CODEX_ADD_DIRS="${CODEX_ADD_DIRS:-$HOME/Library/Caches/org.swift.swiftpm:$HOME/Library/Caches/com.apple.dt.Xcode:$HOME/Library/Developer/Xcode/DerivedData:/private/tmp}"
source "$ROOT_DIR/docs/ai-product-slice-harness/rearchitecture-common.sh"
resolve_rearchitecture_plan
require_rearchitecture_status "active"
export PHASE_RUN_ID="${PHASE_RUN_ID:-$REARCH_ID_RESOLVED}"
source "$ROOT_DIR/docs/ai-product-slice-harness/subagent-runner.sh"

PHASE_DRY_RUN="${PHASE_DRY_RUN:-0}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      PHASE_DRY_RUN=1
      shift
      ;;
    --)
      shift
      break
      ;;
    *)
      break
      ;;
  esac
done

start_phase "phase-ra-06-implementation"
print_rearchitecture_header
SCOPE_SUMMARY="$(rearchitecture_scope_summary)"

require_phase_successes "phase-ra-05-producer-responses" \
  "producer-responses"

if [[ "$PHASE_DRY_RUN" != "1" ]]; then
  require_phase_ready "Re-architecture Phase RA-05 has succeeded. Phase RA-06 is intentionally gated for human review before implementation starts."
fi

set_phase_context "$(cat <<CONTEXT
This is a Phase RA-06 implementation pass for ${REARCH_PLAN_RELATIVE}.

Machine-readable re-architecture scope:
${SCOPE_SUMMARY}

Each implementation agent should work on its own product according to the completed RA specs/customer docs.
Use a strangler migration where old app-owned surfaces need to be replaced by package-owned surfaces.
Prefer proving package-owned surfaces and package-local Isolation Demos before final app integration, unless specs explicitly call for a small integration bridge.
Run focused validation where practical and document what passed or could not run.
Do not mark the re-architecture succeeded; that is the later completion phase after human validation.

Read prior RA results:
- subagents/results/phase-ra-02-scaffold-${REARCH_ID_RESOLVED}-scaffold.result
- subagents/results/phase-ra-03-product-specs-${REARCH_ID_RESOLVED}-product-specs.result
- subagents/results/phase-ra-04-customer-requests-${REARCH_ID_RESOLVED}-customer-requests.result
- subagents/results/phase-ra-05-producer-responses-${REARCH_ID_RESOLVED}-producer-responses.result
CONTEXT
)$(
  if [[ "${*:-}" != "" ]]; then
    printf '\n%s' "$*"
  fi
)"

ra_spec_field() {
  local spec_file="$1"
  local field_name="$2"

  awk -F: -v wanted="$(printf '%s' "$field_name" | tr '[:upper:]' '[:lower:]')" '
    {
      key = tolower($1)
      gsub(/^[ \t]+|[ \t]+$/, "", key)
      if (key == wanted) {
        value = substr($0, index($0, ":") + 1)
        gsub(/^[ \t]+|[ \t]+$/, "", value)
        print value
        exit
      }
    }
  ' "$spec_file"
}

ra_spec_status_is_not_resolved() {
  local spec_file="$1"
  local status

  status="$(ra_spec_field "$spec_file" "Spec Status" | tr '[:upper:]' '[:lower:]')"
  [[ -n "$status" && "$status" != "resolved" ]]
}

ra_spec_matches_active_rearchitecture() {
  local spec_file="$1"
  local rearchitecture

  rearchitecture="$(ra_spec_field "$spec_file" "Re-Architecture")"
  [[ "$rearchitecture" == "$REARCH_PLAN_RELATIVE" ]]
}

ra_select_specs_for_product() {
  local product_path="$1"
  local spec_file

  RA_SELECTED_SPECS=()
  RA_SELECTED_COUNT=0
  shopt -s nullglob
  local spec_files=("$ROOT_DIR/$product_path/docs/specs/"*.md)
  for spec_file in "${spec_files[@]}"; do
    if ra_spec_status_is_not_resolved "$spec_file" && ra_spec_matches_active_rearchitecture "$spec_file"; then
      RA_SELECTED_SPECS+=("$spec_file")
      RA_SELECTED_COUNT=$((RA_SELECTED_COUNT + 1))
    fi
  done
}

ra_should_run_label() {
  local run_label="$1"
  local product_name="$2"

  if [[ -z "$HARNESS_ONLY" ]]; then
    return 0
  fi

  case ",$HARNESS_ONLY," in
    *",$run_label,"*|*",$product_name,"*) return 0 ;;
    *) return 1 ;;
  esac
}

ra_print_selected_specs_for_product() {
  local product_path="$1"
  local product_name spec_file spec_name relative_spec run_label index
  product_name="$(basename "$product_path")"
  index=1

  ra_select_specs_for_product "$product_path"
  if [[ "$RA_SELECTED_COUNT" == "0" ]]; then
    echo "  $product_path: no unresolved specs for $REARCH_PLAN_RELATIVE"
    return 0
  fi

  echo "  $product_path"
  for spec_file in "${RA_SELECTED_SPECS[@]}"; do
    spec_name="$(basename "$spec_file" .md)"
    relative_spec="${spec_file#$ROOT_DIR/}"
    run_label="${product_name}-${spec_name}"
    if ra_should_run_label "$run_label" "$product_name"; then
      echo "    $index. $relative_spec"
      echo "       run label: $run_label"
    else
      echo "    skipping $run_label"
    fi
    index=$((index + 1))
  done
}

ra_run_spec_agent() {
  local product_path="$1"
  local spec_file="$2"
  local run_label="$3"
  local relative_spec prompt
  relative_spec="${spec_file#$ROOT_DIR/}"

  prompt="$(cat <<PROMPT
You are the Phase RA-06 implementation agent for ${product_path}.

Active re-architecture plan:
- ${REARCH_PLAN_RELATIVE}

Your assigned implementation spec:
- ${relative_spec}

Read:
- ${HARNESS_PROCESS_DOC}
- docs/ai-product-slice-harness/subagent-runner.sh
- docs/ai-product-slice-harness/rearchitecture-common.sh
- ${HARNESS_FOUNDER_VISION}
- ${HARNESS_SLICE_UP_PLAN}
- SUBAGENTS.md
- ${REARCH_PLAN_RELATIVE}
- ${product_path}/README.md
- ${relative_spec}
- ${product_path}/customers/*.md

Important scope rules:
1. Implement exactly ${relative_spec}. Do not implement other unresolved specs just because they are nearby.
2. The spec must have "Re-Architecture: ${REARCH_PLAN_RELATIVE}" and must remain the source of truth for this agent.
3. Work primarily inside ${product_path}. Edit another package or app only when ${relative_spec} explicitly requires a scoped integration change.
4. If your work creates new downstream integration work for a customer product, create a timestamped unresolved spec in that customer product's docs/specs/ folder and mention it in ${relative_spec}.
5. Do not mark any unrelated spec resolved. Do not mark the re-architecture plan succeeded.

Your job:
1. Read ${relative_spec}'s Inputs To Read, Implementation Checklist, Definition Of Done, Validation Plan, and Agent Guardrails sections.
2. Make the code and documentation changes needed to satisfy ${relative_spec}.
3. Run the focused validation described by the spec where practical.
4. When complete, update ${relative_spec} by changing its Spec Status to resolved and adding a Phase RA-06 Implementation Resolution section with what changed, what validated, and any residual risk.
5. If blocked, leave the spec not resolved, add a Blocked section to ${relative_spec}, and write a blocked result.
6. Before finishing, write your phase result to this file: __HARNESS_RESULT_FILE__

Result file format:
STATUS: succeeded|blocked|failed
SUMMARY: <one-line summary>
DETAILS:
<details, especially if blocked or failed>
PROMPT
)"

  _run_codex_agent "$run_label" "$product_path / $relative_spec" "$prompt"
}

ra_process_product() {
  local product_path="$1"
  local product_name spec_file spec_name run_label failed found runnable_count
  product_name="$(basename "$product_path")"
  failed=0
  found=0
  runnable_count=0

  ra_select_specs_for_product "$product_path"
  if [[ "$RA_SELECTED_COUNT" != "0" ]]; then
    for spec_file in "${RA_SELECTED_SPECS[@]}"; do
      spec_name="$(basename "$spec_file" .md)"
      run_label="${product_name}-${spec_name}"
      if ra_should_run_label "$run_label" "$product_name"; then
        runnable_count=$((runnable_count + 1))
      fi
    done
  fi

  if [[ "$runnable_count" == "0" ]]; then
    _write_noop_status "$product_name" "$product_path" "No unresolved specs found for $REARCH_PLAN_RELATIVE."
    return 0
  fi

  _write_queued_status "$product_name" "$product_path" "Queued $runnable_count unresolved spec(s) for $REARCH_PLAN_RELATIVE."

  if [[ "$RA_SELECTED_COUNT" != "0" ]]; then
    for spec_file in "${RA_SELECTED_SPECS[@]}"; do
      spec_name="$(basename "$spec_file" .md)"
      run_label="${product_name}-${spec_name}"
      if ! ra_should_run_label "$run_label" "$product_name"; then
        echo "skipping $run_label"
        continue
      fi

      found=1
      if ! ra_run_spec_agent "$product_path" "$spec_file" "$run_label"; then
        failed=1
        break
      fi
    done
  fi

  if [[ "$failed" != "0" ]]; then
    _write_phase_group_status "$product_name" "$product_path" "failed" "Stopped after a blocked or failed RA-06 spec. Later specs for this product were not run."
    return 1
  fi

  if [[ "$found" == "1" ]]; then
    _write_phase_group_status "$product_name" "$product_path" "succeeded" "All selected unresolved RA-06 specs for this product were processed."
  fi

  return 0
}

run_scope_group_serial() {
  local label="$1"
  local heading="$2"
  local item failed found group_count index
  failed=0
  found=0
  group_count=0
  RA_GROUP_ITEMS=()

  echo "Processing $label group..."
  while IFS= read -r item; do
    [[ -z "$item" ]] && continue
    RA_GROUP_ITEMS+=("$item")
    group_count=$((group_count + 1))
  done < <(rearchitecture_section_items "$heading")

  if [[ "$group_count" != "0" ]]; then
    for ((index = 0; index < group_count; index++)); do
      item="${RA_GROUP_ITEMS[$index]}"
    found=1
    if [[ "$PHASE_DRY_RUN" == "1" ]]; then
      ra_print_selected_specs_for_product "$item"
    elif ! ra_process_product "$item"; then
      failed=1
    fi
    done
  fi

  if [[ "$found" == "0" ]]; then
    echo "No $label components."
  fi

  if [[ "$failed" != "0" ]]; then
    return 1
  fi

  return 0
}

ra_collect_remaining_specs() {
  local heading item spec_file

  RA_REMAINING_SPECS=()
  RA_REMAINING_COUNT=0
  for heading in \
    "Re-Architecture New Components" \
    "Re-Architecture Refactor Components" \
    "Re-Architecture Phase-Out Components" \
    "Re-Architecture Final App"; do
    while IFS= read -r item; do
      [[ -z "$item" ]] && continue
      shopt -s nullglob
      for spec_file in "$ROOT_DIR/$item/docs/specs/"*.md; do
        if ra_spec_status_is_not_resolved "$spec_file" && ra_spec_matches_active_rearchitecture "$spec_file"; then
          RA_REMAINING_SPECS+=("${spec_file#$ROOT_DIR/}")
          RA_REMAINING_COUNT=$((RA_REMAINING_COUNT + 1))
        fi
      done
    done < <(rearchitecture_section_items "$heading")
  done
}

if [[ "$PHASE_DRY_RUN" == "1" ]]; then
  echo "Phase RA-06 dry run. No agents will be launched."
  echo "Only specs with Re-Architecture: $REARCH_PLAN_RELATIVE and Spec Status not resolved are selected."
  echo
else
  _print_phase_watch_command
fi

phase_exit=0

if ! run_scope_group_serial "new-component" "Re-Architecture New Components"; then
  phase_exit=1
elif ! run_scope_group_serial "refactor-component" "Re-Architecture Refactor Components"; then
  phase_exit=1
elif ! run_scope_group_serial "phase-out-component" "Re-Architecture Phase-Out Components"; then
  phase_exit=1
elif ! run_scope_group_serial "final-app" "Re-Architecture Final App"; then
  phase_exit=1
fi

if [[ "$PHASE_DRY_RUN" == "1" ]]; then
  exit 0
fi

if [[ "$phase_exit" != "0" ]]; then
  if [[ -z "$HARNESS_ONLY" ]]; then
    _write_phase_group_status \
      "implementation" \
      "$REARCH_PLAN_RELATIVE" \
      "failed" \
      "RA-06 stopped because one or more selected re-architecture specs failed or blocked."
  fi
  exit 1
fi

if [[ -n "$HARNESS_ONLY" ]]; then
  echo "Scoped RA-06 run complete for PHASE_ONLY=$HARNESS_ONLY."
  echo "Run the full RA-06 phase without PHASE_ONLY when you want to write the global implementation success marker."
  exit 0
fi

ra_collect_remaining_specs
if [[ "$RA_REMAINING_COUNT" != "0" ]]; then
  {
    echo "RA-06 cannot write the global implementation success marker because unresolved re-architecture specs remain:"
    for remaining_spec in "${RA_REMAINING_SPECS[@]}"; do
      echo "- $remaining_spec"
    done
  } >&2
  _write_phase_group_status \
    "implementation" \
    "$REARCH_PLAN_RELATIVE" \
    "failed" \
    "RA-06 finished with $RA_REMAINING_COUNT unresolved re-architecture spec(s) still remaining."
  exit 1
fi

_write_phase_group_status \
  "implementation" \
  "$REARCH_PLAN_RELATIVE" \
  "succeeded" \
  "RA-06 processed all selected unresolved specs for the active re-architecture."

print_human_checkpoint \
  "RA-06 Implementation" \
  "Ran one implementation agent per selected unresolved re-architecture spec, with packages processed before the final app." \
  "Validate the app and package Isolation Demos. If the re-architecture is truly complete, run the completion command so the plan becomes terminal and the main docs can be reconciled." \
  "make phase-ra-complete"
