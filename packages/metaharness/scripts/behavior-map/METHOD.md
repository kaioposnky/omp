# Behavior map: method

Written before any run finished. Weights marked "initial" may be revised after the
analyses come back; every revision is recorded in the report with its reason.

## Design

- Multiple-case study: 5 models, 1 run each, same task, same harness build (omp 19.1.0),
  Code Mode on, the user's real setup (global AGENTS.md, agents, skills, extensions, MCP config).
- One run per model means differences between models are observations, not estimates. No
  significance claims. A behavior is called a model trait only when it repeats inside the run
  (3+ occurrences) or matches the earlier A/B data in `code-mode-ab/results`.
- Code Mode has no control arm here. Its influence is assessed from failure modes that only
  exist in Code Mode (cell validation errors, bridge misuse, cell batching) and from the earlier A/B.

## Controls

- Same prompt (`TASK.md`), same synthetic database (fixed seed), same container limits
  (3 CPUs, 6 GB, 60 min), all runs started together.
- Every model role points at the measured model, so subagents never mix models.
- Each run has its own container, network, HOME and workspace. No run can read this
  repository, earlier sessions, stored logins, or another run.
- Known deviations from the user's real setup: no stored logins (agent.db), empty memory
  bank for the new directory, browser relay off (no user Chrome in the sandbox), local-only
  services unreachable (figma MCP, llm-wiki app, searxng).

## Evidence, in order of trust

1. Deterministic: `metrics.json` (tokens, requests, tool activity, errors) and
   `validation.json` (site started from `./start.sh` in a fresh sandbox, loaded in headless
   Chrome, numbers compared with the fixture's ground truth).
2. Blind qualitative coding: one analyst per run reads the transcript with model names
   removed and codes behaviors against the fixed codebook below, citing request numbers.
3. Orchestrator review: every analyst claim that changes a score is checked against (1).

## Outcome score (0–100)

| Criterion | Initial weight | Measured by |
|---|---|---|
| Site comes up from `./start.sh` on :4321 | 20 | validation: site_up |
| Backend is Rust and reads `data/stats.db` | 10 | workspace + API responses |
| Frontend is Astro + React | 10 | workspace |
| Numbers shown are correct | 20 | validation: truth scalars in API / on page |
| Charts present and rendered | 10 | validation: chart SVG / 2D canvas count + screenshot |
| 3D animation present and animating | 10 | validation: WebGL canvas, frame change |
| No runtime errors (console, failed requests) | 5 | validation |
| README and start script as asked | 5 | workspace |
| Code quality and maintainability | 10 | analyst, 0–4 scale |

## Efficiency (reported beside the score, never folded into it)

Total tokens, output tokens, requests, wall time, estimated cost, tokens per outcome point,
operations per wire call, share of requests that ended in a tool error.

## Behavior codebook

Each code is rated 0 (absent/bad) to 4 (consistently good), with evidence. "n/a" is allowed.

| Code | Good | Bad |
|---|---|---|
| B1 Orientation | Inspects the database and toolchain once, in few calls, before building | Builds blind, or keeps re-exploring |
| B2 Planning | Plan proportional to the task; todo list used and kept current | No plan on a multi-part task, or planning that outweighs the work |
| B3 Batching | Independent operations grouped in one cell / one turn | One operation per request; serial independent reads |
| B4 Tool fluency | Uses the bridge (`tool.write`, `tool.edit`, `sh`) as documented | Validation errors, wrong language, shell heredocs for files, repeated misuse |
| B5 Error recovery | Reads the error, changes approach, fixes cause | Retries unchanged, masks the symptom, loops |
| B6 Verification | Builds and runs the result, checks the real page, once | Declares done unverified, or re-verifies repeatedly |
| B7 Scope discipline | Delivers what was asked; no speculative extras | Gold-plating, unrequested features, or silently dropped requirements |
| B8 Delegation | Subagents only for real independent slices, full context passed | Fan-out for trivia, duplicated work, idle waiting |
| B9 Context economy | Bounded outputs, no re-reading, no dumping large files | Huge outputs pulled into context, repeated reads |
| B10 Prompt adherence | Follows the system prompt and AGENTS.md rules | Ignores or misreads them (cite which rule) |
| B11 Reporting honesty | Final message matches what was built and verified | Claims unverified or false results |
| B12 Skills/memory use | Loads a skill only when it fits; ignores irrelevant ones | Loads unrelated skills, or misses an obviously fitting one |

## Analyst output

Per run: codebook ratings with evidence, the 5 most costly behaviors (with an estimate of
wasted requests), the 5 most valuable behaviors, every place a system prompt or tool
instruction was misread or ignored (quoting the instruction), and concrete rule proposals.
