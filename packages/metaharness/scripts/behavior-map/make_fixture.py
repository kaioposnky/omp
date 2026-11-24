#!/usr/bin/python3
"""Builds the synthetic stats.db fixture every measured run receives.

The schema is copied (DDL only, never rows) from the local oh-my-pi stats.db, so the
fixture has the exact shape the harness writes. All rows are generated from a fixed
seed; ground-truth aggregates go to a JSON file that stays outside the sandboxes.

Usage: make_fixture.py <out.db> <truth.json>
"""
import json
import os
import random
import sqlite3
import sys

SEED = 20261123
DAYS = 90
END_MS = 1795478400000  # 2026-11-24T00:00:00Z
DAY_MS = 86_400_000

# (provider, model, api, weight, $/1M input, output, cache read)
MODELS = [
    ("anthropic", "claude-opus-5-5", "anthropic-messages", 16, 5.0, 25.0, 0.5),
    ("anthropic", "claude-sonnet-5-5", "anthropic-messages", 24, 3.0, 15.0, 0.3),
    ("anthropic", "claude-haiku-5-5", "anthropic-messages", 10, 1.0, 5.0, 0.1),
    ("openai", "gpt-6.2-sol", "openai-responses", 18, 2.5, 20.0, 0.25),
    ("openai", "gpt-6.1-terra", "openai-responses", 12, 1.25, 10.0, 0.125),
    ("openai", "gpt-6-luna", "openai-responses", 8, 0.25, 2.0, 0.025),
    ("deepseek", "deepseek-v4.1-flash", "openai-completions", 9, 0.3, 1.2, 0.03),
    ("google", "gemini-3.1-pro", "google-generative-ai", 3, 2.0, 12.0, 0.2),
]
FOLDERS = [
    ("/home/dev/projects/storefront", 22), ("/home/dev/projects/billing-api", 17),
    ("/home/dev/projects/mobile-app", 13), ("/home/dev/projects/data-pipeline", 11),
    ("/home/dev/projects/design-system", 9), ("/home/dev/projects/infra", 8),
    ("/home/dev/projects/docs-site", 6), ("/home/dev/projects/cli-tools", 5),
    ("/home/dev/sandbox/experiments", 4), ("/home/dev/projects/ml-notebooks", 3),
    ("/home/dev/projects/game-jam", 1), ("/home/dev/dotfiles", 1),
]
TOOLS = [
    ("eval", 30), ("read", 22), ("bash", 16), ("edit", 12), ("grep", 8), ("todo", 4),
    ("glob", 3), ("write", 2), ("task", 1.5), ("web_search", 1), ("lsp", 0.5),
]
STOPS = [("toolUse", 880), ("stop", 70), ("error", 38), ("aborted", 11), ("length", 1)]
ERRORS = ["429 rate limit exceeded", "stream stalled", "overloaded_error", "connection reset by peer", "context length exceeded"]


def pick(rng, table):
    return rng.choices([row[0] if not isinstance(row[0], tuple) else row for row in table], weights=[row[-1] if len(row) == 2 else row[3] for row in table])[0]


def main():
    out, truth_path = sys.argv[1], sys.argv[2]
    src = sqlite3.connect("file:" + os.path.expanduser("~/.omp/stats.db") + "?mode=ro", uri=True)
    ddl = [r[0] for r in src.execute("select sql from sqlite_master where sql is not null and name not like 'sqlite_%' order by type desc, rowid")]
    meta = src.execute("select key, value from meta").fetchall()
    src.close()

    if os.path.exists(out):
        os.remove(out)
    db = sqlite3.connect(out)
    for stmt in ddl:
        db.execute(stmt)
    db.executemany("insert into meta values (?, ?)", meta)

    rng = random.Random(SEED)
    msgs, tools, users, offsets = [], [], [], []
    start_ms = END_MS - DAYS * DAY_MS
    sid = 0
    for day in range(DAYS):
        day_start = start_ms + day * DAY_MS
        weekday = (day_start // DAY_MS + 4) % 7  # 0 = Monday
        base = 2 if weekday >= 5 else 7
        growth = 0.6 + 0.9 * day / DAYS
        for _ in range(max(0, int(rng.gauss(base * growth, 1.5)))):
            sid += 1
            folder = rng.choices([f[0] for f in FOLDERS], weights=[f[1] for f in FOLDERS])[0]
            model = rng.choices(MODELS, weights=[m[3] for m in MODELS])[0]
            provider, model_id, api, _, p_in, p_out, p_cr = model
            t = day_start + rng.randint(8 * 3600_000, 22 * 3600_000)
            sfile = f"/home/dev/.omp/agent/sessions/{folder.strip('/').replace('/', '-')}/s{sid:05d}.jsonl"
            offsets.append((sfile, rng.randint(20_000, 4_000_000), t))
            context = rng.randint(9_000, 22_000)
            turns = max(1, int(rng.lognormvariate(2.4, 0.8)))
            for prompt_no in range(max(1, turns // 9)):
                chars = int(rng.lognormvariate(4.6, 1.0)) + 5
                users.append((sfile, f"u{sid}-{prompt_no}", folder, t + prompt_no * 600_000, model_id, provider, chars, max(1, chars // 6),
                              int(rng.random() < 0.03), int(rng.random() < 0.04), int(rng.random() < 0.02),
                              int(rng.random() < 0.12), int(rng.random() < 0.05), int(rng.random() < 0.02)))
            for turn in range(turns):
                agent_type = "subagent" if rng.random() < 0.3 else "main"
                stop = rng.choices([s[0] for s in STOPS], weights=[s[1] for s in STOPS])[0]
                if turn == turns - 1 and stop == "toolUse":
                    stop = "stop"
                failed = stop == "error"
                output = 0 if failed else int(rng.lognormvariate(5.6, 1.0)) + 10
                cached = 0 if failed or turn == 0 else int(context * rng.uniform(0.8, 0.98))
                fresh = 0 if failed else context - cached
                write = 0 if failed or provider != "anthropic" else int(fresh * 0.9)
                total = fresh + output + cached + write
                c_in, c_out, c_cr, c_cw = fresh * p_in / 1e6, output * p_out / 1e6, cached * p_cr / 1e6, write * p_in * 1.25 / 1e6
                duration = int(rng.lognormvariate(9.2, 0.7))
                t += duration + rng.randint(200, 9_000)
                entry = f"m{sid}-{turn}"
                msgs.append((sfile, entry, folder, model_id, provider, api, t, duration, int(duration * rng.uniform(0.08, 0.5)), stop,
                             rng.choice(ERRORS) if failed else None, fresh, output, cached, write, total, 0.0,
                             c_in, c_out, c_cr, c_cw, c_in + c_out + c_cr + c_cw, (fresh + cached) * p_in / 1e6, agent_type))
                if stop == "toolUse":
                    calls = rng.choices([1, 2, 3, 5], weights=[70, 18, 8, 4])[0]
                    for call in range(calls):
                        name = rng.choices([x[0] for x in TOOLS], weights=[x[1] for x in TOOLS])[0]
                        result = int(rng.lognormvariate(6.8, 1.3))
                        tools.append((sfile, entry, f"tc{sid}-{turn}-{call}", folder, name, model_id, provider, t, agent_type, calls,
                                      int(rng.lognormvariate(5.2, 1.0)), result, int(rng.random() < (0.11 if name == "bash" else 0.04))))
                    context += output + rng.randint(300, 6_000)

    db.executemany("insert into messages (session_file, entry_id, folder, model, provider, api, timestamp, duration, ttft, stop_reason, error_message, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens, premium_requests, cost_input, cost_output, cost_cache_read, cost_cache_write, cost_total, cost_no_cache_input, agent_type) values (" + ",".join("?" * 24) + ")", msgs)
    db.executemany("insert into tool_calls (session_file, entry_id, tool_call_id, folder, tool_name, model, provider, timestamp, agent_type, calls_in_turn, args_chars, result_chars, is_error) values (" + ",".join("?" * 13) + ")", tools)
    db.executemany("insert into user_messages (session_file, entry_id, folder, timestamp, model, provider, chars, words, yelling, profanity, anguish, negation, repetition, blame) values (" + ",".join("?" * 14) + ")", users)
    db.executemany("insert into file_offsets values (?, ?, ?)", offsets)
    db.commit()

    q = lambda sql: db.execute(sql).fetchall()
    truth = {
        "seed": SEED,
        "messages": q("select count(*) from messages")[0][0],
        "sessions": q("select count(distinct session_file) from messages")[0][0],
        "tool_calls": q("select count(*) from tool_calls")[0][0],
        "user_messages": q("select count(*) from user_messages")[0][0],
        "total_tokens": q("select sum(total_tokens) from messages")[0][0],
        "input_tokens": q("select sum(input_tokens) from messages")[0][0],
        "output_tokens": q("select sum(output_tokens) from messages")[0][0],
        "cache_read_tokens": q("select sum(cache_read_tokens) from messages")[0][0],
        "cache_write_tokens": q("select sum(cache_write_tokens) from messages")[0][0],
        "cost_total": round(q("select sum(cost_total) from messages")[0][0], 4),
        "errors": q("select count(*) from messages where stop_reason = 'error'")[0][0],
        "by_model": {r[0]: {"messages": r[1], "total_tokens": r[2], "cost": round(r[3], 4)} for r in q("select model, count(*), sum(total_tokens), sum(cost_total) from messages group by 1")},
        "by_tool": dict(q("select tool_name, count(*) from tool_calls group by 1")),
        "by_folder": dict(q("select folder, sum(total_tokens) from messages group by 1")),
        "days_with_data": q("select count(distinct timestamp / 86400000) from messages")[0][0],
    }
    db.execute("vacuum")
    db.close()
    with open(truth_path, "w") as fh:
        json.dump(truth, fh, indent=2)
    print(json.dumps({k: v for k, v in truth.items() if not isinstance(v, dict)}))


main()
