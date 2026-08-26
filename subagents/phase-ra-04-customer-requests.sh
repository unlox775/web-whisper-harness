#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/docs/ai-product-slice-harness/rearchitecture-common.sh"
resolve_rearchitecture_plan
require_rearchitecture_status "active"
export PHASE_RUN_ID="${PHASE_RUN_ID:-$REARCH_ID_RESOLVED}"
source "$ROOT_DIR/docs/ai-product-slice-harness/subagent-runner.sh"

start_phase "phase-ra-04-customer-requests"
print_rearchitecture_header
SCOPE_SUMMARY="$(rearchitecture_scope_summary)"

require_phase_successes "phase-ra-03-product-specs" \
  "product-specs"

set_phase_context "$(cat <<CONTEXT
This is a Phase RA-04 customer-request pass for ${REARCH_PLAN_RELATIVE}.

Machine-readable re-architecture scope:
${SCOPE_SUMMARY}

Each relationship agent should fill only the customer-request section for its assigned relationship.
Focus on concrete APIs, UI slots, data models, callbacks, events, testing hooks, validation needs, and strangler integration requirements.
Do not fill producer responses and do not implement production behavior.

Read prior RA results:
- subagents/results/phase-ra-02-scaffold-${REARCH_ID_RESOLVED}-scaffold.result
- subagents/results/phase-ra-03-product-specs-${REARCH_ID_RESOLVED}-product-specs.result
CONTEXT
)$(
  if [[ "${*:-}" != "" ]]; then
    printf '\n%s' "$*"
  fi
)"

while IFS='|' read -r consumer producer customer_file; do
  [[ -z "${consumer:-}" ]] && continue
  enqueue_customer_request_agent "$consumer" "$producer" "$customer_file"
done < <(rearchitecture_relationship_jobs)

run_enqueued_agents_in_parallel

_write_phase_group_status \
  "customer-requests" \
  "$REARCH_PLAN_RELATIVE" \
  "succeeded" \
  "RA-04 customer-request agents completed for the machine-readable re-architecture relationships."

print_human_checkpoint \
  "RA-04 Customer Requests" \
  "Ran relationship agents for the re-architecture customer graph." \
  "Review the requested contracts. This is the place to catch overreach before producers accept or reject the requests." \
  "make phase-ra-5"
