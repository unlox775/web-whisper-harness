#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PHASE = "phase-07-iterate"


def discover_product_names() -> set[str]:
    """Discover package/app basenames from the monorepo layout."""
    names: set[str] = set()
    for parent in ("packages", "apps"):
        root = ROOT / parent
        if not root.is_dir():
            continue
        for child in root.iterdir():
            if child.is_dir() and not child.name.startswith("."):
                names.add(child.name)
    return names


PRODUCT_NAMES = discover_product_names()


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8") if path.exists() else ""


def result_parts(path: Path) -> tuple[str, str, str]:
    text = read(path)
    lines = text.splitlines()
    status = lines[0].removeprefix("STATUS: ").strip() if len(lines) > 0 else "missing"
    summary = lines[1].removeprefix("SUMMARY: ").strip() if len(lines) > 1 else ""
    details = "\n".join(lines[3:]).strip() if len(lines) > 3 else ""
    return status, summary, details


def latest_run_id() -> str:
    latest = ROOT / "subagents/status/phase-07-iterate.latest-run"
    if latest.exists():
        return latest.read_text(encoding="utf-8").strip()
    raise SystemExit("No run id supplied and no phase-07-iterate.latest-run file exists.")


def run_started_at(run_id: str) -> str:
    try:
        parsed = dt.datetime.strptime(run_id, "%Y%m%d%H%M%S")
    except ValueError:
        return run_id
    return parsed.strftime("%Y-%m-%d %H:%M:%S")


def git_head() -> str:
    try:
        return subprocess.check_output(
            ["git", "log", "-1", "--format=%h %s"],
            cwd=ROOT,
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        return "unknown"


def job_name(status_file: Path, run_id: str) -> str:
    name = status_file.name
    prefix = f"{PHASE}-{run_id}-"
    if name.startswith(prefix):
        name = name[len(prefix) :]
    return name.removesuffix(".status")


def product_for(job: str, label: str) -> str:
    if " / " in label:
        return label.split(" / ", 1)[0]
    for product in PRODUCT_NAMES:
        if job == product or job.startswith(f"{product}-"):
            return product
    return label or job


def format_details(details: str) -> list[str]:
    if not details:
        return []
    compact = re.sub(r"\n{3,}", "\n\n", details).strip()
    return [f"  {line}" if line else "" for line in compact.splitlines()]


def build_entry(run_id: str) -> str:
    status_files = sorted((ROOT / "subagents/status").glob(f"{PHASE}-{run_id}-*.status"))
    if not status_files:
        raise SystemExit(f"No status files found for {PHASE} run {run_id}.")

    entries: list[dict[str, str]] = []
    counts = {"queued": 0, "running": 0, "succeeded": 0, "blocked": 0, "failed": 0}

    for status_file in status_files:
        lines = read(status_file).splitlines()
        status = lines[0].strip() if lines else "missing"
        label = lines[1].strip() if len(lines) > 1 else ""
        job = job_name(status_file, run_id)
        result_file = ROOT / "subagents/results" / f"{PHASE}-{run_id}-{job}.result"
        result_status, summary, details = result_parts(result_file)
        summary = summary or next((line.removeprefix("summary: ").strip() for line in lines if line.startswith("summary: ")), "")
        counts[status] = counts.get(status, 0) + 1
        entries.append(
            {
                "job": job,
                "status": status,
                "result_status": result_status,
                "label": label,
                "product": product_for(job, label),
                "summary": summary,
                "details": details,
                "result_file": str(result_file.relative_to(ROOT)),
            }
        )

    spec_entries = [entry for entry in entries if " / " in entry["label"]]
    aggregate_entries = [entry for entry in entries if " / " not in entry["label"]]
    products = sorted({entry["product"] for entry in spec_entries})

    lines: list[str] = []
    lines.append(f"<!-- phase-07-run:{run_id}:start -->")
    lines.append(f"## Phase 07 Iteration: {run_started_at(run_id)}")
    lines.append("")
    lines.append(f"- Run ID: `{run_id}`")
    lines.append(f"- Generated From: `subagents/status/{PHASE}-{run_id}-*.status` and `subagents/results/{PHASE}-{run_id}-*.result`")
    lines.append(f"- Repository HEAD When Generated: `{git_head()}`")
    lines.append(
        "- Outcome: "
        + ", ".join(f"{key}={value}" for key, value in counts.items() if value)
        + f" across {len(status_files)} status file(s)."
    )
    if products:
        lines.append("- Products With Completed Work: " + ", ".join(f"`{product}`" for product in products) + ".")
    lines.append("")

    lines.append("### Highlights")
    if spec_entries:
        for entry in spec_entries:
            lines.append(f"- `{entry['product']}`: {entry['summary'] or entry['job']}")
    else:
        lines.append("- No spec-level work items were recorded for this run.")
    lines.append("")

    lines.append("### Work Items")
    for entry in spec_entries:
        spec_path = entry["label"].split(" / ", 1)[1]
        lines.append(f"#### `{entry['product']}`")
        lines.append("")
        lines.append(f"- Spec: `{spec_path}`")
        lines.append(f"- Status: `{entry['status']}`")
        lines.append(f"- Result: `{entry['result_file']}`")
        if entry["summary"]:
            lines.append(f"- Summary: {entry['summary']}")
        detail_lines = format_details(entry["details"])
        if detail_lines:
            lines.append("- Details:")
            lines.extend(detail_lines)
        lines.append("")

    if aggregate_entries:
        lines.append("### Product-Level Status")
        for entry in aggregate_entries:
            lines.append(f"- `{entry['product']}`: `{entry['status']}` - {entry['summary'] or entry['job']}")
        lines.append("")

    lines.append("### Validation And Known Limits")
    validation_lines = []
    for entry in spec_entries:
        details = entry["details"].lower()
        if "validation" in details or "blocked" in details or "limitation" in details or "xcodebuild" in details:
            validation_lines.append(f"- `{entry['product']}`: see `{entry['result_file']}` for validation details and local tool limitations.")
    lines.extend(validation_lines or ["- No explicit validation notes were recorded."])
    lines.append(f"<!-- phase-07-run:{run_id}:end -->")
    lines.append("")
    return "\n".join(lines)


def update_history(run_id: str) -> Path:
    history = ROOT / "docs/VERSION-HISTORY.md"
    entry = build_entry(run_id)
    start = f"<!-- phase-07-run:{run_id}:start -->"
    end = f"<!-- phase-07-run:{run_id}:end -->"

    if history.exists():
        text = history.read_text(encoding="utf-8")
    else:
        text = "# Version History\n\nThis file summarizes completed Phase 07 iteration runs.\n\n"

    pattern = re.compile(re.escape(start) + r".*?" + re.escape(end) + r"\n?", re.DOTALL)
    if pattern.search(text):
        text = pattern.sub(entry, text)
    else:
        text = text.rstrip() + "\n\n" + entry

    history.write_text(text, encoding="utf-8")
    return history


def main() -> None:
    run_id = sys.argv[1] if len(sys.argv) > 1 else latest_run_id()
    history = update_history(run_id)
    print(f"Wrote Phase 07 iteration notes for {run_id} to {history.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
