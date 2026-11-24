#!/usr/bin/python3
"""Ground truth for TASK-complex.md, computed from the fixture with plain SQL.

Windows follow the task: N days end on the UTC day of the latest record and start
at UTC midnight N-1 days earlier (the sandboxes run in UTC, so "localtime" = UTC).

Usage: make_truth_complex.py <fixture.db> <out.json>
"""
import datetime
import json
import sqlite3
import sys

DAY_MS = 86_400_000


def main():
    db = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
    q = lambda sql, *args: db.execute(sql, args[0] if args and isinstance(args[0], dict) else args).fetchall()
    last = max(q(f"SELECT MAX(timestamp) FROM {t}")[0][0] for t in ("messages", "user_messages", "tool_calls"))
    first = min(q(f"SELECT MIN(timestamp) FROM {t}")[0][0] for t in ("messages", "user_messages", "tool_calls"))
    last_day = last // DAY_MS * DAY_MS

    def window(days):
        return (first if days == 0 else last_day - (days - 1) * DAY_MS), last

    def sessions(days, sort, limit):
        lo, hi = window(days)
        order = {"cost": "cost DESC", "tokens": "total_tokens DESC", "recent": "last_ts DESC"}[sort]
        rows = q(f"""
            WITH m AS (
                SELECT session_file, MIN(folder) folder, COUNT(*) messages, SUM(total_tokens) total_tokens,
                       SUM(cost_total) cost, MIN(timestamp) first_ts, MAX(timestamp) last_ts
                FROM messages WHERE timestamp BETWEEN :lo AND :hi GROUP BY session_file),
            tm AS (
                SELECT session_file, model, ROW_NUMBER() OVER (PARTITION BY session_file ORDER BY COUNT(*) DESC, model) rn
                FROM messages WHERE timestamp BETWEEN :lo AND :hi GROUP BY session_file, model),
            t AS (
                SELECT session_file, COUNT(*) tool_calls, COALESCE(SUM(is_error = 1), 0) tool_errors
                FROM tool_calls WHERE timestamp BETWEEN :lo AND :hi GROUP BY session_file)
            SELECT m.session_file, m.folder, tm.model, m.messages, m.total_tokens, ROUND(m.cost, 6), m.first_ts, m.last_ts,
                   COALESCE(t.tool_calls, 0), COALESCE(t.tool_errors, 0)
            FROM m JOIN tm ON tm.session_file = m.session_file AND tm.rn = 1
            LEFT JOIN t ON t.session_file = m.session_file
            ORDER BY {order}""", {"lo": lo, "hi": hi})
        keys = ["session_file", "folder", "model", "messages", "total_tokens", "cost", "first_ts", "last_ts", "tool_calls", "tool_errors"]
        return {"total": len(rows), "sessions": [dict(zip(keys, r)) for r in rows[:limit]]}

    def dashboard(days):
        lo, hi = window(days)
        n, s, cost = q("SELECT COUNT(*), COUNT(DISTINCT session_file), SUM(cost_total) FROM messages WHERE timestamp BETWEEN ? AND ?", lo, hi)[0]
        return {"messages": n, "sessions": s, "cost": round(cost, 4), "days_in_window": (last_day - lo // DAY_MS * DAY_MS) // DAY_MS + 1}

    lo, hi = window(0)
    csv_days = (last_day - lo // DAY_MS * DAY_MS) // DAY_MS + 1
    csv_total_tokens, csv_messages = q("SELECT SUM(total_tokens), COUNT(*) FROM messages")[0]
    truth = {
        "last_record": last,
        "last_day": datetime.datetime.fromtimestamp(last_day / 1000, datetime.UTC).date().isoformat(),
        "dashboard": {str(d): dashboard(d) for d in (0, 7, 30)},
        "model_cost_sum_all": round(q("SELECT SUM(cost_total) FROM messages")[0][0], 4),
        "sessions_all_cost_5": sessions(0, "cost", 5),
        "sessions_30_tokens_3": sessions(30, "tokens", 3),
        "sessions_7_recent_default": sessions(7, "recent", 20),
        "csv_all": {"rows": csv_days, "total_tokens": csv_total_tokens, "messages": csv_messages,
                    "first_date": datetime.datetime.fromtimestamp(lo / 1000, datetime.UTC).date().isoformat()},
        "csv_header": "date,messages,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,total_tokens,cost",
        # First row a sorted /sessions table shows, for every period the page may default to.
        "top_stem": {sort: {str(d): sessions(d, sort, 1)["sessions"][0]["session_file"].rsplit("/", 1)[-1].removesuffix(".jsonl") for d in (0, 7, 30, 90)} for sort in ("cost", "tokens", "recent")},
        "top_row": {sort: {str(d): {k: sessions(d, sort, 1)["sessions"][0][k] for k in ("session_file", "folder", "messages", "tool_calls")} for d in (0, 7, 30, 90)} for sort in ("cost", "tokens", "recent")},
        "folders": sorted({r[0] for r in q("SELECT DISTINCT folder FROM messages")}),
        "all_session_stems": sorted({r[0].rsplit("/", 1)[-1].removesuffix(".jsonl") for r in q("SELECT DISTINCT session_file FROM messages")}),
    }
    with open(sys.argv[2], "w") as fh:
        json.dump(truth, fh, indent=1)
    print(json.dumps({k: v for k, v in truth.items() if k not in ("all_session_stems", "sessions_7_recent_default")})[:2500])


main()
