#!/usr/bin/python3
"""Objective check of a finished run: start the delivered site in a fresh sandbox,
load it in headless Chrome and compare what it shows with the fixture's ground truth.

Usage: validate.py <run_dir> <truth.json> [wait_seconds]
"""
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
HOME = os.path.expanduser("~")
HERE = os.path.dirname(os.path.abspath(__file__))
VALIDATOR = os.path.join(HOME, "omp-bench/behavior-map/validator")
WORKDIR = "work/omp-metrics"
PATH = ":".join([
    f"{HOME}/.local/bin", f"{HOME}/.cargo/bin", f"{HOME}/.bun/bin", "/home/linuxbrew/.linuxbrew/bin",
    f"{HOME}/.nvm/versions/node/v24.14.0/bin", "/usr/local/sbin", "/usr/local/bin", "/usr/sbin", "/usr/bin", "/sbin", "/bin",
])
RO_MOUNTS = [
    "/usr", "/opt", "/etc/ssl", "/etc/alternatives", "/etc/passwd", "/etc/group", "/etc/fonts", "/etc/ld.so.cache",
    "/etc/ca-certificates", "/etc/machine-id", "/home/linuxbrew",
    f"{HOME}/.rustup", f"{HOME}/.cargo/bin", f"{HOME}/.nvm", f"{HOME}/.bun/bin",
]


def numbers(value, found):
    if isinstance(value, bool):
        return
    if isinstance(value, (int, float)):
        found.append(float(value))
    elif isinstance(value, dict):
        for item in value.values():
            numbers(item, found)
    elif isinstance(value, list):
        for item in value:
            numbers(item, found)
    elif isinstance(value, str) and re.fullmatch(r"-?\d+(\.\d+)?", value):
        found.append(float(value))


def shown(text, value):
    """True when the page text carries this number in a common display form."""
    digits = re.sub(r"(?<=[0-9])\s*(mi|bi|mil)\b", lambda m: m.group(1)[0].replace("m", "k") if m.group(1) == "mil" else m.group(1)[0], text, flags=re.I)
    digits = re.sub(r"[^0-9.,kKmMbB]", " ", digits)
    forms = {f"{value:,.0f}", f"{value:.0f}", f"{value:,.0f}".replace(",", "."), f"{value:,.0f}".replace(",", " ")}
    for scale, suffix in ((1e3, "k"), (1e6, "m"), (1e9, "b")):
        if value >= scale:
            for places in (0, 1, 2):
                short = f"{value / scale:.{places}f}"
                forms |= {short + suffix, short.replace(".", ",") + suffix}
    # "56,7 mi", "481.6 M", "3,4 bi": drop the space between number and unit, and the pt-BR "i".
    low = re.sub(r"(?<=[0-9])\s+(?=[kmb])", "", digits.lower())
    return any(re.search(r"(?<![0-9.,])" + re.escape(form.lower()) + r"(?![0-9])", low) for form in forms)


def main():
    run_dir, truth_path = sys.argv[1], sys.argv[2]
    wait_seconds = int(sys.argv[3]) if len(sys.argv) > 3 else 600
    truth = json.load(open(truth_path))
    home = os.path.join(run_dir, "home")
    out = os.path.join(run_dir, "analysis")
    os.makedirs(out, exist_ok=True)
    name = "bmv-" + os.path.basename(run_dir.rstrip("/"))
    subprocess.run(["docker", "network", "create", name], check=True, stdout=subprocess.DEVNULL)
    inner = (
        "if [ -f start.sh ]; then (bash ./start.sh > /out/start.log 2>&1 &); else echo 'no start.sh' > /out/start.log; fi; "
        f"node /validator/check.mjs /validator /out {wait_seconds if os.path.exists(os.path.join(home, WORKDIR, 'start.sh')) else 5}"
    )
    cmd = ["docker", "run", "--rm", "--name", name, "--hostname", "devbox", "--network", name,
           "--user", f"{os.getuid()}:{os.getgid()}", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
           "--cpus", "4", "--memory", "8g", "--shm-size", "1g", "--pids-limit", "4096",
           "-v", f"{home}:{HOME}", "-v", f"{out}:/out", "-v", f"{VALIDATOR}:/validator:ro"]
    for path in RO_MOUNTS:
        cmd += ["-v", f"{path}:{path}:ro"]
    cmd += ["-e", f"HOME={HOME}", "-e", f"PATH={PATH}", "-e", "LANG=C.UTF-8", "-w", f"{HOME}/{WORKDIR}", "ubuntu:24.04", "bash", "-c", inner]
    try:
        subprocess.run(cmd, timeout=wait_seconds + 420, stdout=subprocess.DEVNULL, stderr=open(os.path.join(out, "validate.stderr.log"), "w"))
    except subprocess.TimeoutExpired:
        subprocess.run(["docker", "kill", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    finally:
        subprocess.run(["docker", "network", "rm", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    check_path = os.path.join(out, "check.json")
    check = json.load(open(check_path)) if os.path.exists(check_path) else {"ready": False, "responses": [], "pages": [], "consoleErrors": [], "pageErrors": []}
    api_numbers, api_calls = [], []
    for response in check["responses"]:
        if "body" in response:
            api_calls.append({"url": response["url"], "status": response["status"], "bytes": len(response["body"])})
            try:
                numbers(json.loads(response["body"]), api_numbers)
            except ValueError:
                pass
    text = "\n".join(page.get("text", "") + "\n" + page.get("textWidest", "") for page in check["pages"])
    scalars = ["messages", "sessions", "tool_calls", "total_tokens", "input_tokens", "output_tokens", "cache_read_tokens", "cost_total", "errors"]
    accuracy = {}
    for key in scalars:
        value = float(truth[key])
        accuracy[key] = {
            "in_api": any(abs(n - value) <= max(0.005 * value, 0.01) for n in api_numbers),
            "on_page": shown(text, value) or (key == "cost_total" and bool(re.search(r"347[.,][12]", text))),
        }
    model_tokens = [float(v["total_tokens"]) for v in truth["by_model"].values()]
    pages = check["pages"]
    canvases = [c for page in pages for c in page.get("canvases", [])]
    verdict = {
        "start_sh_present": os.path.exists(os.path.join(home, WORKDIR, "start.sh")),
        "site_up": check["ready"],
        "seconds_to_ready": check.get("readySeconds"),
        "root_status": check.get("rootStatus"),
        "loopback": check.get("loopback"),
        "pages_visited": [{"url": p["url"], "status": p.get("status"), "title": p.get("title"), "height": p.get("height")} for p in pages],
        "webgl_canvas": any(str(c.get("ctx", "")).startswith(("webgl", "webgpu")) for c in canvases),
        "webgl_animated": any(p.get("glAnimated") for p in pages),
        "canvas_2d_count": sum(1 for c in canvases if c.get("ctx") == "2d"),
        "animated_canvas_contexts": [ctx for p in pages for ctx in p.get("animatedCanvases", [])],
        "chart_svg_count": sum(len(p.get("chartSvgs", [])) for p in pages),
        "bar_like_elements": max((p.get("barLikeElements", 0) for p in pages), default=0),
        "css_3d_elements": max((p.get("css3d", 0) for p in pages), default=0),
        "running_animations": max((p.get("runningAnimations", 0) for p in pages), default=0),
        "widest_period_control": check.get("widestPeriod"),
        "json_api_calls": api_calls[:40],
        "failed_requests": [{"url": r["url"], "status": r["status"]} for r in check["responses"] if r["status"] >= 400][:20],
        "console_errors": check["consoleErrors"][:15],
        "page_errors": check["pageErrors"][:15],
        "truth_scalars": accuracy,
        "truth_scalars_in_api": sum(1 for v in accuracy.values() if v["in_api"]),
        "truth_scalars_on_page": sum(1 for v in accuracy.values() if v["on_page"]),
        "per_model_token_totals_in_api": sum(1 for value in model_tokens if any(abs(n - value) <= 0.005 * value for n in api_numbers)),
        "per_model_token_totals_expected": len(model_tokens),
        "page_text_chars": len(text),
    }
    for log in ("start.log",):
        path = os.path.join(out, log)
        verdict["start_log_tail"] = open(path, errors="replace").read()[-1500:] if os.path.exists(path) else None
    with open(os.path.join(out, "validation.json"), "w") as fh:
        json.dump(verdict, fh, indent=2)
    print(json.dumps({k: verdict[k] for k in ("site_up", "seconds_to_ready", "webgl_canvas", "webgl_animated", "canvas_2d_count", "chart_svg_count", "truth_scalars_in_api", "truth_scalars_on_page", "per_model_token_totals_in_api")}))


main()
