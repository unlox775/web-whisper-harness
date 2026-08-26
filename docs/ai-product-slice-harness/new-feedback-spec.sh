#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PRODUCT_PATH="${1:-}"
TITLE="${2:-}"

if [[ -z "$PRODUCT_PATH" || -z "$TITLE" ]]; then
  echo "Usage: $0 <product-path> <feedback-title>"
  echo "Example: $0 packages/example-product \"Improve Isolation Demo controls\""
  echo "Then write feedback details into the created spec."
  exit 2
fi

safe_title="$(printf '%s' "$TITLE" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')"
timestamp="$(date '+%Y%m%d%H%M%S')"
spec_dir="$ROOT_DIR/$PRODUCT_PATH/docs/specs"
spec_file="$spec_dir/${timestamp}-feedback-${safe_title}.md"

if [[ ! -d "$spec_dir" ]]; then
  echo "Spec directory does not exist: $spec_dir" >&2
  exit 1
fi

cat >"$spec_file" <<EOF
Spec Status: unresolved
Spec Type: feedback
Created: $(date -u '+%Y-%m-%dT%H:%M:%SZ')
Product: ${PRODUCT_PATH}

# Feedback: ${TITLE}

## User Feedback

TBD: Replace this with the user's feedback, request, observations, screenshots, or acceptance criteria.

## Requested Outcome

TBD: Describe what should be true after this feedback is addressed.

## Notes For Phase 07

- Keep changes scoped to \`${PRODUCT_PATH}\` unless this spec explicitly asks for integration edits.
- Update this spec with a Resolution or Blocked section when Phase 07 runs.
EOF

echo "$spec_file"
