# Code Mode scope rule (2026-11-21)

Code arm + variants/s1-scope.md on the 6 models with out-of-scope rewrites (glm excluded), 2 reps x 4 tasks, sandboxed. Blind pairs vs the normal arm of results/v4-2026-11-21-quality (same model/task/rep).

| model | arm | whole-file writes | cli scope creep | mean changed lines | mean tokens | hidden probes |
|---|---|---|---|---|---|---|
| claude-haiku-5-5 | normal | 4/8 | 0/2 | 28 | 131.5k | 72/72 |
| claude-haiku-5-5 | code (shipped) | 8/8 | 1/2 | 27 | 60.5k | 72/72 |
| claude-haiku-5-5 | code + scope | 8/8 | 2/2 | 26 | 54.6k | 72/72 |
| claude-opus-5-5 | normal | 4/8 | 0/2 | 30 | 93.3k | 72/72 |
| claude-opus-5-5 | code (shipped) | 8/8 | 1/2 | 28 | 40.2k | 72/72 |
| claude-opus-5-5 | code + scope | 8/8 | 0/2 | 25 | 42.4k | 72/72 |
| claude-sonnet-5-5 | normal | 3/8 | 1/2 | 26 | 78.8k | 72/72 |
| claude-sonnet-5-5 | code (shipped) | 8/8 | 2/2 | 25 | 54.3k | 72/72 |
| claude-sonnet-5-5 | code + scope | 8/8 | 0/2 | 25 | 41.1k | 71/72 |
| deepseek-v4.1-flash | normal | 4/8 | 0/2 | 28 | 67.5k | 72/72 |
| deepseek-v4.1-flash | code (shipped) | 6/8 | 1/2 | 31 | 38.3k | 72/72 |
| deepseek-v4.1-flash | code + scope | 2/8 | 0/2 | 28 | 60.6k | 71/72 |
| gpt-6.1-terra | normal | 2/8 | 0/2 | 26 | 123.1k | 72/72 |
| gpt-6.1-terra | code (shipped) | 8/8 | 0/2 | 30 | 44.6k | 72/72 |
| gpt-6.1-terra | code + scope | 8/8 | 0/2 | 25 | 46.9k | 72/72 |
| gpt-6.2-sol | normal | 2/8 | 0/2 | 26 | 76.1k | 72/72 |
| gpt-6.2-sol | code (shipped) | 6/8 | 0/2 | 26 | 57.2k | 72/72 |
| gpt-6.2-sol | code + scope | 8/8 | 0/2 | 26 | 60.9k | 72/72 |

Tokens, code+scope vs shipped code (paired by task x rep):
  claude-haiku-5-5: -10% (p=0.187, n=8)
  claude-opus-5-5: +6% (p=0.552, n=8)
  claude-sonnet-5-5: -24% (p=0.010, n=8)
  deepseek-v4.1-flash: +58% (p=0.090, n=8)
  gpt-6.1-terra: +5% (p=0.575, n=8)
  gpt-6.2-sol: +6% (p=0.813, n=8)

### Per model (Δ = code+scope − normal, 1–5 scale)

| group | prefers code+scope | prefers normal | tie | sign-test p | Δcorrectness | Δminimality | Δclarity | Δrobustness | Δreport |
|---|---|---|---|---|---|---|---|---|---|
| claude-haiku-5-5 | 2 | 2 | 4 | 1.00 | +0.00 | +0.12 | +0.12 | +0.00 | +0.25 |
| claude-opus-5-5 | 3 | 0 | 5 | 0.25 | +0.00 | +0.75 | -0.25 | +0.00 | -0.25 |
| claude-sonnet-5-5 | 3 | 2 | 3 | 1.00 | +0.00 | +0.38 | +0.25 | -0.12 | +0.25 |
| deepseek-v4.1-flash | 2 | 3 | 3 | 1.00 | +0.00 | +0.25 | +0.00 | +0.00 | -1.12 |
| gpt-6.1-terra | 2 | 0 | 6 | 0.50 | +0.00 | +0.12 | +0.38 | +0.00 | +0.38 |
| gpt-6.2-sol | 0 | 0 | 8 | 1.00 | +0.00 | +0.00 | +0.12 | +0.00 | -0.12 |

### Per family

| group | prefers code+scope | prefers normal | tie | sign-test p | Δcorrectness | Δminimality | Δclarity | Δrobustness | Δreport |
|---|---|---|---|---|---|---|---|---|---|
| anthropic | 8 | 4 | 12 | 0.39 | +0.00 | +0.42 | +0.04 | -0.04 | +0.08 |
| open-weights | 2 | 3 | 3 | 1.00 | +0.00 | +0.25 | +0.00 | +0.00 | -1.12 |
| openai | 2 | 0 | 14 | 0.50 | +0.00 | +0.06 | +0.25 | +0.00 | +0.12 |

Overall: code 12, normal 7, tie 29, sign-test p=0.359; reviewed 48/48; missing []

Defect notes where the losing side is code+scope:
- s001 claude-haiku-5-5 cli r1: A's catch-all `else { throw new Error(`Unknown flag: ${argument}`) }` now rejects non-dash positionals that were previously ignored, which its report does not mention; B keeps the original `argument.startsWith("-")` guar
- s002 claude-haiku-5-5 cli r2: A keeps the `else if (argument.startsWith("-"))` guard and adds an isSafeInteger check; B's bare `else { throw ... Unknown flag }` changes existing behavior for positional args (disclosed but unrequested) and skips the s
- s017 claude-sonnet-5-5 cli r1: A checks the missing value, the digits-only rule and the >=1 bound in separate steps, with a specific `--limit requires a value` message; B packs all four checks into one long condition that calls Number(value) twice and
- s022 claude-sonnet-5-5 pricing r2: B's currencySymbol uses `const symbol = SYMBOLS[code]; if (symbol === undefined) throw`, so prototype keys such as 'toString' or 'constructor' resolve to inherited functions and get formatted instead of throwing; A's Obj
- s028 deepseek-v4.1-flash parser r2: The code is equivalent (A uses `return node` inside the loop with slice-based tokenizing; B uses for(;;)/break with string accumulation), but B's report contains a stray self-correction ('`{number 12}`? No —'), while A's
- s030 deepseek-v4.1-flash pricing r2: A's `symbol === undefined` check lets prototype keys like "toString" return a function instead of throwing, and it leaves the now-false `// TODO: ...not honoured yet` comment in receipt.ts; B's `typeof symbol !== "string
- s032 deepseek-v4.1-flash refactor r2: The diffs are identical, but B's report has a mid-sentence self-correction ('now-unneeded... actually') and unrelated harness-incident and trailing-newline notes, while A's report is concise and accurate.
