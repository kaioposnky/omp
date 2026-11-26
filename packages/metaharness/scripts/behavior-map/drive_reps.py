#!/usr/bin/python3
"""Runs model x replicate groups (every arm of one model/replicate together), scores them, and reruns
any group in which a run hit a provider usage limit, after the limit resets.
Usage: drive_reps.py <root> <models,comma> <first-last> <parallel> [arms,comma (default base,v3)]"""
import glob, os, shutil, subprocess, sys, time
K = os.path.dirname(os.path.abspath(__file__))
TRUTH = os.path.expanduser("~/omp-bench/complex/truth.json")
root, models, reps, par = sys.argv[1], sys.argv[2].split(","), sys.argv[3], sys.argv[4]
first, last = map(int, reps.split("-"))
ARMS = tuple(sys.argv[5].split(",")) if len(sys.argv) > 5 else ("base", "v3")
log = open(os.path.join(root, "drive.log"), "a")
def note(msg):
    log.write(time.strftime("%H:%M:%S ") + msg + "\n"); log.flush()

def quota_hit(run):
    path = os.path.join(run, "events.jsonl")
    if not os.path.exists(path):
        return True  # never started
    with open(path, errors="replace") as fh:
        return any("usage limit has been reached" in line or "rate_limit" in line for line in fh)

def score(run):
    name = os.path.basename(run)
    subprocess.run(["/usr/bin/python3", f"{K}/collect.py", run, name], stdout=open(f"{run}.collect.log", "w"), stderr=subprocess.STDOUT)
    subprocess.run(["/usr/bin/python3", f"{K}/validate_complex.py", run, TRUTH, "900"], stdout=open(f"{run}.validate.log", "w"), stderr=subprocess.STDOUT)
    work = os.path.join(run, "home/work/omp-metrics")
    for sub in ("backend/target", "frontend/node_modules"):  # build artifacts only; analysis/ keeps the scores
        shutil.rmtree(os.path.join(work, sub), ignore_errors=True)

os.makedirs(root, exist_ok=True)
pending = [(m, r) for r in range(first, last + 1) for m in models]
while pending:
    m, r = pending.pop(0)
    names = [f"{m}-{arm}-r{r}" for arm in ARMS]
    for n in names:
        shutil.rmtree(os.path.join(root, n), ignore_errors=True)
        subprocess.run(["docker", "network", "rm", f"bm-{n}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    note(f"run {m} r{r}")
    subprocess.run(["/usr/bin/python3", f"{K}/schedule_complex.py", root, f"{r}-{r}", ",".join(ARMS), m],
                   env=dict(os.environ, BM_MAX_PARALLEL=par))
    runs = [os.path.join(root, n) for n in names]
    if any(quota_hit(x) for x in runs):
        note(f"quota hit {m} r{r}; retry after 31 min")
        pending.append((m, r))
        time.sleep(31 * 60)
        continue
    for x in runs:
        score(x)
    note(f"scored {m} r{r}")
note("all done")
