# Code Mode on the real repository (2026-11-21)

Normal vs Code Mode (`codeMode.default: true`, family-adapted prompt) on oh-my-pi itself.
7 models x 4 tasks x 2 reps x 2 arms = 112 runs. Each run: fresh `git worktree` of HEAD,
CLI under `bwrap` with a private `/tmp`, `node_modules` symlinked from the main checkout.

Tasks (`tasks.json`), all in `packages/utils`:

- `bytes` — `formatBytes`: pick the unit after rounding (no `1024KB`), drop trailing `.0`, add TB, negative/non-finite → `0B`.
- `age` — `formatAge`: `just now` for 0, negative or non-finite; `""` for null/undefined.
- `lru` — `LRUCache.oldestKeys()`, least- to most-recently used, without touching recency.
- `truncate` — result never longer than `maxLen`; negative or non-finite `maxLen` → `""`.

`check.ts` is the hidden checker: edge-case probes, `bun test` in `packages/utils`, and edits outside
the task's file list. Pristine HEAD scores bytes 6/16, age 10/12, lru 1/9, truncate 10/17.

| Model | Pairs | Tokens normal→code (median) | Δ tokens (median per pair) | Requests normal→code (median) | Hidden checks normal / code |
|---|---|---|---|---|---|
| claude-haiku-5-5 | 8 | 145k → 78k | −56% | 7 → 5.5 | 108/108 / 108/108 |
| claude-opus-5-5 | 8 | 124k → 59k | −52% | 6 → 4.5 | 108/108 / 108/108 |
| claude-sonnet-5-5 | 8 | 97k → 102k | −32% | 5 → 7.5 | 108/108 / 108/108 |
| deepseek-v4.1-flash | 6 | 260k → 137k | −59% | 15.5 → 12 | 106/108 / 98/108 |
| glm-5.3-flash | 8 | 223k → 232k | +3% | 15.5 → 16.5 | 108/108 / 108/108 |
| gpt-6.1-terra | 8 | 128k → 63k | −56% | 11 → 7 | 108/108 / 108/108 |
| gpt-6.2-sol | 8 | 97k → 59k | −47% | 7.5 → 6.5 | 108/108 / 108/108 |

Code Mode is cheaper in 44/54 complete pairs. The Sonnet medians cross because the per-pair
deltas are skewed; GLM shows no saving, matching the earlier synthetic rounds.

## Findings beyond tokens

- **Cross-package follow-through on `bytes`.** Dropping `.0` breaks string assertions in other
  packages. Every run updated `packages/utils/test/ar/tar.test.ts` (flagged by the checker's
  "outside" list, but correct). `packages/coding-agent` tests expecting `50.0KB limit` were
  updated in 5/14 normal runs and 0/14 Code Mode runs. The hidden check runs only `packages/utils`,
  so it does not see this gap; normal mode followed the change further in this task.
- **DeepSeek.** One Code Mode `bytes` run made no fix (6/16); one normal `age` run missed `0`/`NaN`
  (10/12). Two normal runs ended with `Request was aborted` and are excluded from pairs.
- **Terra.** Four runs (2 normal, 2 code) hit the `Thinking loop detected` abort; all still passed
  their hidden checks.
- **New tests.** Every `age` run with a full score added `packages/utils/test/format-age.test.ts`
  (untracked), in both arms.

Reproduce: `bun run.ts <model:thinking> normal,code bytes,age,lru,truncate 2 <outDir>`, then
concatenate `<outDir>/runs.jsonl` here and run `python3 analyze.py`.
