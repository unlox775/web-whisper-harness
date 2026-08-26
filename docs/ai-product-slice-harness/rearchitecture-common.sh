#!/usr/bin/env bash

# Shared helpers for re-architecture phase scripts.
# This file is part of the reusable AI Product Slice Harness.

REARCH_ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
REARCH_DOC_DIR="$REARCH_ROOT_DIR/docs/re-architectures"
REARCH_ALLOWED_OPEN_STATUSES="proposed active"
REARCH_TERMINAL_STATUSES="succeeded abandoned"
REARCH_PLAN_PATH=""
REARCH_PLAN_RELATIVE=""
REARCH_ID_RESOLVED=""
REARCH_STATUS=""

_rearch_doc_id() {
  basename "$1" .md
}

_rearch_read_status() {
  local plan="$1"
  local status
  status="$(sed -n 's/^Re-Architecture Status:[[:space:]]*//p' "$plan" | sed -n '1p')"
  if [[ -z "$status" ]]; then
    status="$(sed -n 's/^Status:[[:space:]]*//p' "$plan" | sed -n '1p')"
  fi
  printf '%s' "$status"
}

_rearch_status_is_open() {
  local status="$1"
  case " $REARCH_ALLOWED_OPEN_STATUSES " in
    *" $status "*) return 0 ;;
    *) return 1 ;;
  esac
}

_rearch_status_is_terminal() {
  local status="$1"
  case " $REARCH_TERMINAL_STATUSES " in
    *" $status "*) return 0 ;;
    *) return 1 ;;
  esac
}

resolve_rearchitecture_plan() {
  local requested="${REARCH_ID:-}"
  local plan id status
  local open_plans=()
  local requested_plan=""

  if [[ ! -d "$REARCH_DOC_DIR" ]]; then
    echo "No re-architecture folder exists: docs/re-architectures" >&2
    exit 2
  fi

  shopt -s nullglob
  for plan in "$REARCH_DOC_DIR"/*.md; do
    id="$(_rearch_doc_id "$plan")"
    status="$(_rearch_read_status "$plan")"

    if [[ -n "$requested" && ( "$requested" == "$id" || "$requested" == "${id%%-*}" || "$requested" == "$plan" || "$requested" == "docs/re-architectures/$id.md" ) ]]; then
      requested_plan="$plan"
    fi

    if _rearch_status_is_open "$status"; then
      open_plans+=("$plan")
    elif ! _rearch_status_is_terminal "$status"; then
      echo "Re-architecture $id has unknown status '$status'." >&2
      echo "Use one of: proposed, active, succeeded, abandoned." >&2
      exit 2
    fi
  done
  shopt -u nullglob

  if [[ -n "$requested" ]]; then
    if [[ -z "$requested_plan" ]]; then
      echo "No re-architecture plan matched REARCH_ID=$requested" >&2
      exit 2
    fi

    local other_open=()
    for plan in "${open_plans[@]}"; do
      if [[ "$plan" != "$requested_plan" ]]; then
        other_open+=("$(_rearch_doc_id "$plan") [$(_rearch_read_status "$plan")]")
      fi
    done

    if [[ "${#other_open[@]}" -gt 0 ]]; then
      echo "Cannot start this re-architecture while another one is still open." >&2
      printf 'Open re-architecture: %s\n' "${other_open[@]}" >&2
      echo "Mark the other plan as succeeded or abandoned first." >&2
      exit 2
    fi
  else
    if [[ "${#open_plans[@]}" -eq 0 ]]; then
      echo "No proposed or active re-architecture plan found." >&2
      echo "Create docs/re-architectures/<timestamp>-<slug>.md with Re-Architecture Status: proposed." >&2
      exit 2
    fi

    if [[ "${#open_plans[@]}" -gt 1 ]]; then
      echo "More than one re-architecture plan is proposed or active." >&2
      for plan in "${open_plans[@]}"; do
        echo "- $(_rearch_doc_id "$plan") [$(_rearch_read_status "$plan")]" >&2
      done
      echo "Mark all but one as succeeded or abandoned, or rerun with REARCH_ID=<id> after closing the others." >&2
      exit 2
    fi

    requested_plan="${open_plans[0]}"
  fi

  REARCH_PLAN_PATH="$requested_plan"
  REARCH_ID_RESOLVED="$(_rearch_doc_id "$requested_plan")"
  REARCH_PLAN_RELATIVE="docs/re-architectures/${REARCH_ID_RESOLVED}.md"
  REARCH_STATUS="$(_rearch_read_status "$requested_plan")"
}

mark_rearchitecture_active() {
  resolve_rearchitecture_plan

  if [[ "$REARCH_STATUS" == "active" ]]; then
    return 0
  fi

  if [[ "$REARCH_STATUS" != "proposed" ]]; then
    echo "Cannot activate re-architecture $REARCH_ID_RESOLVED because status is $REARCH_STATUS." >&2
    exit 2
  fi

  python3 - "$REARCH_PLAN_PATH" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
if "Re-Architecture Status:" in text:
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if line.startswith("Re-Architecture Status:"):
            lines[index] = "Re-Architecture Status: active"
            break
    path.write_text("\n".join(lines) + "\n")
else:
    text = text.replace("\nCreated:", "\nRe-Architecture Status: active\nCreated:", 1)
    path.write_text(text)
PY
  REARCH_STATUS="active"
}

print_rearchitecture_header() {
  echo "Re-architecture: $REARCH_ID_RESOLVED"
  echo "Plan: $REARCH_PLAN_RELATIVE"
  echo "Status: $REARCH_STATUS"
  echo
}

rearchitecture_section_items() {
  local heading="$1"

  awk -v heading="$heading" '
    $0 == heading ":" { in_section = 1; next }
    in_section && /^- / {
      sub(/^- /, "")
      print
      next
    }
    in_section && NF == 0 { exit }
    in_section && $0 !~ /^- / { exit }
  ' "$REARCH_PLAN_PATH"
}

rearchitecture_scope_summary() {
  local section item

  for section in \
    "Re-Architecture New Components" \
    "Re-Architecture Refactor Components" \
    "Re-Architecture Phase-Out Components" \
    "Re-Architecture Final App" \
    "Re-Architecture Customer Relationships"; do
    echo "$section:"
    while IFS= read -r item; do
      [[ -n "$item" ]] && echo "- $item"
    done < <(rearchitecture_section_items "$section")
    echo
  done
}

rearchitecture_component_role() {
  local product_path="$1"

  if rearchitecture_section_items "Re-Architecture New Components" | awk -v item="$product_path" '$0 == item { found = 1 } END { exit found ? 0 : 1 }'; then
    echo "new"
    return 0
  fi
  if rearchitecture_section_items "Re-Architecture Refactor Components" | awk -v item="$product_path" '$0 == item { found = 1 } END { exit found ? 0 : 1 }'; then
    echo "refactor"
    return 0
  fi
  if rearchitecture_section_items "Re-Architecture Phase-Out Components" | awk -v item="$product_path" '$0 == item { found = 1 } END { exit found ? 0 : 1 }'; then
    echo "phase-out"
    return 0
  fi
  if rearchitecture_section_items "Re-Architecture Final App" | awk -v item="$product_path" '$0 == item { found = 1 } END { exit found ? 0 : 1 }'; then
    echo "final-app"
    return 0
  fi

  echo "maybe-affected"
}

rearchitecture_relationship_jobs() {
  local relationship consumer rest producer customer

  while IFS= read -r relationship; do
    [[ -z "$relationship" ]] && continue
    consumer="${relationship%% -> *}"
    rest="${relationship#* -> }"
    producer="${rest%% as *}"
    customer="${rest##* as }"
    if [[ -z "$consumer" || -z "$producer" || -z "$customer" || "$consumer" == "$relationship" || "$producer" == "$rest" ]]; then
      echo "Invalid re-architecture relationship: $relationship" >&2
      return 1
    fi
    printf '%s|%s|%s\n' "$consumer" "$producer" "$customer"
  done < <(rearchitecture_section_items "Re-Architecture Customer Relationships")
}

rearchitecture_unique_producers() {
  rearchitecture_relationship_jobs | awk -F'|' '!seen[$2]++ { print $2 }'
}

require_rearchitecture_status() {
  local expected="$1"

  if [[ "$REARCH_STATUS" != "$expected" ]]; then
    echo "Re-architecture $REARCH_ID_RESOLVED must be '$expected' for this phase, but it is '$REARCH_STATUS'." >&2
    exit 2
  fi
}

print_human_checkpoint() {
  local phase_name="$1"
  local completed="$2"
  local human_step="$3"
  local next_command="$4"

  cat <<EOF

Human checkpoint: $phase_name complete.
Phase work completed: $completed
Purpose of this break: $human_step
Next command when you are ready: $next_command
EOF
}
