# behavior-map

Per-model benchmark of omp in Code Mode: every model runs the same task in its own Docker sandbox with
the user's real agent setup, then deterministic checks score what it delivered and how it worked.

- `METHOD.md`: design, controls, codebook. `ANALYST.md`: brief for blind analyst runs.
- `MODEL-NOTES.md`: what each harness change did per model, model traits, and the per-model rules
  shipped as `packages/coding-agent/src/discovery/model-rules/`.
- `results/`: committed evidence per round (metrics, validation, comparisons; no transcripts).

## Tasks

| Task | Start | Scoring |
|---|---|---|
| `TASK.md` (greenfield dashboard) | empty dir + `stats.db` fixture | `validate.py` + `check.mjs`: site up, true totals in API and page, charts, 3D |
| `TASK-complex.md` (existing repo) | seed repo with 4 planted bugs | `validate_complex.py` + `contract.mjs`: hidden API/CSV/UI contract, `cargo test`, git state (98 points) |

## Run

```sh
/usr/bin/python3 make_fixture.py ~/omp-bench/behavior-map/stats.db ~/omp-bench/behavior-map/truth.json
/usr/bin/python3 make_truth_complex.py ~/omp-bench/behavior-map/stats.db ~/omp-bench/complex/truth.json
cp check.mjs contract.mjs ~/omp-bench/behavior-map/validator/   # after `bun add puppeteer-core` there

# greenfield, one model
/usr/bin/python3 run.py <slug> <provider/model> <thinking> TASK.md ~/omp-bench/behavior-map/stats.db 60
/usr/bin/python3 collect.py <run_dir> <slug> && /usr/bin/python3 validate.py <run_dir> <truth.json> 600

# complex A/B: arms from schedule_complex.ARMS (base, new, solo, v3), N replicates
/usr/bin/python3 schedule_complex.py <runs_root> 2|3-5 base,new [terra,sol,...]   # BM_MAX_PARALLEL caps sandboxes
/usr/bin/python3 validate_complex.py <run_dir> ~/omp-bench/complex/truth.json 900 [--rescore]
/usr/bin/python3 compare_complex.py <runs_root> <out.json>
# replicates 3-5, all arms of one model/replicate at a time; reruns a group that hit a provider usage limit
systemd-inhibit --what=sleep:idle:handle-lid-switch /usr/bin/python3 drive_reps.py <runs_root> terra,sol 3-5 2 [base,v3]
# per-arm means, medians, bootstrap CI of arm/reference, exact Mann-Whitney p (runs_dir = symlinks to all runs)
/usr/bin/python3 stats_arms.py <compare.json> <runs_dir> [reference arm]
```

`run.py` environment: `BM_OMP_BIN` (binary under test), `BM_MODELS_PATCH=1` (DeepSeek stall deadlines),
`BM_EXTRA_ARGS` (extra omp flags). The task reaches omp on stdin, never argv.

Use `/usr/bin/python3` (needs PyYAML). Run homes copy `mcp.json` and provider keys from `~/.omp/agent`:
keep `~/omp-bench` private and out of any repository.
