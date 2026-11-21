# Code Mode A/B — full run

- Generated: 2026-11-20T22:25:12.713Z
- Reps per arm: 2; tasks: pricing, parser, cli, refactor
- Budget: $4.85000 (spent $3.77829)
- Per-model cap: $0.90000
- Spent on 9router/cc/claude-opus-5-5: $0.84800
- Spent on 9router/cc/claude-haiku-5-5: $0.24061
- Spent on 9router/cc/claude-sonnet-5-5: $0.81204
- Spent on 9router/cx/gpt-6.2-sol: $1.09160
- Spent on 9router/cx/gpt-6.1-terra: $0.78604
- Pricing: models.dev snapshot 2026-11-20, USD per 1M tokens, per-request long-context tiers

## Per model and arm

| model | arm | n | success | mean input | mean output | cache read | cache write | mean tokens | mean cost | mean wall s | mean requests | mean tool calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 9router/cc/claude-opus-5-5 | normal | 1 | 100% | 139,330 | 2,236 | 0 | 0 | 141,566 | $0.60204 | 27.7 | 8.00 | 9.00 |
| 9router/cc/claude-opus-5-5 | code | 1 | 100% | 52,834 | 1,731 | 0 | 0 | 54,565 | $0.24596 | 21.8 | 5.00 | 4.00 |
| 9router/cc/claude-haiku-5-5 | normal | 8 | 100% | 172,904.38 | 3,923.38 | 0 | 0 | 176,827.75 | $0.01925 | 25.9 | 9.50 | 15.25 |
| 9router/cc/claude-haiku-5-5 | code | 8 | 100% | 89,683.38 | 3,712.5 | 0 | 0 | 93,395.88 | $0.01082 | 23.0 | 7.38 | 6.38 |
| 9router/cc/claude-sonnet-5-5 | normal | 2 | 100% | 129,931 | 1,844.5 | 0 | 0 | 131,775.5 | $0.27831 | 17.8 | 7.50 | 9.50 |
| 9router/cc/claude-sonnet-5-5 | code | 2 | 100% | 56,253.5 | 1,520.5 | 0 | 0 | 57,774 | $0.12771 | 14.6 | 5.00 | 4.00 |
| 9router/cx/gpt-6.2-sol | normal | 3 | 100% | 49,194.67 | 1,469.33 | 35,754.67 | 0 | 86,418.67 | $0.11666 | 47.3 | 7.67 | 18.67 |
| 9router/cx/gpt-6.2-sol | code | 3 | 100% | 81,261.67 | 2,460 | 70,400 | 0 | 154,121.67 | $0.19416 | 76.2 | 14.67 | 17.00 |
| 9router/cx/gpt-6.1-terra | normal | 8 | 100% | 48,023.25 | 1,518.63 | 150,784 | 0 | 200,325.88 | $0.06316 | 52.9 | 18.88 | 17.88 |
| 9router/cx/gpt-6.1-terra | code | 8 | 63% | 26,820.88 | 1,133.25 | 52,240 | 0 | 80,194.13 | $0.03510 | 310.8 | 9.13 | 8.13 |

## Paired tests (code − normal, paired by task×rep)

### 9router/cc/claude-opus-5-5

- cost USD: n<2, no paired test
- total tokens: n<2, no paired test
- cost lower: true; success >= normal: true; cost CI excludes 0: false; tokens CI excludes 0: false

### 9router/cc/claude-haiku-5-5

- cost USD: n=8, mean diff=-0.00843, t(7)=-3.87, p=0.0061, 95% CI [-0.0136, -0.0033]
- total tokens: n=8, mean diff=-83431.87500, t(7)=-4.23, p=0.0039, 95% CI [-130088.5416, -36775.2084]
- cost lower: true; success >= normal: true; cost CI excludes 0: true; tokens CI excludes 0: true

### 9router/cc/claude-sonnet-5-5

- cost USD: n=2, mean diff=-0.15060, t(1)=-8.90, p=0.0712, 95% CI [-0.3656, 0.0644]
- total tokens: n=2, mean diff=-74001.50000, t(1)=-8.20, p=0.0773, 95% CI [-188704.9150, 40701.9150]
- cost lower: true; success >= normal: true; cost CI excludes 0: false; tokens CI excludes 0: false

### 9router/cx/gpt-6.2-sol

- cost USD: n=3, mean diff=0.07751, t(2)=3.41, p=0.0761, 95% CI [-0.0202, 0.1752]
- total tokens: n=3, mean diff=67703.00000, t(2)=5.63, p=0.0301, 95% CI [16002.5490, 119403.4510]
- cost lower: false; success >= normal: true; cost CI excludes 0: false; tokens CI excludes 0: false

### 9router/cx/gpt-6.1-terra

- cost USD: n=8, mean diff=-0.02806, t(7)=-2.61, p=0.0351, 95% CI [-0.0535, -0.0026]
- total tokens: n=8, mean diff=-120131.75000, t(7)=-4.43, p=0.0030, 95% CI [-184281.6380, -55981.8620]
- cost lower: true; success >= normal: false; cost CI excludes 0: true; tokens CI excludes 0: true

## Decision rule

`codeMode.default: true` only if cost is lower and success is not worse in at least two models (one Anthropic, one OpenAI/Codex), with the paired cost CI excluding 0.

- Qualifying models: 9router/cc/claude-haiku-5-5
- Anthropic qualifier: true; OpenAI/Codex qualifier: false
- Verdict: `default: true` NOT supported by this data

## Runs

| run | arm | task | rep | ok | reason | requests | tokens | cost | wall s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 9router-cc-claude-opus-5-5-normal-pricing-r1 | normal | pricing | 1 | yes |  | 8 | 141566 | $0.60204 | 27.7 |
| 9router-cc-claude-haiku-5-5-normal-pricing-r1 | normal | pricing | 1 | yes |  | 9 | 170983 | $0.01851 | 23.3 |
| 9router-cc-claude-haiku-5-5-code-pricing-r1 | code | pricing | 1 | yes |  | 6 | 69645 | $0.00825 | 19.9 |
| 9router-cc-claude-haiku-5-5-code-pricing-r2 | code | pricing | 2 | yes |  | 8 | 108482 | $0.01232 | 23.6 |
| 9router-cc-claude-haiku-5-5-normal-pricing-r2 | normal | pricing | 2 | yes |  | 8 | 147398 | $0.01621 | 22.3 |
| 9router-cc-claude-haiku-5-5-code-parser-r1 | code | parser | 1 | yes |  | 10 | 132821 | $0.01556 | 33.1 |
| 9router-cc-claude-haiku-5-5-normal-parser-r1 | normal | parser | 1 | yes |  | 8 | 146941 | $0.01598 | 21.6 |
| 9router-cc-claude-haiku-5-5-normal-parser-r2 | normal | parser | 2 | yes |  | 7 | 130650 | $0.01426 | 20.1 |
| 9router-cc-claude-haiku-5-5-code-parser-r2 | code | parser | 2 | yes |  | 8 | 104310 | $0.01203 | 24.1 |
| 9router-cc-claude-haiku-5-5-normal-cli-r1 | normal | cli | 1 | yes |  | 13 | 250249 | $0.02728 | 35.6 |
| 9router-cc-claude-haiku-5-5-code-cli-r1 | code | cli | 1 | yes |  | 6 | 69006 | $0.00823 | 20.2 |
| 9router-cc-claude-haiku-5-5-code-cli-r2 | code | cli | 2 | yes |  | 7 | 85227 | $0.01014 | 24.3 |
| 9router-cc-claude-haiku-5-5-normal-cli-r2 | normal | cli | 2 | yes |  | 9 | 163418 | $0.01781 | 24.5 |
| 9router-cc-claude-haiku-5-5-code-refactor-r1 | code | refactor | 1 | yes |  | 7 | 88365 | $0.01001 | 18.8 |
| 9router-cc-claude-haiku-5-5-normal-refactor-r1 | normal | refactor | 1 | yes |  | 11 | 200053 | $0.02156 | 28.2 |
| 9router-cc-claude-haiku-5-5-normal-refactor-r2 | normal | refactor | 2 | yes |  | 11 | 204930 | $0.02242 | 31.7 |
| 9router-cc-claude-haiku-5-5-code-refactor-r2 | code | refactor | 2 | yes |  | 7 | 89311 | $0.01006 | 19.9 |
| 9router-cc-claude-sonnet-5-5-normal-pricing-r1 | normal | pricing | 1 | yes |  | 7 | 122705 | $0.26140 | 18.0 |
| 9router-cc-claude-sonnet-5-5-code-pricing-r1 | code | pricing | 1 | yes |  | 5 | 57731 | $0.12773 | 14.7 |
| 9router-cc-claude-sonnet-5-5-code-pricing-r2 | code | pricing | 2 | yes |  | 5 | 57817 | $0.12770 | 14.4 |
| 9router-cc-claude-sonnet-5-5-normal-pricing-r2 | normal | pricing | 2 | yes |  | 8 | 140846 | $0.29521 | 17.6 |
| 9router-cx-gpt-6-2-sol-normal-pricing-r1 | normal | pricing | 1 | yes |  | 8 | 93494 | $0.14558 | 49.9 |
| 9router-cx-gpt-6-2-sol-code-pricing-r1 | code | pricing | 1 | yes |  | 14 | 138401 | $0.17893 | 71.3 |
| 9router-cx-gpt-6-2-sol-code-pricing-r2 | code | pricing | 2 | yes |  | 16 | 165137 | $0.19447 | 64.8 |
| 9router-cx-gpt-6-2-sol-normal-pricing-r2 | normal | pricing | 2 | yes |  | 7 | 79453 | $0.10405 | 43.4 |
| 9router-cx-gpt-6-2-sol-code-parser-r1 | code | parser | 1 | yes |  | 14 | 158827 | $0.20909 | 92.4 |
| 9router-cx-gpt-6-1-terra-normal-pricing-r1 | normal | pricing | 1 | yes |  | 20 | 224050 | $0.06482 | 51.3 |
| 9router-cx-gpt-6-1-terra-code-pricing-r1 | code | pricing | 1 | no | timeout | 1 | 0 | $0.00000 | 900.2 |
| 9router-cx-gpt-6-1-terra-code-pricing-r2 | code | pricing | 2 | yes |  | 14 | 133093 | $0.06383 | 55.2 |
| 9router-cx-gpt-6-1-terra-normal-pricing-r2 | normal | pricing | 2 | yes |  | 19 | 208523 | $0.06111 | 48.5 |
| 9router-cx-gpt-6-1-terra-code-parser-r1 | code | parser | 1 | yes |  | 16 | 154926 | $0.06625 | 62.9 |
| 9router-cx-gpt-6-1-terra-normal-parser-r1 | normal | parser | 1 | yes |  | 17 | 179999 | $0.06403 | 48.7 |
| 9router-cx-gpt-6-1-terra-normal-parser-r2 | normal | parser | 2 | yes |  | 19 | 203950 | $0.06535 | 54.5 |
| 9router-cx-gpt-6-1-terra-code-parser-r2 | code | parser | 2 | yes |  | 13 | 119745 | $0.04906 | 48.0 |
| 9router-cx-gpt-6-1-terra-normal-cli-r1 | normal | cli | 1 | yes |  | 20 | 206673 | $0.06517 | 58.1 |
| 9router-cx-gpt-6-1-terra-code-cli-r1 | code | cli | 1 | no | timeout | 1 | 0 | $0.00000 | 900.0 |
| 9router-cx-gpt-6-1-terra-code-cli-r2 | code | cli | 2 | yes |  | 16 | 144405 | $0.06106 | 64.1 |
| 9router-cx-gpt-6-1-terra-normal-cli-r2 | normal | cli | 2 | yes |  | 21 | 217707 | $0.07163 | 63.8 |
| 9router-cx-gpt-6-2-sol-normal-parser-r1 | normal | parser | 1 | yes |  | 8 | 86309 | $0.10035 | 48.7 |
| 9router-cx-gpt-6-1-terra-normal-refactor-r1 | normal | refactor | 1 | yes |  | 19 | 198936 | $0.06195 | 55.6 |
| 9router-cx-gpt-6-1-terra-code-refactor-r1 | code | refactor | 1 | no | timeout | 1 | 0 | $0.00000 | 420.0 |
| 9router-cx-gpt-6-1-terra-code-refactor-r2 | code | refactor | 2 | yes |  | 11 | 89384 | $0.04059 | 35.7 |
| 9router-cx-gpt-6-1-terra-normal-refactor-r2 | normal | refactor | 2 | yes |  | 16 | 162769 | $0.05118 | 43.0 |
| 9router-cc-claude-opus-5-5-code-pricing-r1 | code | pricing | 1 | yes |  | 5 | 54565 | $0.24596 | 21.8 |
