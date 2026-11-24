#!/usr/bin/python3
"""Turns one run's session files into metrics.json and a blinded transcript.md.

Reads the main session and every subagent session the run wrote. Token usage comes
from each assistant message; tool activity comes from the eval cells and the bridged
operations they report. The transcript carries no model or provider route names so
the analyst cannot tell which model produced it.

Usage: collect.py <run_dir> <label>
"""
import collections
import datetime
import glob
import json
import os
import re
import sys

# USD per 1M tokens (input, output, cache read): the models.dev snapshot used by
# scripts/code-mode-ab.ts (2026-11-20). Unlisted models have no public price here.
PRICES = {
    "cc/claude-opus-5-5": (4, 20, 0.2),
    "cc/claude-sonnet-5-5": (2, 10, 0.1),
    "cx/gpt-6.2-sol": (2, 10, 0.1),
    "cx/gpt-6.1-terra": (1, 5, 0.05),
}
ROUTE = re.compile(r"(9router|kgdev)/[\w./-]+(:\w+)?|\b(cc|cx|cmd)/[\w./-]*(claude|gpt|deepseek)[\w.-]*", re.I)
WORK = os.path.join(os.path.expanduser("~"), "work/omp-metrics")


def clip(text, limit):
    text = ROUTE.sub("<model>", text or "")
    return text if len(text) <= limit else f"{text[:limit]}\n…[+{len(text) - limit} chars]"


def load(path):
    with open(path) as fh:
        return [json.loads(line) for line in fh if line.strip()]


def main():
    run_dir, label = sys.argv[1], sys.argv[2]
    files = sorted(glob.glob(os.path.join(run_dir, "home/.omp/agent/sessions/**/*.jsonl"), recursive=True), key=lambda p: (p.count("/"), p))
    meta = json.load(open(os.path.join(run_dir, "meta.json"))) if os.path.exists(os.path.join(run_dir, "meta.json")) else {}
    m = {
        "label": label, "wall_seconds": meta.get("wall_seconds"), "exit_code": meta.get("exit_code"), "timed_out": meta.get("timed_out"),
        "requests": 0, "requests_main": 0, "requests_subagent": 0, "subagents": max(0, len(files) - 1),
        "input_tokens": 0, "output_tokens": 0, "cache_read_tokens": 0, "total_tokens": 0, "max_context_tokens": 0,
        "thinking_chars": 0, "text_chars": 0, "tool_code_chars": 0, "tool_result_chars": 0,
        "wire_tool_calls": collections.Counter(), "parallel_call_requests": 0, "cells": 0, "eval_languages": collections.Counter(),
        "bridged_ops": collections.Counter(), "tool_errors": 0, "validation_errors": 0, "failed_commands": 0,
        "request_errors": 0, "stop_reasons": collections.Counter(), "todo_calls": 0, "skill_reads": [],
        "first_write_request": None, "model_seconds": 0.0, "auxiliary_requests": collections.Counter(),
    }
    out = [f"# Run {label}", ""]
    stamps, background_jobs = [], 0
    model_id = None
    for index, path in enumerate(files):
        role = "main" if index == 0 else f"subagent:{os.path.basename(path)[:-6]}"
        out += [f"## Session {role}", ""]
        step = 0
        for entry in load(path):
            kind = entry.get("type")
            if kind == "custom" and entry.get("customType") in ("code_mode", "session_init"):
                data = entry.get("data")
                out += [f"[{entry['customType']}] {clip(json.dumps(data, ensure_ascii=False), 3000)}", ""]
            if kind == "model_usage":
                m["auxiliary_requests"][entry.get("purpose", "?")] += 1
            if kind != "message":
                continue
            msg = entry["message"]
            if index == 0 and entry.get("timestamp"):
                stamps.append(entry["timestamp"])
            if msg["role"] == "user":
                text = "".join(b.get("text", "") for b in msg["content"]) if isinstance(msg["content"], list) else str(msg["content"])
                out += [f"### USER/SYSTEM INPUT", clip(text, 3000), ""]
            elif msg["role"] == "assistant":
                step += 1
                usage = msg.get("usage") or {}
                model_id = model_id or msg.get("model")
                m["requests"] += 1
                m["requests_main" if index == 0 else "requests_subagent"] += 1
                m["input_tokens"] += usage.get("input", 0)
                m["output_tokens"] += usage.get("output", 0)
                m["cache_read_tokens"] += usage.get("cacheRead", 0)
                m["total_tokens"] += usage.get("totalTokens", 0)
                m["max_context_tokens"] = max(m["max_context_tokens"], usage.get("input", 0) + usage.get("cacheRead", 0))
                m["stop_reasons"][msg.get("stopReason")] += 1
                m["model_seconds"] += (msg.get("duration") or 0) / 1000
                if msg.get("errorMessage"):
                    m["request_errors"] += 1
                out.append(f"### {role} request {step}  (in={usage.get('input', 0)} out={usage.get('output', 0)} stop={msg.get('stopReason')} {round((msg.get('duration') or 0) / 1000)}s)")
                if msg.get("errorMessage"):
                    out.append(f"REQUEST ERROR: {clip(msg['errorMessage'], 500)}")
                calls = [b for b in msg["content"] if b.get("type") == "toolCall"]
                if len(calls) > 1:
                    m["parallel_call_requests"] += 1
                for block in msg["content"]:
                    if block.get("type") == "thinking":
                        text = block.get("thinking") or block.get("summary") or ""
                        text = text if isinstance(text, str) else json.dumps(text, ensure_ascii=False)
                        m["thinking_chars"] += len(text)
                        out += ["THINKING:", clip(text, 1800)]
                    elif block.get("type") == "text":
                        m["text_chars"] += len(block["text"])
                        out += ["TEXT:", clip(block["text"], 6000)]
                    elif block.get("type") == "toolCall":
                        args = block.get("arguments") or {}
                        m["wire_tool_calls"][block["name"]] += 1
                        if block["name"] == "todo":
                            m["todo_calls"] += 1
                        if block["name"] == "eval":
                            m["eval_languages"][args.get("language")] += 1
                            code = args.get("code", "")
                            m["tool_code_chars"] += len(code)
                            if m["first_write_request"] is None and index == 0 and re.search(r"\bwrite\(|tool\.write|tool\.edit|cat\s*>|<<\s*['\"]?EOF|cargo (init|new)|create[- ]astro|npm create", code):
                                m["first_write_request"] = m["requests_main"]
                            out += [f"CALL eval[{args.get('language')}] {args.get('title', '')}", "```", clip(code, 2600), "```"]
                        else:
                            body = json.dumps(args, ensure_ascii=False)
                            m["tool_code_chars"] += len(body)
                            out.append(f"CALL {block['name']} {clip(body, 1500)}")
                out.append("")
            elif msg["role"] == "toolResult":
                text = "".join(b.get("text", "") for b in msg.get("content", []) if b.get("type") == "text")
                m["tool_result_chars"] += len(text)
                background_jobs += text.count("Backgrounded as job")
                details = msg.get("details") or {}
                if msg.get("isError"):
                    m["tool_errors"] += 1
                    if "Validation failed" in text or "Validation failed" in str(details.get("error", "")):
                        m["validation_errors"] += 1
                ops = []
                for cell in details.get("cells", []):
                    m["cells"] += 1
                    for event in cell.get("statusEvents", []):
                        op = event.get("tool") or event.get("op") or "?"
                        m["bridged_ops"][op] += 1
                        if event.get("op") == "run" and event.get("code") not in (0, None):
                            m["failed_commands"] += 1
                        if event.get("op") == "read" and str(event.get("path", "")).startswith("skill://"):
                            m["skill_reads"].append(event["path"])
                        ops.append(f"{op}{'!' + str(event.get('code')) if event.get('code') else ''}")
                out += [f"RESULT {msg.get('toolName')}{' ERROR' if msg.get('isError') else ''} ops=[{' '.join(ops)}]", "```", clip(text, 1500), "```", ""]

    price = PRICES.get((model_id or "").replace("9router/", ""))
    fresh = m["input_tokens"] * price[0] + m["output_tokens"] * price[1] if price else 0
    m["estimated_cost_usd"] = round((fresh + m["cache_read_tokens"] * price[2]) / 1e6, 2) if price else None
    # The same run if every cached token had been billed as fresh input, and if 90% of the
    # re-sent prefix had been served from cache: the price of the provider route's caching.
    m["estimated_cost_usd_no_cache"] = round((fresh + m["cache_read_tokens"] * price[0]) / 1e6, 2) if price else None
    m["cache_read_share"] = round(m["cache_read_tokens"] / max(1, m["cache_read_tokens"] + m["input_tokens"]), 3)
    m["model_seconds"] = round(m["model_seconds"])
    parse = lambda stamp: datetime.datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp()
    m["active_seconds"] = round(parse(stamps[-1]) - parse(stamps[0])) if stamps else None
    m["background_jobs_started"] = background_jobs
    # Seconds the process stayed alive after the agent's final answer (a job it left running).
    m["idle_after_final_answer_seconds"] = max(0, (meta.get("wall_seconds") or 0) - (m["active_seconds"] or 0)) if meta else None
    m["stopped_by_orchestrator"] = meta.get("stopped_by_orchestrator", False)
    m["bridged_op_total"] = sum(m["bridged_ops"].values())
    m["ops_per_wire_call"] = round(m["bridged_op_total"] / max(1, sum(m["wire_tool_calls"].values())), 2)
    m["tokens_per_request"] = round(m["total_tokens"] / max(1, m["requests"]))

    work = os.path.join(run_dir, "home", os.path.relpath(WORK, os.path.expanduser("~")))
    skip = {"node_modules", "target", ".git", "dist", ".astro", ".pnpm-store"}
    tree, loc = [], collections.Counter()
    for root, dirs, names in os.walk(work):
        dirs[:] = sorted(d for d in dirs if d not in skip)
        for name in sorted(names):
            full = os.path.join(root, name)
            rel = os.path.relpath(full, work)
            ext = os.path.splitext(name)[1]
            if ext in (".rs", ".ts", ".tsx", ".astro", ".jsx", ".js", ".mjs", ".css", ".sh") and "lock" not in name:
                with open(full, errors="replace") as fh:
                    lines = sum(1 for _ in fh)
                loc[ext] += lines
                tree.append(f"{rel} ({lines} lines)")
            elif os.path.getsize(full) < 5_000_000:
                tree.append(rel)
    m["workspace_files"] = len(tree)
    m["workspace_loc"] = dict(loc)
    m["has_start_sh"] = os.path.exists(os.path.join(work, "start.sh"))
    m["has_readme"] = any(n.lower().startswith("readme") for n in os.listdir(work))
    m["has_tests"] = any(re.search(r"(^|/)tests?/|\.test\.|_test\.rs", t) for t in tree)
    for key in ("wire_tool_calls", "eval_languages", "bridged_ops", "stop_reasons", "auxiliary_requests"):
        m[key] = dict(m[key])

    out += ["## Final workspace tree (dependency and build directories omitted)", "```", "\n".join(tree[:400]), "```", ""]
    dest = os.path.join(run_dir, "analysis")
    os.makedirs(dest, exist_ok=True)
    with open(os.path.join(dest, "metrics.json"), "w") as fh:
        json.dump(m, fh, indent=2)
    with open(os.path.join(dest, "transcript.md"), "w") as fh:
        fh.write("\n".join(out))
    print(json.dumps({k: m[k] for k in ("label", "requests", "subagents", "total_tokens", "output_tokens", "wire_tool_calls", "bridged_op_total", "tool_errors", "failed_commands", "first_write_request", "workspace_files")}))


main()
