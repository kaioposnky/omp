"""Summarize runs.jsonl beside this file: paired tokens/requests and hidden checks per model."""
import json, os, statistics as st
from collections import defaultdict

with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "runs.jsonl")) as fh:
    rows = [json.loads(l) for l in fh if l.strip()]

def short(m):
    return m.split("/")[-1].split(":")[0]

by = defaultdict(dict)
for r in rows:
    by[short(r["model"])][(r["arm"], r["task"], r["rep"])] = r

print(f"runs={len(rows)}")
hdr = "| Model | Pairs | Tokens normal→code (median) | Δ tokens | Requests normal→code (median) | Hidden checks normal / code | Tests OK n/c | Outside edits n/c | Errors n/c |"
print(hdr); print("|" + "---|" * 9)
allpairs = []
for m in sorted(by):
    d = by[m]; pairs = []
    agg = {a: dict(p=0, t=0, tests=0, out=0, err=0, n=0) for a in ("normal", "code")}
    for (arm, task, rep), r in d.items():
        a = agg[arm]; a["n"] += 1
        c = r.get("check") or {}
        a["p"] += c.get("passed", 0); a["t"] += c.get("total", 0)
        a["tests"] += 1 if c.get("testsOk") else 0
        a["out"] += 1 if c.get("touchedOutside") else 0
        a["err"] += 1 if r.get("error") else 0
        if arm == "normal" and ("code", task, rep) in d:
            n, c2 = r, d[("code", task, rep)]
            if n.get("tokens") and c2.get("tokens"):
                pairs.append((n["tokens"], c2["tokens"], n["requests"], c2["requests"]))
    allpairs += [(m, *p) for p in pairs]
    if not pairs:
        continue
    tn = st.median(p[0] for p in pairs); tc = st.median(p[1] for p in pairs)
    rn = st.median(p[2] for p in pairs); rc = st.median(p[3] for p in pairs)
    delta = st.median((p[1] - p[0]) / p[0] for p in pairs)
    print(f"| {m} | {len(pairs)} | {tn/1000:.0f}k → {tc/1000:.0f}k | {delta*100:+.0f}% | {rn:g} → {rc:g} | "
          f"{agg['normal']['p']}/{agg['normal']['t']} / {agg['code']['p']}/{agg['code']['t']} | "
          f"{agg['normal']['tests']}/{agg['normal']['n']} · {agg['code']['tests']}/{agg['code']['n']} | "
          f"{agg['normal']['out']} / {agg['code']['out']} | {agg['normal']['err']} / {agg['code']['err']} |")

wins = sum(1 for p in allpairs if p[2] < p[1])
print(f"\ncode cheaper in {wins}/{len(allpairs)} pairs")
print("\nfailures (hidden check not full, or error):")
for r in sorted(rows, key=lambda r: (short(r['model']), r['task'], r['arm'], r['rep'])):
    c = r.get("check") or {}
    if r.get("error") or c.get("passed") != c.get("total") or c.get("touchedOutside") or r.get("untracked"):
        print(f"  {short(r['model'])} {r['arm']} {r['task']} r{r['rep']}: {c.get('passed')}/{c.get('total')} "
              f"testsOk={c.get('testsOk')} outside={c.get('touchedOutside')} untracked={r.get('untracked')} "
              f"err={(r.get('error') or '')[:80]} fails={(c.get('failures') or [])[:2]}")
