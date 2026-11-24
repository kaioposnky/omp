#!/usr/bin/python3
"""Per-model base vs new table for the TASK-complex.md A/B.

Reads analysis/complex.json (contract score), analysis/metrics.json (collect.py) and
recomputes behavior counters from the raw sessions with aggregate.counters.

Usage: compare_complex.py <runs_dir> <out.json>
"""
import glob
import json
import os
import re
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util  # noqa: E402

spec = importlib.util.spec_from_file_location("aggregate", os.path.join(os.path.dirname(os.path.abspath(__file__)), "aggregate.py"))
source = open(spec.origin).read().replace("\nmain()\n", "\n")
aggregate = {"__file__": spec.origin, "__name__": "aggregate"}
exec(compile(source, spec.origin, "exec"), aggregate)

FILE_HEREDOC = re.compile(r"(cat|tee)\b[^\n|;]*>[^\n]*<<|<<-?\s*['\"]?\w+['\"]?\s*>\s*\S")


def file_heredocs(run_dir):
    n = 0
    for path in glob.glob(os.path.join(run_dir, "home/.omp/agent/sessions/**/*.jsonl"), recursive=True):
        for line in open(path):
            row = json.loads(line)
            if row.get("type") != "message" or row["message"]["role"] != "assistant":
                continue
            for block in row["message"]["content"]:
                if block.get("type") == "toolCall" and block["name"] == "eval" and FILE_HEREDOC.search((block.get("arguments") or {}).get("code", "")):
                    n += 1
    return n


def final_answer(run_dir):
    for line in open(os.path.join(run_dir, "events.jsonl")):
        if '"type":"agent_end"' in line[:40] and json.loads(line).get("isTerminal") is True:
            return True
    return False


def main():
    runs_dir, out = sys.argv[1], sys.argv[2]
    rows = {}
    for run_dir in sorted(glob.glob(os.path.join(runs_dir, "*-*-r*"))):
        name = os.path.basename(run_dir)
        model, arm, rep = name.rsplit("-", 2)
        c_path, m_path = os.path.join(run_dir, "analysis/complex.json"), os.path.join(run_dir, "analysis/metrics.json")
        if not (os.path.exists(c_path) and os.path.exists(m_path)):
            continue
        c, m = json.load(open(c_path)), json.load(open(m_path))
        meta = json.load(open(os.path.join(run_dir, "meta.json")))
        b, skills, _ = aggregate["counters"](run_dir)
        rows[name] = {
            "model": model, "arm": arm, "rep": rep,
            "points": c["points"], "checks": c["checks"],
            "final_answer": final_answer(run_dir), "timed_out": bool(meta.get("timed_out")), "stopped": bool(meta.get("stopped_by_orchestrator")),
            "requests": m["requests"], "total_tokens": m["total_tokens"], "input_tokens": m["input_tokens"], "cache_read_tokens": m["cache_read_tokens"],
            "output_tokens": m["output_tokens"], "active_seconds": m["active_seconds"], "cost": m.get("estimated_cost_usd"),
            "file_heredoc_cells": file_heredocs(run_dir),
            "validation_errors": b.get("validation_errors", 0), "ms_timeouts": b.get("cells_with_ms_timeouts", 0),
            "cell_timeouts": b.get("cell_timeouts", 0), "todo_only": b.get("todo_only_requests", 0),
            "failed_requests": b.get("failed_requests", 0), "write_calls": b.get("bridge_write_calls", 0),
            "edit_calls": b.get("bridge_edit_calls", 0), "skill_static_page": sum("static%20page" in s for s in skills),
            "tool_errors": m.get("tool_errors", 0),
        }
    summary = {}
    keys = ["points", "requests", "total_tokens", "output_tokens", "active_seconds", "cost", "file_heredoc_cells", "validation_errors",
            "ms_timeouts", "cell_timeouts", "todo_only", "failed_requests", "tool_errors", "edit_calls"]
    for model in sorted({r["model"] for r in rows.values()}):
        summary[model] = {}
        for arm in sorted({r["arm"] for r in rows.values() if r["model"] == model}):
            group = [r for r in rows.values() if r["model"] == model and r["arm"] == arm]
            summary[model][arm] = {"n": len(group), "final_answers": sum(r["final_answer"] for r in group)}
            for k in keys:
                values = [r[k] for r in group if r[k] is not None]
                summary[model][arm][k] = [values, round(statistics.mean(values), 2) if values else None]
    json.dump({"runs": rows, "summary": summary}, open(out, "w"), indent=1)
    for model, arms in summary.items():
        print(model)
        for arm, s in arms.items():
            print(f"  {arm}: n={s['n']} answers={s['final_answers']} " + " ".join(f"{k}={s[k][0]}" for k in keys))


main()
