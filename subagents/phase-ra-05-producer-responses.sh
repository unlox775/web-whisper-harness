#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/docs/ai-product-slice-harness/rearchitecture-common.sh"
resolve_rearchitecture_plan
require_rearchitecture_status "active"
export PHASE_RUN_ID="${PHASE_RUN_ID:-$REARCH_ID_RESOLVED}"
source "$ROOT_DIR/docs/ai-product-slice-harness/subagent-runner.sh"

start_phase "phase-ra-05-producer-responses"
print_rearchitecture_header
SCOPE_SUMMARY="$(rearchitecture_scope_summary)"

require_phase_successes "phase-ra-04-customer-requests" \
  "customer-requests"

set_phase_context "$(cat <<CONTEXT
This is a Phase RA-05 producer-response pass for ${REARCH_PLAN_RELATIVE}.

Machine-readable re-architecture scope:
${SCOPE_SUMMARY}

Each producer agent should fill producer-response sections for its customer docs and update specs for accepted/rejected requests, tradeoffs, open questions, and implementation scope.
Keep package boundaries faithful to the re-architecture plan; do not let the final app absorb durable package-owned UI by default.
Do not implement production behavior.

Read prior RA results:
- subagents/results/phase-ra-02-scaffold-${REARCH_ID_RESOLVED}-scaffold.result
- subagents/results/phase-ra-03-product-specs-${REARCH_ID_RESOLVED}-product-specs.result
- subagents/results/phase-ra-04-customer-requests-${REARCH_ID_RESOLVED}-customer-requests.result
CONTEXT
)$(
  if [[ "${*:-}" != "" ]]; then
    printf '\n%s' "$*"
  fi
)"

while IFS= read -r producer; do
  [[ -n "$producer" ]] && enqueue_producer_response_agent "$producer"
done < <(rearchitecture_unique_producers)

run_enqueued_agents_in_parallel

_write_phase_group_status \
  "producer-responses" \
  "$REARCH_PLAN_RELATIVE" \
  "succeeded" \
  "RA-05 producer-response agents completed for producers in the machine-readable re-architecture relationships."

print_human_checkpoint \
  "RA-05 Producer Responses" \
  "Ran producer-response agents for producers in the re-architecture relationship graph." \
  "Review the accepted package contracts. This is the required human pause before code agents start moving or replacing production surfaces." \
  "PHASE_CONFIRMED=1 make phase-ra-6"
