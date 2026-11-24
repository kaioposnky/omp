#!/usr/bin/python3
"""Packages each finished run for blind analysis under a letter label.

Usage: blind.py <runs_dir> <out_dir>
Writes <out_dir>/<letter>/ per run and <out_dir>/key.json (label -> run), which the
analysts never see.
"""
import json
import os
import random
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "../../../.."))
SUBJECTS = ["deepseek", "opus", "sol", "sonnet", "terra"]
SKIP = shutil.ignore_patterns("node_modules", "target", ".git", "dist", ".astro", ".pnpm-store", "*.db", "*.db-*", "*.sqlite*")


def main():
    runs_dir, out_dir = sys.argv[1], sys.argv[2]
    labels = list("ABCDE")
    random.Random(20261123).shuffle(labels)
    key = {label: run for label, run in zip(labels, SUBJECTS) if os.path.exists(os.path.join(runs_dir, run, "analysis/validation.json"))}
    os.makedirs(out_dir, exist_ok=True)
    for label, run in key.items():
        src, dest = os.path.join(runs_dir, run), os.path.join(out_dir, label)
        if os.path.exists(dest):
            shutil.rmtree(dest)
        os.makedirs(dest)
        analysis = os.path.join(src, "analysis")
        for name in os.listdir(analysis):
            if name.endswith((".md", ".json", ".png")) and name != "check.json":
                shutil.copy2(os.path.join(analysis, name), os.path.join(dest, name))
        with open(os.path.join(dest, "metrics.json")) as fh:
            metrics = json.load(fh)
        metrics["label"] = label
        for name in ("estimated_cost_usd", "estimated_cost_usd_no_cache"):
            metrics.pop(name, None)
        with open(os.path.join(dest, "metrics.json"), "w") as fh:
            json.dump(metrics, fh, indent=2)
        with open(os.path.join(dest, "transcript.md")) as fh:
            transcript = fh.read().replace(f"# Run {run}", f"# Run {label}", 1)
        with open(os.path.join(dest, "transcript.md"), "w") as fh:
            fh.write(transcript)
        shutil.copytree(os.path.join(src, "home/work/omp-metrics"), os.path.join(dest, "workspace"), ignore=SKIP, symlinks=True)
        for name in ("TASK.md", "METHOD.md"):
            shutil.copy2(os.path.join(HERE, name), os.path.join(dest, name))
        shutil.copy2(os.path.join(REPO, "packages/coding-agent/src/prompts/system/system-prompt.md"), os.path.join(dest, "system-prompt.md"))
        shutil.copy2(os.path.join(src, "home/.omp/agent/AGENTS.md"), os.path.join(dest, "global-AGENTS.md"))
    with open(os.path.join(out_dir, "key.json"), "w") as fh:
        json.dump(key, fh, indent=2)
    print(json.dumps(sorted(key)))


main()
