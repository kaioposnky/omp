# Behavior map, round 2 (2026-11-24)

Binary: working tree with proposals 3-7 (prompt digest 4bd21e276ec79ce7), built separately; the installed binary is unchanged.
Before arm: round 1 in `../2026-11-24/`; a control build from HEAD reproduces its prompt digest (4cc554cb6473b7ee).
DeepSeek ran with `compat.streamIdleTimeoutMs` and `streamFirstEventTimeoutMs` = 120000 (proposal 2). Proposal 1 was not applied.
n = 1 per model and condition: differences are observations, not effects with known variance.

- sonnet: exit 143 with no final answer. The model ran `pkill -f start.sh`; omp's own argv holds the task text (passed with -p), which names `start.sh`, so the command killed the agent.
- deepseek: hit the 60 min `--max-time` again (exit 1), no final answer; the site was complete (9/9 API and page, animated WebGL).
- `cells_writing_files_by_heredoc` in aggregate.py also counts `python3 - <<'PY'` (a script on stdin, no file written). Split by kind, file heredocs went terra 4 -> 0, sol 6 -> 0, sonnet 0 -> 2; sol's 15 remaining are stdin scripts.
