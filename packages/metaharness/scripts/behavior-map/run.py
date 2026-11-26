#!/usr/bin/python3
"""Runs one measured omp session inside a throwaway sandbox.

Isolation: one Docker container and one Docker network per run. The container sees
the host toolchain read-only (/usr, /opt, rustup, cargo, node, bun, the omp binary)
and a private HOME holding a per-run copy of the user's real agent setup (config,
global AGENTS.md, agents, skills, extensions, MCP config). It never sees this
repository, past sessions, agent.db (stored logins), other projects' memory banks
or any other run. The local model router is reached through a Unix socket that only
this run's container mounts; each run has its own loopback, so runs cannot reach each
other's servers.

Environment: BM_OMP_BIN = omp binary to measure (default: the installed one);
BM_MODELS_PATCH=1 = give the DeepSeek route short stall deadlines in models.yml;
BM_EXTRA_ARGS = extra omp CLI flags (e.g. `--tools eval,todo,wait` to drop subagents).

Usage: run.py <slug> <provider/model> <thinking> <task.md> <fixture.db> [max_minutes] [workspace_dir]
With workspace_dir, that directory becomes the working directory and no fixture is copied.
"""
import copy
import json
import os
import shutil
import subprocess
import sys
import time

import yaml

HOME = os.path.expanduser("~")
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../.."))
ROOT = os.environ.get("BM_ROOT", os.path.join(HOME, "omp-bench/behavior-map/runs"))
IMAGE = "ubuntu:24.04"
OMP_BIN = os.environ.get("BM_OMP_BIN", f"{HOME}/.local/bin/omp")
MODELS_PATCH = os.environ.get("BM_MODELS_PATCH") == "1"
EXTRA_ARGS = os.environ.get("BM_EXTRA_ARGS", "")
AGENTS_MD = os.environ.get("BM_AGENTS_MD")  # replaces ~/.omp/agent/AGENTS.md in the run home
STALL_DEADLINE_MS = 120_000
ROUTER_PORT = 20128
WORKDIR = "work/omp-metrics"
# Roles that select a chat model; every one is pointed at the measured model so
# delegation stays observable without mixing models.
LLM_ROLES = ["default", "smol", "slow", "plan", "task", "advisor", "designer", "tiny", "commit", "vision", "judge", "WEBDEV", "BEST-CLAUDE", "FREE-INSECURE"]
EFFORT_OVERRIDE = {
    "reasoning": True,
    "thinking": {"mode": "effort", "efforts": ["low", "medium", "high", "xhigh", "max"]},
    "compat": {"supportsReasoningEffort": True, "thinkingFormat": "openai"},
}
PATH = ":".join([
    f"{HOME}/.local/bin", f"{HOME}/.cargo/bin", f"{HOME}/.bun/bin", "/home/linuxbrew/.linuxbrew/bin",
    f"{HOME}/.nvm/versions/node/v24.14.0/bin", "/usr/local/sbin", "/usr/local/bin", "/usr/sbin", "/usr/bin", "/sbin", "/bin",
])
RO_MOUNTS = [
    "/usr", "/opt", "/etc/ssl", "/etc/alternatives", "/etc/passwd", "/etc/group", "/etc/fonts", "/etc/ld.so.cache",
    "/etc/ca-certificates", "/etc/machine-id", "/home/linuxbrew",
    f"{HOME}/.rustup", f"{HOME}/.cargo/bin", f"{HOME}/.nvm", f"{HOME}/.bun/bin",
    f"{HOME}/.omp/cache/fastembed", f"{HOME}/.omp/cache/fastembed-runtime",
]


def build_home(run_dir, model, thinking):
    home = os.path.join(run_dir, "home")
    agent_src, agent = os.path.join(HOME, ".omp/agent"), os.path.join(home, ".omp/agent")
    os.makedirs(agent)
    for name in ["AGENTS.md", "mcp.json", "keybindings.yml", "models.db"]:
        shutil.copy2(os.path.join(agent_src, name), os.path.join(agent, name))
    if AGENTS_MD:
        shutil.copy2(AGENTS_MD, os.path.join(agent, "AGENTS.md"))
    for name in ["agents", "skills", "managed-skills", "tools"]:
        shutil.copytree(os.path.join(agent_src, name), os.path.join(agent, name), symlinks=False)
    os.makedirs(os.path.join(agent, "extensions/pi-jev"))
    for name in os.listdir(os.path.join(agent_src, "extensions")):
        if name.endswith(".ts"):
            shutil.copy2(os.path.join(agent_src, "extensions", name), os.path.join(agent, "extensions", name))
    for name in ["skills", "plugins"]:
        shutil.copytree(os.path.join(HOME, ".omp", name), os.path.join(home, ".omp", name), symlinks=True)
    shutil.copy2(os.path.join(HOME, ".omp/marketplaces.json"), os.path.join(home, ".omp/marketplaces.json"))

    with open(os.path.join(agent_src, "config.yml")) as fh:
        config = yaml.safe_load(fh)
    for role in LLM_ROLES:
        config["modelRoles"][role] = f"{model}:{thinking}"
    # No user Chrome exists inside the sandbox; the managed headless browser stays available.
    config.setdefault("browser", {})["relay"] = False
    with open(os.path.join(agent, "config.yml"), "w") as fh:
        yaml.safe_dump(config, fh, sort_keys=False)

    with open(os.path.join(agent_src, "models.yml")) as fh:
        models = yaml.safe_load(fh)
    provider, _, model_id = model.partition("/")
    providers = {"9router": models["providers"]["9router"]}
    if provider != "9router":
        # Only the run that needs this provider receives its API key.
        providers[provider] = models["providers"][provider]
    else:
        providers["9router"].setdefault("modelOverrides", {})[model_id] = copy.deepcopy(EFFORT_OVERRIDE)
    if MODELS_PATCH and "deepseek" in model_id:
        compat = providers[provider].setdefault("modelOverrides", {}).setdefault(model_id, {}).setdefault("compat", {})
        compat["streamIdleTimeoutMs"] = STALL_DEADLINE_MS
        compat["streamFirstEventTimeoutMs"] = STALL_DEADLINE_MS
    with open(os.path.join(agent, "models.yml"), "w") as fh:
        yaml.safe_dump({"providers": providers}, fh, sort_keys=False)

    # Mount points must exist and belong to the user, or Docker creates them as root.
    for path in RO_MOUNTS:
        if path.startswith(HOME + "/"):
            os.makedirs(os.path.join(home, os.path.relpath(path, HOME)), exist_ok=True)
    os.makedirs(os.path.join(home, ".local/bin"), exist_ok=True)
    open(os.path.join(home, ".local/bin/omp"), "w").close()
    return home


def main():
    slug, model, thinking, task_path, fixture = sys.argv[1:6]
    max_minutes = int(sys.argv[6]) if len(sys.argv) > 6 else 60
    run_dir = os.path.join(ROOT, slug)
    if os.path.exists(run_dir):
        sys.exit(f"{run_dir} already exists")
    os.makedirs(os.path.join(run_dir, "sock"))
    home = build_home(run_dir, model, thinking)
    work = os.path.join(home, WORKDIR)
    if len(sys.argv) > 7:
        shutil.copytree(sys.argv[7], work, symlinks=True)
    else:
        os.makedirs(os.path.join(work, "data"))
        shutil.copy2(fixture, os.path.join(work, "data/stats.db"))
    os.makedirs(os.path.join(run_dir, "task"))
    shutil.copy2(task_path, os.path.join(run_dir, "task/TASK.md"))

    name = f"bm-{slug}"
    sock = os.path.join(run_dir, "sock/router.sock")
    forward = subprocess.Popen(["socat", f"UNIX-LISTEN:{sock},fork,mode=600", f"TCP:127.0.0.1:{ROUTER_PORT}"])
    subprocess.run(["docker", "network", "create", name], check=True, stdout=subprocess.DEVNULL)
    inner = (
        f"socat TCP-LISTEN:{ROUTER_PORT},bind=127.0.0.1,fork,reuseaddr UNIX-CONNECT:/run/router/router.sock & "
        f"exec omp -p --mode json --model {model} --thinking {thinking} --code-mode --auto-approve --wait-async {EXTRA_ARGS} "
        # The task goes in on stdin, not argv: a model running `pkill -f <word from the task>`
        # would otherwise match omp's own command line and kill the session.
        f"--max-time {max_minutes}m < /run/task/TASK.md"
    )
    cmd = [
        "docker", "run", "--rm", "--name", name, "--hostname", "devbox", "--network", name,
        "--user", f"{os.getuid()}:{os.getgid()}", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
        "--cpus", "3", "--memory", "6g", "--shm-size", "1g", "--pids-limit", "4096",
        "-v", f"{home}:{HOME}", "-v", f"{run_dir}/sock:/run/router", "-v", f"{run_dir}/task:/run/task:ro",
        "-v", f"{REPO}/vendor/pi-jev:{HOME}/.omp/agent/extensions/pi-jev:ro",
        "-v", f"{OMP_BIN}:{HOME}/.local/bin/omp:ro",
    ]
    for path in RO_MOUNTS:
        cmd += ["-v", f"{path}:{path}:ro"]
    cmd += ["-e", f"HOME={HOME}", "-e", f"PATH={PATH}", "-e", "LANG=C.UTF-8", "-e", "TERM=xterm-256color", "-e", "TZ=UTC",
            "-w", f"{HOME}/{WORKDIR}", IMAGE, "bash", "-c", inner]

    meta = {"slug": slug, "model": model, "thinking": thinking, "max_minutes": max_minutes, "started": time.time(),
            "omp_bin": OMP_BIN, "models_patch": MODELS_PATCH, "extra_args": EXTRA_ARGS}
    timed_out = False
    with open(os.path.join(run_dir, "events.jsonl"), "w") as events, open(os.path.join(run_dir, "stderr.log"), "w") as err:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=err, text=True)
        deadline = time.time() + (max_minutes + 5) * 60
        try:
            for line in proc.stdout:
                # Streaming deltas repeat what message_end carries in full.
                if '"type":"message_update"' not in line[:60]:
                    events.write(line)
                    events.flush()
                if time.time() > deadline:
                    timed_out = True
                    break
        finally:
            if proc.poll() is None:
                subprocess.run(["docker", "kill", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            meta["exit_code"] = proc.wait()
            forward.terminate()
            subprocess.run(["docker", "network", "rm", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    meta.update(finished=time.time(), wall_seconds=round(time.time() - meta["started"]), timed_out=timed_out)
    with open(os.path.join(run_dir, "meta.json"), "w") as fh:
        json.dump(meta, fh, indent=2)
    print(json.dumps(meta))


main()
