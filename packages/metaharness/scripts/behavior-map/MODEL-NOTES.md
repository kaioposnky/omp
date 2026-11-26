# Per-model notes for omp prompts

What each model does in omp's Code Mode, what a harness change did to it, and which
instructions are candidates for that model only. The goal is to keep these notes ready for
per-model prompt or rule work without one model's fix hurting another.

Sources: round 1 (`results/2026-11-24/`, blind analyst reports A-E), round 2 with proposals 3-7
(`results/2026-11-24-v2/`), and the complex-task A/B (`results/2026-11-24-complex/`).
Single runs per condition in rounds 1-2: a behavior is called a trait only when it repeats inside a
run (3+ times) or across rounds.

## Changes and who they helped (rounds 1 -> 2, same greenfield task)

| Change | terra | sol | sonnet | opus | deepseek |
|---|---|---|---|---|---|
| 3. `eval` with no `language` reuses the previous cell's | n/a | n/a | n/a | n/a | 7 validation errors -> 0 |
| 4. file bodies via `write`/`tool.edit`, no heredoc | 4 file heredocs -> 0; `write` 2 -> 12 | 6 -> 0; `write` 0 -> 19 | 0 -> 2 (`cat > Cargo.toml <<EOF`) | 0 -> 0 | 0 -> 0 |
| 5. skill-search example is a placeholder | copied `static%20page` -> task words | copied -> task words | no search | no search | no search |
| 6. timeout default and unit stated | 4 cells with ms timeouts -> 0 | 0 -> 0 | 0 -> 0 | 1 cell timeout -> 1 | 1 -> 1 |
| 7. stop or report a verification server | already reported it | idle 606 s after answer, server alive -> 5 s | reported -> killed itself (see traps) | reported -> reported | n/a (no final answer) |
| 2. 120 s stall deadlines (DeepSeek route) | | | | | longest wait 905 s -> 209 s; lost to failed requests 1330 s -> 883 s |

No change measurably hurt a model on its own target behavior. Totals moved in both directions
(terra 627 -> 195 s, opus 1.77M -> 1.15M tokens, sol 0.50M -> 1.19M, sonnet 0.48M -> 0.82M) with n = 1,
which is why the complex A/B below exists.

## Complex task A/B (existing repo: 4 planted bugs, 3 features, tests, commits)

`TASK-complex.md`, seed repo with planted bugs, hidden contract (`validate_complex.py` + `contract.mjs`,
max 98 points). Base = HEAD build, new = proposals 3-7; 2 runs per model and arm, both arms started
together. DeepSeek ran `deepseek-v4.1-flash-fast`. Means of 2 runs; per-run values in `results/2026-11-24-complex/compare.json`.

| Model | Points base / new | Tokens base -> new | Active s base -> new | Friction base -> new (per run) |
|---|---|---|---|---|
| terra | 98, 98 / 98, 98 | 1.11M -> 1.25M | 566 -> 288 | ms timeouts 13, 7 -> 0, 0; file heredocs 2, 2 -> 0, 0; todo-only turns 6, 4 -> 0, 0 |
| sol | 98, 98 / 98, 98 | 1.36M -> 1.03M | 505 -> 433 | file heredocs 1, 2 -> 0, 0; copied `static%20page` 1 -> 0 |
| sonnet | 98, 98 / 98, 98 | 1.17M -> 1.19M | 306 -> 348 | `language` errors 1, 1 -> 0, 0; cell timeouts 1, 1 -> 0, 1 |
| opus | 98, 98 / 98, 98 | 1.85M -> 2.20M | 672 -> 905 | cell timeouts 1, 1 -> 0, 0 |
| deepseek | 98, 98 / 3, 98 | 4.04M -> 2.87M (r2 only) | 2585 -> 2779 (r2 only) | `language` errors 2, 2 -> 0, 0; ms timeouts 2, 0 -> 0, 0 |

- Every complete run reached the maximum, so this task measures friction and cost, not quality.
- deepseek-new-r1 scored 3: the provider reset the stream (ECONNRESET) while the model was emitting a
  file-sized `eval` call after it had already shown text. `isRetryableError` refuses to replay a turn
  with committed text, and `handleCommittedTextStreamStall` refuses turns with tool calls, so the
  session ended. The code path is identical in both arms; this is a harness recovery gap, not a proposal effect.
- Within-arm spread is large (sonnet new: 1.51M and 0.86M tokens). Token and time differences under
  about 25% are inside that spread. terra's shorter wall time is consistent across both runs, but its model
  time did not drop (454/512 s base, 496/457 s new); the new runs used 4 subagents instead of 3.
- No proposal removed a behavior from one model and caused it in another.

## Where the tokens go (complex task, 20 runs)

Input tokens are almost all of the total (output is 1-5%), and each request re-sends the whole context, so
cutting requests cuts tokens. Main-agent breakdown:

| Source | Share | Note |
|---|---|---|
| Fixed prefix (system prompt + 3 tool schemas, 9-15k) re-sent per request | 15-51% of main input | biggest for terra (short runs, small context) |
| Re-reads after the 4 KB cell cap cut output | ~12% of main input (137 of 787 requests) | mostly `sed -n`/`grep` follow-ups; 28 cut results were whole-file dumps |
| `wait` returning after 5 s with subagents still running | terra: 4-7 requests, 60-115k per run | fixed in round 3 (subagent waits skip the floor) |
| `todo`-only turns | terra base 4-6, sol 1-6 per run | already cut by proposals 3-7 for terra |

## Subagents: worth it or spam?

- Only terra and sol delegated (catalog delegation tier `restrained` for GPT-6); Claude and DeepSeek never did.
- terra: 3 subagents (backend, frontend, README) ran in parallel, ~166-172 s saved of a ~290 s run, and
  45-59% of all tokens; half of each subagent's input was re-reading its own fixed prompt. The README
  subagent was a sub-30-line single-file job the restrained tier says to do inline.
- sol: 1 frontend subagent (14% of tokens), but sol worked on the backend meanwhile, so no wall time was
  spent waiting; its gain is focus, not speed.
- A/B without the `task` tool (`solo` arm, 2 runs each, same score 98):

| Model | Arm | Tokens | Requests | Model s | Active s |
|---|---|---|---|---|---|
| terra | with subagents | 1.25M | 76 | 477 | 288 |
| terra | solo | 1.20M | 65 | 422 | 322 |
| sol | with subagents | 1.03M | 40 | 567 | 433 |
| sol | solo | 1.36M | 42 | 620 | 567 |

  Verdict: subagents were not spam. For terra they trade ~4% more tokens for ~10% less wall time; for sol
  they lowered both. Disabling them would not cut cost. The waste was the polling around them, now fixed.

## Round 4: V4 ablation of the eval cell-workflow text (not shipped)

Arms built from the v3 tree with only `prompts/tools/eval.md` changed; prompt text confirmed in the 9router request log.
- `v4a`: drops "Print what you will act on (`grep -n` hits, a function, a line range), not whole files or full build logs"; keeps "read the needed range of that log".
- `v4b`: v4a plus the round-1 discovery step ("a single `tool.bash` that lists the files, prints every relevant source …").

All arms of one replicate ran together. Means; ratio to v3 with bootstrap 95% CI.

| Model | n per arm | Tokens v3 / v4a / v4b | v4a/v3 | v4b/v3 | Points below 98 |
|---|---|---|---|---|---|
| terra | 5 | 1.20M / 1.15M / 1.04M | 0.96 [0.73, 1.25] | 0.86 [0.66, 1.12] | v4a-r4 93.4, v4b-r4 92.8 |
| sol | 3 (v3, v4a) | 1.22M / 1.10M / - | 0.90 [0.68, 1.20] | - | none |
| deepseek | 5 | 4.17M / 4.35M / 3.79M | 1.04 [0.91, 1.20] | 0.91 [0.72, 1.13] | none |

- Pooled within-model permutation test: v4a tokens 0.97x (p = 0.67), v4b tokens 0.88x over terra and DeepSeek (p = 0.22). Neither beats v3.
- The two sub-98 runs both missed the session timestamp contract: v4a took `first_ts`/`last_ts` from user messages too, v4b named the fields `start`/`end`. These are the only session-field misses in 92 scored runs besides one crashed run, so they are a weak warning, not proof.
- Removing the line does not restore terra's base token level (0.91M). terra's extra spend stays in the main agent while subagents run.
- Decision: keep v3's eval.md. A further token cut needs a mechanism, not prompt wording.
- Pitfalls hit: Codex usage limit (30 min reset) killed a whole replicate; a lid-close suspend froze DeepSeek r3 for 7.7 h. `systemd-inhibit --what=sleep` does not stop lid suspend; add `handle-lid-switch`.

## Round 3 (v3 build): retry fix, subagent wait floor, model rules, eval output hint

Same complex task, 2 runs per model; means. All 10 runs gave a final answer; 9 scored 98, sol-v3-r1 95
(it edited `tests.rs` after its last commit and left it uncommitted).

| Model | Tokens base / new / v3 | Requests base / new / v3 | Active s base / new / v3 | Cost base / new / v3 |
|---|---|---|---|---|
| terra | 1.11M / 1.25M / 1.29M | 65 / 76 / 67 | 566 / 288 / 260 | $0.37 / $0.42 / $0.37 |
| sol | 1.36M / 1.03M / 1.58M | 53 / 40 / 66 | 505 / 433 / 540 | $1.31 / $0.91 / $1.56 |
| sonnet | 1.17M / 1.19M / 1.06M | 27 / 28 / 27 | 306 / 348 / 336 | $2.60 / $2.69 / $2.40 |
| opus | 1.85M / 2.20M / 1.73M | 38 / 43 / 36 | 672 / 905 / 626 | $8.38 / $9.91 / $7.81 |
| deepseek | 4.04M / 1.85M* / 3.56M | 80 / 53* / 73 | 2585 / 1786* / 881 | - |

\* one of the two `new` DeepSeek runs died at 13 min on the ECONNRESET the retry fix now handles.

- terra: wait-only requests 4-7 -> 2-4 per run; the remaining ones block until a subagent finishes.
- DeepSeek: same score in a third of base's time; both runs finished well inside 60 min (the
  verification-budget model rule). No stream reset happened in v3, so the retry fix was not exercised
  live; it is covered by unit tests.
- sol's v3 rise is its own choice to spawn 2 subagents (as base-r2 did: 1.56M), not a harness effect.
- Variance stays high: same model, same arm, up to 1.6x apart. Differences under ~25% are noise at n = 2.

## Per model

### terra (gpt-6.1-terra)
- Works as a lean coordinator: two orientation cells, a precise API contract, backend and frontend
  subagents in parallel. Cheapest run in both rounds.
- Trait: takes the literal path of least effort. CSS bars and a CSS sphere were called "charts" and
  "3D" in both rounds; one-line `global.css` and 250+ char JSX lines in both rounds.
- Trait: copies prompt examples verbatim (`static%20page`) and guesses units (ms timeouts). Both went
  away once the prompt stated them; terra responds well to concrete, literal instructions.
- Calls `wait` and gets nothing back (4 wait-only requests in both rounds).
- Candidate terra-only rule: "Write source a maintainer can read: one JSX element or CSS rule per line.
  Name what you built honestly: CSS shapes are not 3D, styled divs are not charts."

### sol (gpt-6.2-sol)
- Fast, batches large cells, delegates a well-specified backend subagent, verifies end to end.
- Trait: shells out for everything. After proposal 4 it stopped writing files by heredoc, but still ran
  15 `python3 - <<'PY'` scripts per run, which are fine.
- Trait: sends `todo` alone in a turn despite the rule (2 -> 4 requests). Text did not fix it; an
  enforcement in the harness would.
- Left its server running and idled 606 s in round 1; proposal 7 fixed that (5 s).
- Candidate sol-only rule: none needed beyond the shared changes; consider harness enforcement of
  todo-only turns.

### sonnet (claude-sonnet-5-5)
- Most direct: fewest requests, no subagents, checks the API with curl before the frontend, real WebGL.
- Trait: pins hand-picked latest versions without checking peer dependencies (npm install failed once).
- Trap seen in round 2: ran `pkill -f start.sh` to stop its server; the task text (which names
  `start.sh`) was on omp's own command line, so it killed the agent. The benchmark now passes the task on
  stdin; real users who pass a prompt as an argument are exposed to the same thing.
- Gets no prompt cache on the 9router chat-completions path as omp sees it (cache_read 0), although the
  provider did cache 658k of the 720k prompt tokens for that run (see proposal 1 below).
- Candidate sonnet-only rule: "Kill processes by PID or port (`fuser -k 4321/tcp`), never `pkill -f`
  with a word from the task."

### opus (claude-opus-5-5)
- Best data-semantics checking (verified cost columns, error rows, latency exclusions) and real browser
  verification that finds real bugs. One-process architecture.
- Trait: reads dependency source to confirm APIs (5 cells round 1, 1 round 2).
- Trait: hits the 30 s cell deadline on long write+build cells (1 per round). The unit and default are
  now stated; it still happened once.
- Most expensive per run; the cache issue below makes it look 5x worse than it is.
- Candidate opus-only rule: "Confirm a library API by compiling your use of it; read dependency source
  only after a build error points there."

### deepseek (deepseek-v4.1-flash)
- Thorough builder: complete site, 9/9 numbers, animated WebGL in both rounds.
- Trait: never stops polishing. After the site was verified, it walked every section on desktop, then
  mobile, then again, and hit the 60 min limit without a final answer in both rounds.
- Trait: omitted `language` 7 times in round 1; proposal 3 removed the error class.
- Provider: ECONNRESET on long generations (6 and 8 per run). The 120 s deadlines bound the wait but
  cannot prevent resets.
- Candidate deepseek-only rule: "Verification budget: one browser pass per requirement; after it passes,
  write the final answer. Do not polish beyond the request."

## Proposal 1 (prompt cache for Claude routes) - root cause

The 429 is not about request shape. In 9router's request log, every successful `claude` request
from the chat-completions path is rewritten by 9router into a Claude Code request: its system blocks
start with `x-anthropic-billing-header: ...` and "You are Claude Code, Anthropic's official CLI for
Claude.". All 29 requests omp sent through `/v1/messages` reached the provider without those blocks and
all 29 got `rate_limit_error`. So the subscription accepts only Claude Code-shaped traffic, and 9router
adds that shape only on its OpenAI-compatible path. Making omp's native path work would mean making
omp's requests impersonate Claude Code, which is out of bounds.

The cache itself already works: on the chat-completions path the provider reported 658k cache-read
tokens for sonnet's round-2 run and 3.2M for opus's, while omp recorded 0. 9router's OpenAI-format usage
chunk reports only `prompt_tokens`/`completion_tokens` and drops the cache fields, so omp's cost and
cache numbers for `cc/` models are wrong, not the caching. The fix belongs in 9router (emit
`prompt_tokens_details.cached_tokens` in the usage chunk), not in omp's config.
