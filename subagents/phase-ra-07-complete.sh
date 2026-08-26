#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/docs/ai-product-slice-harness/rearchitecture-common.sh"
resolve_rearchitecture_plan
require_rearchitecture_status "active"
export PHASE_RUN_ID="${PHASE_RUN_ID:-$REARCH_ID_RESOLVED}"
source "$ROOT_DIR/docs/ai-product-slice-harness/subagent-runner.sh"

start_phase "phase-ra-07-complete"
print_rearchitecture_header

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

ra_spec_is_unresolved_for_active_plan() {
  local spec_file="$1"
  local status rearchitecture

  status="$(ra_spec_field "$spec_file" "Spec Status" | tr '[:upper:]' '[:lower:]')"
  rearchitecture="$(ra_spec_field "$spec_file" "Re-Architecture")"
  [[ -n "$status" && "$status" != "resolved" && "$rearchitecture" == "$REARCH_PLAN_RELATIVE" ]]
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
        if ra_spec_is_unresolved_for_active_plan "$spec_file"; then
          RA_REMAINING_SPECS+=("${spec_file#$ROOT_DIR/}")
          RA_REMAINING_COUNT=$((RA_REMAINING_COUNT + 1))
        fi
      done
    done < <(rearchitecture_section_items "$heading")
  done
}

require_phase_successes "phase-ra-06-implementation" \
  "implementation"

ra_collect_remaining_specs
if [[ "$RA_REMAINING_COUNT" != "0" ]]; then
  echo "Refusing to complete $REARCH_ID_RESOLVED because unresolved re-architecture specs remain:" >&2
  for remaining_spec in "${RA_REMAINING_SPECS[@]}"; do
    echo "- $remaining_spec" >&2
  done
  echo "Run Phase RA-06 again before phase-ra-complete." >&2
  exit 2
fi

require_phase_ready "Re-architecture implementation has succeeded. Completion is gated so the human can validate the app and package Isolation Demos before the main docs are reconciled and the plan is marked succeeded."

prompt="$(cat <<PROMPT
You are the re-architecture completion agent for ${REARCH_PLAN_RELATIVE}.

Read:
- ${HARNESS_PROCESS_DOC}
- ${HARNESS_FOUNDER_VISION}
- ${HARNESS_SLICE_UP_PLAN}
- README.md
- SUBAGENTS.md
- ${REARCH_PLAN_RELATIVE}
- subagents/results/phase-ra-03-product-specs-${REARCH_ID_RESOLVED}-*.result
- subagents/results/phase-ra-04-customer-requests-${REARCH_ID_RESOLVED}-*.result
- subagents/results/phase-ra-05-producer-responses-${REARCH_ID_RESOLVED}-*.result
- subagents/results/phase-ra-06-implementation-${REARCH_ID_RESOLVED}-*.result

Your job:
1. Reconcile the main architecture docs after the completed re-architecture.
2. Update ${HARNESS_SLICE_UP_PLAN} so the current selected product boundary reflects the completed re-architecture while preserving prior choices as design history.
3. Update ${HARNESS_FOUNDER_VISION} only if the completed re-architecture changed the founder/product framing that future agents should know.
4. Update README.md and SUBAGENTS.md if they still describe the old package set as the current architecture.
5. Mark ${REARCH_PLAN_RELATIVE} as complete by changing "Re-Architecture Status: active" to "Re-Architecture Status: succeeded" and adding a short Completion section with validation notes and any remaining follow-up.
6. Do not implement app/package behavior in this completion phase.
7. Before finishing, write your phase result to this file: __HARNESS_RESULT_FILE__

Result file format:
STATUS: succeeded|blocked|failed
SUMMARY: <one-line summary>
DETAILS:
<details, especially if blocked or failed>
PROMPT
)"

_run_codex_agent "documentation-reconcile" "$REARCH_PLAN_RELATIVE" "$prompt"

print_human_checkpoint \
  "RA-07 Complete" \
  "Reconciled main docs and marked the selected re-architecture succeeded if validation supported completion." \
  "Review the doc reconciliation. After this point another proposed re-architecture can be created and run with the same RA commands." \
  "make phase-7 or create the next docs/re-architectures/<timestamp>-<slug>.md"
