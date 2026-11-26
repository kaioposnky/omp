#!/usr/bin/python3
"""Each arm vs a reference arm over all replicates of the complex task: per-run metrics, medians, bootstrap CI
of the ratio of means, and an exact two-sided Mann-Whitney p-value.
Usage: stats_arms.py <compare.json> <runs_dir> [reference arm (default base)]"""
import glob, itertools, json, random, statistics as st, sys
d = json.load(open(sys.argv[1]))
METRICS = ("total_tokens", "requests", "tool_calls", "active_seconds", "cost")

RUNS_DIR = sys.argv[2]  # directory of run symlinks used to build the compare file
REF = sys.argv[3] if len(sys.argv) > 3 else "base"

def tool_calls(name):
    """toolCall blocks in every assistant message of the run (main agent and subagents)."""
    n = 0
    for path in glob.glob(f"{RUNS_DIR}/{name}/home/.omp/agent/sessions/**/*.jsonl", recursive=True):
        for line in open(path, errors="replace"):
            if '"toolCall"' not in line: continue
            row = json.loads(line)
            msg = row.get("message") or {}
            if row.get("type") == "message" and msg.get("role") == "assistant":
                n += sum(1 for b in msg.get("content") or [] if b.get("type") == "toolCall")
    return n

def mw_p(a, b):
    """Exact two-sided Mann-Whitney U p-value by full enumeration (n <= 6 per arm)."""
    pooled, n = a + b, len(a)
    def u(xs, ys): return sum((x > y) + 0.5 * (x == y) for x in xs for y in ys)
    obs = abs(u(a, b) - len(a) * len(b) / 2)
    hits = total = 0
    for idx in itertools.combinations(range(len(pooled)), n):
        xs = [pooled[i] for i in idx]; ys = [pooled[i] for i in range(len(pooled)) if i not in idx]
        total += 1; hits += abs(u(xs, ys) - len(xs) * len(ys) / 2) >= obs - 1e-9
    return hits / total

def boot_ratio(a, b, n=20000, seed=7):
    rng = random.Random(seed); out = []
    for _ in range(n):
        ra = [rng.choice(a) for _ in a]; rb = [rng.choice(b) for _ in b]
        out.append(st.mean(rb) / st.mean(ra))
    out.sort(); return out[int(0.025 * n)], out[int(0.975 * n)]

rows = {}
for name, run in d["runs"].items():
    v = {k: run.get(k) if run.get(k) is not None else (run.get("metrics") or {}).get(k) for k in METRICS}
    v["tool_calls"] = tool_calls(name)
    v["points"] = run.get("points")
    rows.setdefault((run["model"], run["arm"]), []).append((name, v))
for model in sorted({m for m, _ in rows}):
    base = rows.get((model, REF), [])
    for arm in sorted({a for m, a in rows if m == model and a != REF}):
        other = rows[(model, arm)]
        print(f"## {model}: {REF} n={len(base)} {arm} n={len(other)}  points {REF}={[v['points'] for _, v in base]} {arm}={[v['points'] for _, v in other]}")
        for k in METRICS:
            a = [v[k] for _, v in base if v[k] is not None]; b = [v[k] for _, v in other if v[k] is not None]
            if len(a) < 2 or len(b) < 2: continue
            lo, hi = boot_ratio(a, b)
            print(f"  {k:15} {REF} mean {st.mean(a):10.1f} med {st.median(a):10.1f} | {arm} mean {st.mean(b):10.1f} med {st.median(b):10.1f}"
                  f" | {arm}/{REF} {st.mean(b)/st.mean(a):.2f} CI95 [{lo:.2f}, {hi:.2f}] p={mw_p(a, b):.3f}")
