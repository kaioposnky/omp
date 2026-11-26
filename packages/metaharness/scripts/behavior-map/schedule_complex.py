#!/usr/bin/python3
"""Runs the TASK-complex.md A/B: every model x {base, new} binary x N replicates.

Both arms of a model/replicate start together so they face the same router load.
At most MAX_PARALLEL sandboxes run at once. A run that has given its final answer
but stays alive (a background server under --wait-async) is stopped after GRACE_S.

Usage: schedule_complex.py <out_root> <replicates> [arms] [models]
replicates: N runs r1..rN, or a range FIRST-LAST (e.g. 3-5) to add replicates to earlier rounds.
arms: comma list from ARMS (default base,new); models: comma list of slugs (default all).
"""
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
HOME = os.path.expanduser("~")
BASE_BIN = f"{HOME}/omp-bench/build-base/oh-my-pi/packages/coding-agent/dist/omp"
NEW_BIN = f"{HOME}/omp-bench/build/oh-my-pi/packages/coding-agent/dist/omp"
V3_BIN = f"{HOME}/omp-bench/build3/oh-my-pi/packages/coding-agent/dist/omp"
# arm -> (binary, extra omp flags)
ARMS = {
    "base": (BASE_BIN, ""),
    "new": (NEW_BIN, ""),
    # No subagents: every Code Mode tool except task.
    "solo": (NEW_BIN, "--tools eval,read,bash,edit,write,grep,glob,todo,wait,ast_edit,lsp,web_search"),
    # Round 3: retry fix, subagent wait floor, model rules, eval output hint, X11 note gating.
    "v3": (V3_BIN, ""),
}
MODELS = [  # slug, model, thinking
    ("terra", "9router/cx/gpt-6.1-terra", "high"),
    ("sol", "9router/cx/gpt-6.2-sol", "high"),
    ("deepseek", "kgdev/cmd/deepseek/deepseek-v4.1-flash-fast", "high"),
    ("opus", "9router/cc/claude-opus-5-5", "high"),
    ("sonnet", "9router/cc/claude-sonnet-5-5", "high"),
]
MAX_PARALLEL = int(os.environ.get("BM_MAX_PARALLEL", "6"))  # lower it when a provider quota is tight
MAX_MINUTES = 60
GRACE_S = 120
SEED = f"{HOME}/omp-bench/complex/seed"
FIXTURE = f"{HOME}/omp-bench/behavior-map/stats.db"


def finished_answer(run_dir):
    path = os.path.join(run_dir, "events.jsonl")
    if not os.path.exists(path):
        return False
    with open(path) as fh:
        for line in fh:
            if '"type":"agent_end"' in line[:40] and json.loads(line).get("isTerminal") is True:
                return True
    return False


def main():
    root = sys.argv[1]
    first, _, last = sys.argv[2].rpartition("-")
    first, last = int(first or 1), int(last)
    arms = sys.argv[3].split(",") if len(sys.argv) > 3 else ["base", "new"]
    wanted = set(sys.argv[4].split(",")) if len(sys.argv) > 4 else None
    os.makedirs(root, exist_ok=True)
    queue = [[(f"{slug}-{arm}-r{rep}", model, thinking, arm) for arm in arms]
             for rep in range(first, last + 1) for slug, model, thinking in MODELS if wanted is None or slug in wanted]
    running = {}  # name -> (Popen, run_dir, answered_at)
    log = open(os.path.join(root, "schedule.log"), "a")
    def note(msg):
        log.write(f"{time.strftime('%H:%M:%S')} {msg}\n")
        log.flush()
    while queue or running:
        while queue and len(running) + len(queue[0]) <= MAX_PARALLEL:
            for name, model, thinking, arm in queue.pop(0):
                binary, extra = ARMS[arm]
                env = dict(os.environ, BM_ROOT=root, BM_OMP_BIN=binary, BM_MODELS_PATCH="1", BM_EXTRA_ARGS=extra)
                proc = subprocess.Popen(["/usr/bin/python3", os.path.join(HERE, "run.py"), name, model, thinking,
                                         os.path.join(HERE, "TASK-complex.md"), FIXTURE, str(MAX_MINUTES), SEED],
                                        env=env, stdout=subprocess.DEVNULL, stderr=open(os.path.join(root, f"{name}.runner.log"), "w"))
                running[name] = [proc, os.path.join(root, name), None]
                note(f"start {name}")
        time.sleep(15)
        for name, entry in list(running.items()):
            proc, run_dir, answered = entry
            if proc.poll() is not None:
                del running[name]
                note(f"done {name} exit={proc.returncode}")
                meta_path = os.path.join(run_dir, "meta.json")
                if os.path.exists(meta_path):
                    meta = json.load(open(meta_path))
                    if answered == float("inf"):
                        meta["stopped_by_orchestrator"] = True
                    if meta.get("exit_code") == 1 and meta.get("wall_seconds", 0) >= MAX_MINUTES * 60 - 30:
                        meta.update(timed_out=True, hit_max_time=True)
                    json.dump(meta, open(meta_path, "w"), indent=2)
                continue
            if answered is None and finished_answer(run_dir):
                entry[2] = time.time()
                note(f"answered {name}")
            elif answered is not None and time.time() - answered > GRACE_S:
                note(f"stopping {name}: alive {GRACE_S}s after its final answer")
                subprocess.run(["docker", "stop", "-t", "10", f"bm-{name}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                entry[2] = float("inf")
    note("all runs finished")


main()
