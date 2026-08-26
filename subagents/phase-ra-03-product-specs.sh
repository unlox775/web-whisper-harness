#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/docs/ai-product-slice-harness/rearchitecture-common.sh"
resolve_rearchitecture_plan
require_rearchitecture_status "active"
export PHASE_RUN_ID="${PHASE_RUN_ID:-$REARCH_ID_RESOLVED}"
source "$ROOT_DIR/docs/ai-product-slice-harness/subagent-runner.sh"

start_phase "phase-ra-03-product-specs"
print_rearchitecture_header
SCOPE_SUMMARY="$(rearchitecture_scope_summary)"

require_phase_successes "phase-ra-02-scaffold" \
  "scaffold"

if [[ "${*:-}" != "" ]]; then
  set_phase_context "$*"
fi

set_phase_context "$(cat <<CONTEXT
This is a Phase RA-03 product-spec pass for ${REARCH_PLAN_RELATIVE}.

Machine-readable re-architecture scope:
${SCOPE_SUMMARY}

Each product agent should identify its role in this re-architecture:
- new: create/expand first-class specs for a brand-new component.
- refactor: revise existing specs/customer understanding for changed ownership or contracts.
- phase-out: document strangler/bridge behavior and what ownership should leave this component.
- final-app: run last; focus on app shell/composition/integration expectations.

Read the RA-02 result before editing:
subagents/results/phase-ra-02-scaffold-${REARCH_ID_RESOLVED}-scaffold.result

Do not implement production behavior in RA-03.
CONTEXT
)$(
  if [[ "${*:-}" != "" ]]; then
    printf '\n%s' "$*"
  fi
)"

enqueue_scope_group() {
  local heading="$1"
  local item
  while IFS= read -r item; do
    [[ -n "$item" ]] && enqueue_product_spec_agent "$item"
  done < <(rearchitecture_section_items "$heading")
}

run_scope_group() {
  local label="$1"
  if [[ "${#HARNESS_JOBS[@]}" -eq 0 ]]; then
    echo "No $label product-spec jobs."
    return 0
  fi
  echo "Running $label product-spec jobs..."
  run_enqueued_agents_in_parallel
  HARNESS_JOBS=()
}

enqueue_scope_group "Re-Architecture New Components"
run_scope_group "new-component"

enqueue_scope_group "Re-Architecture Refactor Components"
run_scope_group "refactor-component"

enqueue_scope_group "Re-Architecture Phase-Out Components"
run_scope_group "phase-out-component"

enqueue_scope_group "Re-Architecture Final App"
run_scope_group "final-app"

_write_phase_group_status \
  "product-specs" \
  "$REARCH_PLAN_RELATIVE" \
  "succeeded" \
  "RA-03 product-spec agents completed for the machine-readable re-architecture scope."

print_human_checkpoint \
  "RA-03 Product Specs" \
  "Ran ordered product-spec agents for the re-architecture scope." \
  "Review package specs and top-third customer docs. Resolve obviously wrong product boundaries before customer-request agents write integration demands." \
  "make phase-ra-4"
