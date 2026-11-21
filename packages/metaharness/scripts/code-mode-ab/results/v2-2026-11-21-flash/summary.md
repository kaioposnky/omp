# Code Mode A/B — full run

- Generated: 2026-11-21T13:06:05.112Z
- Reps per arm: 3; tasks: pricing, parser, cli, refactor
- Budget: $5.00000 (spent $0.00000)
- Spent on 9router/cmc/deepseek/deepseek-v4.1-flash: $0.00000
- Spent on 9router/cmc/z-ai/glm-5.3-flash: $0.00000
- Pricing: models.dev snapshot 2026-11-20, USD per 1M tokens, per-request long-context tiers

## Per model and arm

| model | arm | n | success | mean input | mean output | cache read | cache write | mean tokens | mean cost | mean wall s | mean requests | mean tool calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 9router/cmc/deepseek/deepseek-v4.1-flash | normal | 12 | 100% | 10,656.17 | 2,929.58 | 66,325.33 | 0 | 79,911.08 | $0.00000 | 39.6 | 7.33 | 14.17 |
| 9router/cmc/deepseek/deepseek-v4.1-flash | code | 12 | 100% | 11,260.83 | 3,709.92 | 57,909.33 | 0 | 72,880.08 | $0.00000 | 41.2 | 9.42 | 8.42 |
| 9router/cmc/z-ai/glm-5.3-flash | normal | 12 | 100% | 11,344.17 | 3,103 | 66,560 | 0 | 81,007.17 | $0.00000 | 22.3 | 8.17 | 14.67 |
| 9router/cmc/z-ai/glm-5.3-flash | code | 12 | 100% | 16,641.08 | 4,496.75 | 79,818.67 | 0 | 100,956.5 | $0.00000 | 33.0 | 12.83 | 13.83 |

## Paired tests (code − normal, paired by task×rep)

### 9router/cmc/deepseek/deepseek-v4.1-flash

- cost USD: n=12, mean diff=0.00000, t(11)=0.00, p=1.0000, 95% CI [0.0000, 0.0000]
- total tokens: n=12, mean diff=-7031.00000, t(11)=-0.39, p=0.7055, 95% CI [-46926.4725, 32864.4725]
- cost lower: false; success >= normal: true; cost CI excludes 0: false; tokens CI excludes 0: false

### 9router/cmc/z-ai/glm-5.3-flash

- cost USD: n=12, mean diff=0.00000, t(11)=0.00, p=1.0000, 95% CI [0.0000, 0.0000]
- total tokens: n=12, mean diff=19949.33333, t(11)=1.47, p=0.1700, 95% CI [-9953.7582, 49852.4249]
- cost lower: false; success >= normal: true; cost CI excludes 0: false; tokens CI excludes 0: false

## Decision rule

`codeMode.default: true` only if cost is lower and success is not worse in at least two models (one Anthropic, one OpenAI/Codex), with the paired cost CI excluding 0.

- Qualifying models: none
- Anthropic qualifier: false; OpenAI/Codex qualifier: false
- Verdict: `default: true` NOT supported by this data

## Runs

| run | arm | task | rep | ok | reason | requests | tokens | cost | wall s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 9router-cmc-deepseek-deepseek-v4-1-flash-normal-pricing-r1 | normal | pricing | 1 | yes |  | 7 | 66417 | $0.00000 | 30.5 |
| 9router-cmc-deepseek-deepseek-v4-1-flash-code-pricing-r1 | code | pricing | 1 | yes |  | 10 | 77359 | $0.00000 | 57.1 |
| 9router-cmc-deepseek-deepseek-v4-1-flash-code-pricing-r2 | code | pricing | 2 | yes |  | 7 | 53830 | $0.00000 | 31.7 |
| 9router-cmc-deepseek-deepseek-v4-1-flash-normal-pricing-r2 | normal | pricing | 2 | yes |  | 6 | 60314 | $0.00000 | 23.8 |
| 9router-cmc-deepseek-deepseek-v4-1-flash-normal-pricing-r3 | normal | pricing | 3 | yes |  | 5 | 50182 | $0.00000 | 29.8 |
| 9router-cmc-deepseek-deepseek-v4-1-flash-code-pricing-r3 | code | pricing | 3 | yes |  | 9 | 69100 | $0.00000 | 33.1 |
| 9router-cmc-deepseek-deepseek-v4-1-flash-code-parser-r1 | code | parser | 1 | yes |  | 10 | 87431 | $0.00000 | 46.5 |
| 9router-cmc-deepseek-deepseek-v4-1-flash-normal-parser-r1 | normal | parser | 1 | yes |  | 6 | 56835 | $0.00000 | 21.6 |
| 9router-cmc-deepseek-deepseek-v4-1-flash-normal-parser-r2 | normal | parser | 2 | yes |  | 6 | 57764 | $0.00000 | 38.5 |
| 9router-cmc-deepseek-deepseek-v4-1-flash-code-parser-r2 | code | parser | 2 | yes |  | 8 | 55882 | $0.00000 | 34.5 |
| 9router-cmc-deepseek-deepseek-v4-1-flash-code-parser-r3 | code | parser | 3 | yes |  | 15 | 135165 | $0.00000 | 61.1 |
| 9router-cmc-deepseek-deepseek-v4-1-flash-normal-parser-r3 | normal | parser | 3 | yes |  | 8 | 88176 | $0.00000 | 41.1 |
| 9router-cmc-deepseek-deepseek-v4-1-flash-normal-cli-r1 | normal | cli | 1 | yes |  | 18 | 266284 | $0.00000 | 166.3 |
| 9router-cmc-deepseek-deepseek-v4-1-flash-code-cli-r1 | code | cli | 1 | yes |  | 10 | 74780 | $0.00000 | 51.1 |
| 9router-cmc-deepseek-deepseek-v4-1-flash-code-cli-r2 | code | cli | 2 | yes |  | 7 | 42877 | $0.00000 | 36.9 |
| 9router-cmc-deepseek-deepseek-v4-1-flash-normal-cli-r2 | normal | cli | 2 | yes |  | 5 | 47088 | $0.00000 | 20.9 |
| 9router-cmc-deepseek-deepseek-v4-1-flash-normal-cli-r3 | normal | cli | 3 | yes |  | 7 | 71522 | $0.00000 | 30.0 |
| 9router-cmc-deepseek-deepseek-v4-1-flash-code-cli-r3 | code | cli | 3 | yes |  | 12 | 102868 | $0.00000 | 41.3 |
| 9router-cmc-deepseek-deepseek-v4-1-flash-code-refactor-r1 | code | refactor | 1 | yes |  | 5 | 27031 | $0.00000 | 17.6 |
| 9router-cmc-deepseek-deepseek-v4-1-flash-normal-refactor-r1 | normal | refactor | 1 | yes |  | 7 | 72311 | $0.00000 | 30.3 |
| 9router-cmc-deepseek-deepseek-v4-1-flash-normal-refactor-r2 | normal | refactor | 2 | yes |  | 7 | 65156 | $0.00000 | 22.8 |
| 9router-cmc-deepseek-deepseek-v4-1-flash-code-refactor-r2 | code | refactor | 2 | yes |  | 9 | 67588 | $0.00000 | 32.3 |
| 9router-cmc-deepseek-deepseek-v4-1-flash-code-refactor-r3 | code | refactor | 3 | yes |  | 11 | 80650 | $0.00000 | 51.4 |
| 9router-cmc-deepseek-deepseek-v4-1-flash-normal-refactor-r3 | normal | refactor | 3 | yes |  | 6 | 56884 | $0.00000 | 19.9 |
| 9router-cmc-z-ai-glm-5-3-flash-normal-pricing-r1 | normal | pricing | 1 | yes |  | 10 | 102627 | $0.00000 | 26.3 |
| 9router-cmc-z-ai-glm-5-3-flash-code-pricing-r1 | code | pricing | 1 | yes |  | 18 | 176544 | $0.00000 | 60.9 |
| 9router-cmc-z-ai-glm-5-3-flash-code-pricing-r2 | code | pricing | 2 | yes |  | 9 | 81909 | $0.00000 | 41.0 |
| 9router-cmc-z-ai-glm-5-3-flash-normal-pricing-r2 | normal | pricing | 2 | yes |  | 8 | 99816 | $0.00000 | 44.0 |
| 9router-cmc-z-ai-glm-5-3-flash-normal-pricing-r3 | normal | pricing | 3 | yes |  | 8 | 80283 | $0.00000 | 20.2 |
| 9router-cmc-z-ai-glm-5-3-flash-code-pricing-r3 | code | pricing | 3 | yes |  | 18 | 144007 | $0.00000 | 40.6 |
| 9router-cmc-z-ai-glm-5-3-flash-code-parser-r1 | code | parser | 1 | yes |  | 14 | 99287 | $0.00000 | 25.3 |
| 9router-cmc-z-ai-glm-5-3-flash-normal-parser-r1 | normal | parser | 1 | yes |  | 7 | 65052 | $0.00000 | 15.6 |
| 9router-cmc-z-ai-glm-5-3-flash-normal-parser-r2 | normal | parser | 2 | yes |  | 8 | 83006 | $0.00000 | 20.1 |
| 9router-cmc-z-ai-glm-5-3-flash-code-parser-r2 | code | parser | 2 | yes |  | 22 | 199244 | $0.00000 | 44.1 |
| 9router-cmc-z-ai-glm-5-3-flash-code-parser-r3 | code | parser | 3 | yes |  | 10 | 80466 | $0.00000 | 28.1 |
| 9router-cmc-z-ai-glm-5-3-flash-normal-parser-r3 | normal | parser | 3 | yes |  | 7 | 69625 | $0.00000 | 19.9 |
| 9router-cmc-z-ai-glm-5-3-flash-normal-cli-r1 | normal | cli | 1 | yes |  | 7 | 74737 | $0.00000 | 26.8 |
| 9router-cmc-z-ai-glm-5-3-flash-code-cli-r1 | code | cli | 1 | yes |  | 11 | 83760 | $0.00000 | 25.4 |
| 9router-cmc-z-ai-glm-5-3-flash-code-cli-r2 | code | cli | 2 | yes |  | 9 | 63541 | $0.00000 | 29.0 |
| 9router-cmc-z-ai-glm-5-3-flash-normal-cli-r2 | normal | cli | 2 | yes |  | 10 | 94572 | $0.00000 | 25.0 |
| 9router-cmc-z-ai-glm-5-3-flash-normal-cli-r3 | normal | cli | 3 | yes |  | 9 | 92819 | $0.00000 | 23.4 |
| 9router-cmc-z-ai-glm-5-3-flash-code-cli-r3 | code | cli | 3 | yes |  | 11 | 71417 | $0.00000 | 24.5 |
| 9router-cmc-z-ai-glm-5-3-flash-code-refactor-r1 | code | refactor | 1 | yes |  | 10 | 67811 | $0.00000 | 23.8 |
| 9router-cmc-z-ai-glm-5-3-flash-normal-refactor-r1 | normal | refactor | 1 | yes |  | 11 | 100318 | $0.00000 | 20.3 |
| 9router-cmc-z-ai-glm-5-3-flash-normal-refactor-r2 | normal | refactor | 2 | yes |  | 6 | 51668 | $0.00000 | 12.7 |
| 9router-cmc-z-ai-glm-5-3-flash-code-refactor-r2 | code | refactor | 2 | yes |  | 14 | 94767 | $0.00000 | 36.3 |
| 9router-cmc-z-ai-glm-5-3-flash-code-refactor-r3 | code | refactor | 3 | yes |  | 8 | 48725 | $0.00000 | 16.6 |
| 9router-cmc-z-ai-glm-5-3-flash-normal-refactor-r3 | normal | refactor | 3 | yes |  | 7 | 57563 | $0.00000 | 13.3 |
