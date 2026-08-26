#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT_DIR/docs/ai-product-slice-harness/rearchitecture-common.sh"
resolve_rearchitecture_plan

python3 - "$REARCH_PLAN_PATH" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
lines = path.read_text().splitlines()
for index, line in enumerate(lines):
    if line.startswith("Re-Architecture Status:"):
        lines[index] = "Re-Architecture Status: abandoned"
        break
else:
    lines.insert(2, "Re-Architecture Status: abandoned")

if not any(line.strip() == "## Abandoned" for line in lines):
    lines.extend([
        "",
        "## Abandoned",
        "",
        "This re-architecture was marked abandoned by `make phase-ra-abandon`.",
    ])

path.write_text("\n".join(lines) + "\n")
PY

echo "Marked $REARCH_ID_RESOLVED as abandoned."
echo "You can now create or activate another docs/re-architectures/<timestamp>-<slug>.md plan."
