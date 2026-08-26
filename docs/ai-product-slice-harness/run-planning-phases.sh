#!/usr/bin/env bash
# Run the documentation rounds without human babysitting, committing each round.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MODE="${1:-phase-3-5}"
PHASE_CONTEXT="${2:-}"

usage() {
  cat <<'EOF'
Usage:
  run-planning-phases.sh phase-3-5 [agent context]
  HARNESS_COMMIT_DIRTY=1 run-planning-phases.sh phase-2-5 [agent context]

phase-3-5 requires a clean Git worktree, then runs and commits Phases 03, 04,
and 05 in order.

phase-2-5 treats the current scaffold and planning edits as Phase 02. Because
that may include unrelated local work, it refuses a dirty tree unless
HARNESS_COMMIT_DIRTY=1 is explicitly set. It then commits Phase 02 and continues
through Phases 03, 04, and 05.
EOF
}

case "$MODE" in
  phase-2-5|phase-3-5) ;;
  -h|--help) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac

cd "$ROOT_DIR"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "The planning sequence requires a Git repository so each round can be committed." >&2
  exit 2
fi

for required_script in \
  subagents/phase-03-product-specs.sh \
  subagents/phase-04-customer-requests.sh \
  subagents/phase-05-producer-responses.sh
do
  if [[ ! -x "$required_script" ]]; then
    echo "Missing generated phase script: $required_script" >&2
    echo "Finish the Phase 02 scaffold and run write-phase-scripts.sh first." >&2
    exit 2
  fi
done

commit_round() {
  local message="$1"

  git add -A
  if git diff --cached --quiet; then
    echo "No file changes to commit for: $message"
    return
  fi

  git commit -m "$message"
}

run_round() {
  local phase_number="$1"
  local script="$2"
  local message="$3"

  if [[ ! -x "$script" ]]; then
    echo "Missing generated phase script: $script" >&2
    echo "Run docs/ai-product-slice-harness/write-phase-scripts.sh after scaffolding." >&2
    exit 2
  fi

  echo
  echo "Starting Phase $phase_number"
  bash "$script" "$PHASE_CONTEXT"
  commit_round "$message"
}

if [[ "$MODE" == "phase-2-5" ]]; then
  if [[ -n "$(git status --porcelain)" && "${HARNESS_COMMIT_DIRTY:-0}" != "1" ]]; then
    echo "Phase 02 has uncommitted files. Review them before the harness commits them:" >&2
    git status --short >&2
    echo >&2
    echo "If every listed change belongs in the Phase 02 checkpoint, rerun:" >&2
    echo "  HARNESS_COMMIT_DIRTY=1 make phase-2-5" >&2
    exit 2
  fi
  commit_round "Harness Phase 02: select slices and scaffold products"
elif [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to start Phase 03 with an uncommitted worktree:" >&2
  git status --short >&2
  echo >&2
  echo "Commit or stash those files, or use the Phase 02 checkpoint flow:" >&2
  echo "  HARNESS_COMMIT_DIRTY=1 make phase-2-5" >&2
  exit 2
fi

run_round "03" "subagents/phase-03-product-specs.sh" \
  "Harness Phase 03: complete product specs"
run_round "04" "subagents/phase-04-customer-requests.sh" \
  "Harness Phase 04: record customer requests"
run_round "05" "subagents/phase-05-producer-responses.sh" \
  "Harness Phase 05: finalize producer responses"

echo
echo "Planning rounds complete. Review the four checkpoints, then start Phase 06 with:"
echo "  PHASE_CONFIRMED=1 make phase-6"
