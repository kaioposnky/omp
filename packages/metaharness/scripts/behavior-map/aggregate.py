#!/usr/bin/python3
"""Cross-run table: deterministic metrics, validation and behavior counters per run.

The behavior counters are recomputed from the raw session files so that analyst
claims (heredoc file writes, todo-only requests, copied skill query, ...) can be
checked against counts instead of taken on trust.

Usage: aggregate.py <runs_dir> <out.json>
"""
import collections
import glob
import json
import os
import re
import sys


def counters(run_dir):
    files = sorted(glob.glob(os.path.join(run_dir, "home/.omp/agent/sessions/**/*.jsonl"), recursive=True), key=lambda p: (p.count("/"), p))
    c = collections.Counter()
    skills, first_input = set(), []
    for index, path in enumerate(files):
        with open(path) as fh:
            rows = [json.loads(line) for line in fh if line.strip()]
        for row in rows:
            if row.get("type") == "custom_message" or row.get("customType") == "mid-run-todo-nudge":
                c["todo_nudges"] += row.get("customType") == "mid-run-todo-nudge" or "todo-nudge" in json.dumps(row)[:400]
            if row.get("type") != "message":
                continue
            msg = row["message"]
            if msg["role"] == "assistant":
                if len(first_input) <= index:
                    first_input.append((msg.get("usage") or {}).get("input", 0))
                if msg.get("errorMessage"):
                    c["failed_requests"] += 1
                calls = [b for b in msg["content"] if b.get("type") == "toolCall"]
                names = [b["name"] for b in calls]
                if names and all(n == "todo" for n in names):
                    c["todo_only_requests"] += 1
                if names and all(n == "wait" for n in names):
                    c["wait_only_requests"] += 1
                for block in calls:
                    code = (block.get("arguments") or {}).get("code", "") if block["name"] == "eval" else ""
                    if not code:
                        continue
                    c["cells"] += 1
                    if re.search(r"<<\s*\\?['\"]?[A-Z_]{2,}", code) and re.search(r"cat\s*>|tee\s|python3?\s+-\s*<<", code):
                        c["cells_writing_files_by_heredoc"] += 1
                    c["bridge_write_calls"] += len(re.findall(r"tool\.write\(|(?<![.\w])write\(", code))
                    c["bridge_edit_calls"] += len(re.findall(r"tool\.(edit|ast_edit)\(", code))
                    c["raw_file_writes"] += len(re.findall(r"open\([^)]*['\"]w['\"]|\.write_text\(", code))
                    c["subprocess_calls"] += len(re.findall(r"subprocess\.(run|Popen|check_output)", code))
                    c["prelude_sh_calls"] += len(re.findall(r"(?<![.\w])sh\(|tool\.bash\(", code))
                    skills.update(re.findall(r"skill://[^'\"\s)]*", code))
                    if any(int(x) >= 10000 for x in re.findall(r"timeout\s*[:=]\s*(\d+)", code)):
                        c["cells_with_ms_timeouts"] += 1
                    if re.search(r"tool\.describe|tool\.search|xd://", code):
                        c["cells_reading_tool_docs"] += 1
                    if "node_modules/" in code and re.search(r"cat |sed -n|grep|head", code):
                        c["cells_reading_dependency_source"] += 1
            elif msg["role"] == "toolResult":
                text = "".join(x.get("text", "") for x in msg.get("content", []) if x.get("type") == "text")
                if "Validation failed" in text:
                    c["validation_errors"] += 1
                if re.search(r"cell timed out after", text):
                    c["cell_timeouts"] += 1
                if re.search(r"SyntaxError|Unexpected token|Parse error", text):
                    c["cell_syntax_errors"] += 1
                if "is not a function" in text or "has no attribute" in text or "returns {" in text:
                    c["guessed_api_errors"] += 1
                if len(text) > 12000:
                    c["results_over_12k_chars"] += 1
    return dict(c), sorted(skills), first_input


def main():
    runs_dir, out = sys.argv[1], sys.argv[2]
    table = {}
    for run in sorted(os.listdir(runs_dir)):
        base = os.path.join(runs_dir, run)
        if not os.path.exists(os.path.join(base, "analysis/metrics.json")):
            continue
        with open(os.path.join(base, "analysis/metrics.json")) as fh:
            m = json.load(fh)
        v = {}
        if os.path.exists(os.path.join(base, "analysis/validation.json")):
            with open(os.path.join(base, "analysis/validation.json")) as fh:
                v = json.load(fh)
        behavior, skills, first_input = counters(base)
        table[run] = {
            "metrics": {k: m.get(k) for k in (
                "requests", "requests_main", "requests_subagent", "subagents", "input_tokens", "cache_read_tokens", "output_tokens",
                "total_tokens", "cache_read_share", "max_context_tokens", "active_seconds", "wall_seconds", "model_seconds",
                "idle_after_final_answer_seconds", "timed_out", "stopped_by_orchestrator", "estimated_cost_usd", "estimated_cost_usd_no_cache",
                "wire_tool_calls", "bridged_ops", "ops_per_wire_call", "tool_errors", "failed_commands", "request_errors", "todo_calls",
                "background_jobs_started", "thinking_chars", "tool_code_chars", "tool_result_chars", "workspace_loc", "has_tests")},
            "validation": {k: v.get(k) for k in (
                "site_up", "seconds_to_ready", "loopback", "webgl_canvas", "animated_canvas_contexts", "css_3d_elements", "running_animations",
                "chart_svg_count", "canvas_2d_count", "bar_like_elements", "truth_scalars_in_api", "truth_scalars_on_page",
                "per_model_token_totals_in_api", "failed_requests", "console_errors", "page_errors")},
            "behavior": behavior,
            "skill_queries": skills,
            "first_request_input_tokens": first_input,
        }
    with open(out, "w") as fh:
        json.dump(table, fh, indent=2)
    for run, row in table.items():
        m, v, b = row["metrics"], row["validation"], row["behavior"]
        print(f"{run}: req={m['requests']} ({m['requests_subagent']} sub) in={m['input_tokens']} cache={m['cache_read_tokens']} out={m['output_tokens']} "
              f"active={m['active_seconds']}s cost={m['estimated_cost_usd']} up={v.get('site_up')} api={v.get('truth_scalars_in_api')}/9 page={v.get('truth_scalars_on_page')}/9")
        print("   ", b, row["skill_queries"])


main()
