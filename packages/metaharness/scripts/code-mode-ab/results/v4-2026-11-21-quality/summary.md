# Code Mode quality check (2026-11-21)

112 sandboxed runs (7 models x 4 tasks x 2 reps x 2 arms), shipped harness. Hidden probes: hidden-probes.ts. Blind pairwise review by 4 Opus reviewers (blind-review.jsonl, unblinded with blind-key.json).

### Per model (Δ = code − normal, 1–5 scale)

| group | prefers code | prefers normal | tie | sign-test p | Δcorrectness | Δminimality | Δclarity | Δrobustness | Δreport |
|---|---|---|---|---|---|---|---|---|---|
| claude-haiku-5-5 | 1 | 2 | 5 | 1.00 | -0.12 | +0.00 | +0.00 | -0.12 | -0.25 |
| claude-opus-5-5 | 1 | 1 | 6 | 1.00 | -0.12 | -0.12 | +0.25 | -0.12 | -0.12 |
| claude-sonnet-5-5 | 1 | 2 | 5 | 1.00 | -0.12 | -0.12 | +0.25 | -0.12 | +0.12 |
| deepseek-v4.1-flash | 2 | 2 | 4 | 1.00 | +0.25 | -0.62 | +0.00 | +0.25 | -0.50 |
| glm-5.3-flash | 0 | 3 | 5 | 0.25 | -0.12 | -0.12 | +0.00 | -0.12 | -0.12 |
| gpt-6.1-terra | 1 | 1 | 6 | 1.00 | +0.00 | -0.25 | +0.12 | +0.00 | -0.50 |
| gpt-6.2-sol | 0 | 2 | 6 | 0.50 | -0.25 | -0.50 | +0.12 | -0.50 | -0.38 |

### Per family

| group | prefers code | prefers normal | tie | sign-test p | Δcorrectness | Δminimality | Δclarity | Δrobustness | Δreport |
|---|---|---|---|---|---|---|---|---|---|
| anthropic | 3 | 5 | 16 | 0.73 | -0.12 | -0.08 | +0.17 | -0.12 | -0.08 |
| open-weights | 2 | 5 | 9 | 0.45 | +0.06 | -0.38 | +0.00 | +0.06 | -0.31 |
| openai | 1 | 3 | 12 | 0.62 | -0.12 | -0.38 | +0.12 | -0.25 | -0.44 |

Overall: code 6, normal 13, tie 37, sign-test p=0.167; reviewed 56/56; missing []

Defect notes where the losing side is code:
- p001 claude-haiku-5-5 cli r1: A's new final `else { throw new Error(`Unknown flag: ${argument}`) }` now rejects plain positional args with a mislabeled 'Unknown flag' error (previously ignored) and lacks a safe-integer bound, while B keeps the `argum
- p002 claude-haiku-5-5 cli r2: B's bare `else { throw new Error(`Unknown flag: ${argument}`) }` turns previously ignored positional args into mislabeled 'Unknown flag' errors and `/^[1-9]\d*$/` has no safe-integer bound, whereas A keeps the `startsWit
- p010 claude-opus-5-5 cli r2: Both add an unrequested try/catch with `process.exit(2)`, but B also adds `throw new Error(`Unexpected argument: ${argument}`)` for previously ignored positional args, which is extra behavior change; A's report claims ex
- p017 claude-sonnet-5-5 cli r1: A keeps the original `else if (argument.startsWith("-"))` so positional args remain ignored as before, while B's bare `else { throw new Error(`Unknown flag: ${argument}`) }` changes behavior and mislabels positionals as 
- p019 claude-sonnet-5-5 parser r1: Code is semantically identical (loop folding with parsePrimary/parseProduct, same tokenizer slice), but A's report wrongly claims the old right-recursive code 'left trailing tokens unconsumed', while B's explanation (10 
- p026 deepseek-v4.1-flash cli r2: Both validate `--limit` with `/^\d+$/` + isSafeInteger, but A adds unrequested try/catch + process.exit in cli.ts and changes positional args to throw ('Unknown flag: jobs'), while B is a tight, behavior-preserving chang
- p030 deepseek-v4.1-flash pricing r2: A rewrote the SYMBOLS Record into a Map (unrelated restructure) and its final message is verbose and truncated mid-sentence ('Nothing under `'), while B's minimal `typeof symbol !== "string"` guard also rejects prototype
- p033 glm-5.3-flash cli r1: A validates --limit with Number()+Number.isInteger, which accepts '0x10', '1e2' and ' 5', whereas B's `/^\d+$/.test(value)` check rejects non-decimal forms; the cli.ts change is identical.
- p036 glm-5.3-flash parser r2: Same algorithm, but A crams peek/condition into very long `for (let token = peek(); token?.kind === ...; token = peek())` headers and its report calls them 'while' loops and claims a precedence bug, whereas B's for(;;)+b
- p039 glm-5.3-flash refactor r1: B's edits strip the trailing newline from products.ts and users.ts ('\ No newline at end of file') and its report describes a mid-run file corruption, while A's diff is clean.
- p041 gpt-6.1-terra cli r1: Parser code is equivalent, but B adds an unrequested 37-line src/cli.test.ts that spawns subprocesses and is placed outside test/ to sidestep the constraint, and its report glosses over that addition.
- p053 gpt-6.2-sol pricing r1: B deletes receipt.ts's `if (currency.length === 0) throw new Error("missing currency")` guard, so an empty currency now throws 'Unsupported currency: ' instead of 'missing currency', an unrequested behavior change that i
- p054 gpt-6.2-sol pricing r2: A deletes receipt.ts's `missing currency` guard for an empty currency, changing that error path without saying so, while B keeps the guard and only forwards currency to formatMoney.
