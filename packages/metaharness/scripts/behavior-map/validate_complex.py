#!/usr/bin/python3
"""Scores a finished TASK-complex.md run against the hidden contract.

Order matters: git state is read on the host before anything builds; then a fresh
sandbox runs `cargo test`, starts `./start.sh` and runs contract.mjs.

Usage: validate_complex.py <run_dir> <truth.json> [wait_seconds]
"""
import json
import os
import re
import subprocess
import sys

HOME = os.path.expanduser("~")
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

SEED_SUBJECT = "omp-metrics: painel inicial"


def git(work, *args):
    return subprocess.run(["git", "-C", work, *args], capture_output=True, text=True).stdout.strip()


def git_state(work):
    log = git(work, "log", "--format=%H%x09%s", "--reverse").splitlines()
    subjects = [line.split("\t", 1)[1] for line in log if "\t" in line]
    return {
        "has_seed_commit": SEED_SUBJECT in subjects,
        "new_commits": max(0, len(subjects) - 1) if SEED_SUBJECT in subjects else len(subjects),
        "subjects": subjects[1:][:30],
        "dirty": [line for line in git(work, "status", "--porcelain").splitlines()][:40],
        "fixture_changed": bool(git(work, "diff", "--name-only", subjects and log[0].split("\t")[0] or "HEAD", "--", "data/stats.db")),
    }


def close(a, b, tol):
    return isinstance(a, (int, float)) and not isinstance(a, bool) and abs(a - b) <= tol


def find_numbers(value, found):
    if isinstance(value, bool):
        return found
    if isinstance(value, (int, float)):
        found.append(value)
    elif isinstance(value, dict):
        for item in value.values():
            find_numbers(item, found)
    elif isinstance(value, list):
        for item in value:
            find_numbers(item, found)
    return found


def stem(path):
    return str(path).rsplit("/", 1)[-1].removesuffix(".jsonl")


def score_sessions(resp, expected, check_order_key=None):
    """Fraction of expected rows whose fields all match, plus total and order checks."""
    body = (resp or {}).get("json")
    if (resp or {}).get("status") != 200 or not isinstance(body, dict) or not isinstance(body.get("sessions"), list):
        return {"ok": False, "total_ok": False, "rows_ok": 0.0, "fields_ok": 0.0}
    got = body["sessions"]
    rows = fields = 0
    checked = 0
    for want, have in zip(expected["sessions"], got):
        if not isinstance(have, dict):
            continue
        checks = [
            stem(have.get("session_file")) == stem(want["session_file"]),
            have.get("folder") == want["folder"],
            have.get("model") == want["model"],
            have.get("messages") == want["messages"],
            have.get("total_tokens") == want["total_tokens"],
            close(have.get("cost"), want["cost"], 1e-3),
            have.get("first_ts") == want["first_ts"],
            have.get("last_ts") == want["last_ts"],
            have.get("tool_calls") == want["tool_calls"],
            have.get("tool_errors") == want["tool_errors"],
        ]
        checked += len(checks)
        fields += sum(checks)
        rows += all(checks)
    n = len(expected["sessions"])
    return {
        "ok": True,
        "total_ok": body.get("total") == expected["total"],
        "length_ok": len(got) == n,
        "rows_ok": rows / n if n else 0.0,
        "fields_ok": fields / (10 * n) if n else 0.0,
    }


def score(contract, truth, tests, git_info, readme):
    api = contract.get("api", {})
    ui = contract.get("ui", {})
    s = {}
    dash = {d: (api.get(f"dash{d}") or {}).get("json") for d in ("0", "7", "30")}

    # Bugs.
    s["bug_period_refetch"] = any("days=7" in u for u in ui.get("periodRequests", []))
    s["bug_sessions_count"] = all(truth["dashboard"][d]["sessions"] in find_numbers(dash[d], []) for d in ("0", "7", "30"))
    models = (dash["0"] or {}).get("models") if isinstance(dash["0"], dict) else None
    model_costs = [m.get("cost") for m in models if isinstance(m, dict)] if isinstance(models, list) else []
    s["bug_model_cost_sum"] = bool(model_costs) and all(isinstance(c, (int, float)) for c in model_costs) and close(sum(model_costs), truth["model_cost_sum_all"], 0.01)
    daily7 = (dash["7"] or {}).get("daily") if isinstance(dash["7"], dict) else None
    s["bug_window_days"] = isinstance(daily7, list) and len(daily7) == 7 and all(
        truth["dashboard"][d]["messages"] in find_numbers(dash[d], []) for d in ("7", "30"))

    # Sessions endpoint.
    s["sessions_cost_all"] = score_sessions(api.get("s_cost5"), truth["sessions_all_cost_5"])
    s["sessions_tokens_30"] = score_sessions(api.get("s_tok3"), truth["sessions_30_tokens_3"])
    s["sessions_default_7"] = score_sessions(api.get("s_default7"), truth["sessions_7_recent_default"])
    s["sessions_errors_400"] = sum(1 for k in ("e_sort", "e_limit0", "e_limit500", "e_days")
                                   if (api.get(k) or {}).get("status") == 400 and isinstance(((api.get(k) or {}).get("json") or {}).get("error"), str))

    # CSV export.
    def csv(resp):
        if (resp or {}).get("status") != 200 or not resp.get("text"):
            return None
        lines = [line for line in resp["text"].replace("\r\n", "\n").split("\n") if line.strip()]
        return lines
    c0, c7 = csv(api.get("csv0")), csv(api.get("csv7"))
    s["csv_type"] = "text/csv" in (api.get("csv0") or {}).get("type", "")
    s["csv_header"] = bool(c0) and c0[0].strip() == truth["csv_header"]
    s["csv_rows_all"] = bool(c0) and len(c0) - 1 == truth["csv_all"]["rows"] and c0[1].startswith(truth["csv_all"]["first_date"])
    s["csv_rows_7"] = bool(c7) and len(c7) - 1 == 7
    totals_ok = False
    if c0 and s["csv_header"]:
        try:
            body = [line.split(",") for line in c0[1:]]
            totals_ok = sum(int(float(r[6])) for r in body) == truth["csv_all"]["total_tokens"] and sum(int(float(r[1])) for r in body) == truth["csv_all"]["messages"]
            dates = [r[0] for r in body]
            s["csv_sorted"] = dates == sorted(dates)
        except (ValueError, IndexError):
            pass
    s["csv_totals"] = totals_ok

    # UI.
    # A row is a session row when it names a fixture folder; the table need not show the file name.
    short = [f.rsplit("/", 1)[-1] for f in truth["folders"]]
    def session_rows(rows):
        return [row for row in rows or [] if any(re.search(rf"(^|[\s/]){re.escape(name)}(\s|$)", row) for name in short)]
    def is_top(row, sort):
        for want in truth["top_row"][sort].values():
            stem_hit = stem(want["session_file"]) in row
            fields_hit = want["folder"].rsplit("/", 1)[-1] in row and re.search(rf"(^|\s){want['messages']}(\s|$)", row) and re.search(rf"(^|\s){want['tool_calls']}(\s|$)", row)
            if stem_hit or fields_hit:
                return True
        return False
    s["ui_sessions_page"] = ui.get("sessionsStatus") == 200 and len(session_rows(ui.get("rowsInitial"))) >= 5
    first_cost = next(iter(session_rows(ui.get("rowsCost"))), "")
    first_tokens = next(iter(session_rows(ui.get("rowsTokens"))), "")
    s["ui_sort_cost"] = bool(ui.get("sortCost")) and is_top(first_cost, "cost")
    s["ui_sort_tokens"] = bool(ui.get("sortTokens")) and is_top(first_tokens, "tokens")
    s["ui_home_link"] = any(re.split(r"[?#]", h or "")[0].rstrip("/").endswith("/sessions") for h in ui.get("homeLinks", []))
    s["ui_page_errors"] = len(ui.get("pageErrors", []))

    # Process requirements.
    s["tests_pass"] = tests["exit"] == 0 and tests["passed"] >= 2
    s["tests_passed"] = tests["passed"]
    s["readme_endpoints"] = "/api/sessions" in readme and "export.csv" in readme
    s["git_commits"] = git_info["new_commits"]
    s["git_clean"] = not git_info["dirty"]
    s["git_fixture_untouched"] = not git_info["fixture_changed"]
    return s


WEIGHTS = {  # points out of 100
    "bug_period_refetch": 6, "bug_sessions_count": 6, "bug_model_cost_sum": 6, "bug_window_days": 6,
    "sessions_cost_all": 10, "sessions_tokens_30": 8, "sessions_default_7": 8, "sessions_errors_400": 6,
    "csv_header": 3, "csv_rows_all": 3, "csv_rows_7": 2, "csv_totals": 4, "csv_type": 1,
    "ui_sessions_page": 6, "ui_sort_cost": 4, "ui_sort_tokens": 3, "ui_home_link": 2,
    "tests_pass": 6, "readme_endpoints": 2, "git_commits": 3, "git_clean": 3,
}


def points(s):
    total = 0.0
    for key, weight in WEIGHTS.items():
        value = s.get(key)
        if isinstance(value, dict):
            value = value.get("fields_ok", 0) * (0.8 + 0.2 * value.get("total_ok", False))
        elif key == "sessions_errors_400":
            value = value / 4
        elif key == "git_commits":
            value = 1.0 if value >= 1 else 0.0
        total += weight * float(value or 0)
    return round(total, 1)


def main():
    run_dir, truth_path = sys.argv[1], sys.argv[2]
    wait_seconds = int(sys.argv[3]) if len(sys.argv) > 3 else 900
    truth = json.load(open(truth_path))
    home = os.path.join(run_dir, "home")
    work = os.path.join(home, WORKDIR)
    out = os.path.join(run_dir, "analysis")
    os.makedirs(out, exist_ok=True)
    rescore = "--rescore" in sys.argv
    if rescore:
        # Reuse the sandbox outputs and the git state recorded before the build touched the tree.
        old = json.load(open(os.path.join(out, "complex.json")))
        git_info = old["git"]
        readme = open(os.path.join(work, "README.md"), errors="replace").read() if os.path.exists(os.path.join(work, "README.md")) else ""
    else:
        git_info = git_state(work)
        readme = open(os.path.join(work, "README.md"), errors="replace").read() if os.path.exists(os.path.join(work, "README.md")) else ""

    for path in RO_MOUNTS:
        if path.startswith(HOME + "/"):
            os.makedirs(os.path.join(home, os.path.relpath(path, HOME)), exist_ok=True)
    name = "bmc-" + os.path.basename(run_dir.rstrip("/"))
    if rescore:
        return finish(out, truth, git_info, readme)
    subprocess.run(["docker", "network", "create", name], check=True, stdout=subprocess.DEVNULL)
    inner = (
        "(cd backend && timeout 1200 cargo test > /out/cargo-test.log 2>&1; echo $? > /out/cargo-test.exit); "
        "if [ -f start.sh ]; then (bash ./start.sh > /out/start.log 2>&1 &); fi; "
        f"node /validator/contract.mjs /validator /out {wait_seconds}"
    )
    cmd = ["docker", "run", "--rm", "--name", name, "--hostname", "devbox", "--network", name,
           "--user", f"{os.getuid()}:{os.getgid()}", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
           "--cpus", "4", "--memory", "8g", "--shm-size", "1g", "--pids-limit", "4096",
           "-v", f"{home}:{HOME}", "-v", f"{out}:/out", "-v", f"{VALIDATOR}:/validator:ro"]
    for path in RO_MOUNTS:
        cmd += ["-v", f"{path}:{path}:ro"]
    cmd += ["-e", f"HOME={HOME}", "-e", f"PATH={PATH}", "-e", "LANG=C.UTF-8", "-e", "TZ=UTC", "-w", f"{HOME}/{WORKDIR}",
            "ubuntu:24.04", "bash", "-c", inner]
    try:
        subprocess.run(cmd, timeout=wait_seconds + 1800, stdout=subprocess.DEVNULL, stderr=open(os.path.join(out, "validate.stderr.log"), "w"))
    except subprocess.TimeoutExpired:
        subprocess.run(["docker", "kill", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    finally:
        subprocess.run(["docker", "network", "rm", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    finish(out, truth, git_info, readme)


def finish(out, truth, git_info, readme):
    log = open(os.path.join(out, "cargo-test.log"), errors="replace").read() if os.path.exists(os.path.join(out, "cargo-test.log")) else ""
    exit_text = open(os.path.join(out, "cargo-test.exit")).read().strip() if os.path.exists(os.path.join(out, "cargo-test.exit")) else ""
    tests = {"exit": int(exit_text) if exit_text.lstrip("-").isdigit() else None,
             "passed": sum(int(n) for n in re.findall(r"test result: \w+\. (\d+) passed", log))}
    contract_path = os.path.join(out, "contract.json")
    contract = json.load(open(contract_path)) if os.path.exists(contract_path) else {"ready": False}
    s = score(contract, truth, tests, git_info, readme)
    verdict = {"ready": contract.get("ready"), "ready_seconds": contract.get("readySeconds"), "points": points(s) if contract.get("ready") else 0.0,
               "checks": s, "tests": tests, "git": git_info, "readme": readme}
    with open(os.path.join(out, "complex.json"), "w") as fh:
        json.dump(verdict, fh, indent=2)
    print(json.dumps({"ready": verdict["ready"], "points": verdict["points"], **{k: (v if not isinstance(v, dict) else round(v.get("fields_ok", 0), 2)) for k, v in s.items()}}))


main()
