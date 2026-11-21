# Code Mode A/B — full run

- Generated: 2026-11-20T23:42:29.815Z
- Reps per arm: 3; tasks: pricing, parser, cli, refactor
- Budget: $5.00000 (spent $14.35153)
- Spent on 9router/cc/claude-haiku-5-5: $0.26406
- Spent on 9router/cc/claude-opus-5-5: $6.57925
- Spent on 9router/cx/gpt-6.2-sol: $3.22613
- Spent on 9router/cc/claude-sonnet-5-5: $3.27735
- Spent on 9router/cx/gpt-6.1-terra: $1.00475
- Pricing: models.dev snapshot 2026-11-20, USD per 1M tokens, per-request long-context tiers

## Per model and arm

| model | arm | n | success | mean input | mean output | cache read | cache write | mean tokens | mean cost | mean wall s | mean requests | mean tool calls |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 9router/cc/claude-opus-5-5 | normal | 12 | 100% | 83,720.75 | 1,568.25 | 0 | 0 | 85,289 | $0.36625 | 20.8 | 4.92 | 5.58 |
| 9router/cc/claude-opus-5-5 | code | 12 | 100% | 38,486.92 | 1,403.75 | 0 | 0 | 39,890.67 | $0.18202 | 16.3 | 3.50 | 2.50 |
| 9router/cc/claude-haiku-5-5 | normal | 12 | 100% | 128,383.5 | 2,553.58 | 0 | 0 | 130,937.08 | $0.01412 | 19.4 | 7.17 | 10.33 |
| 9router/cc/claude-haiku-5-5 | code | 12 | 100% | 64,830.92 | 2,812.75 | 0 | 0 | 67,643.67 | $0.00789 | 18.4 | 5.33 | 4.42 |
| 9router/cc/claude-sonnet-5-5 | normal | 12 | 100% | 85,045.83 | 1,500.92 | 0 | 0 | 86,546.75 | $0.18510 | 13.7 | 5.08 | 7.50 |
| 9router/cc/claude-sonnet-5-5 | code | 12 | 100% | 38,160.5 | 1,169.08 | 0 | 0 | 39,329.58 | $0.08801 | 10.5 | 3.58 | 2.58 |
| 9router/cx/gpt-6.2-sol | normal | 12 | 100% | 45,541.08 | 1,470.83 | 39,381.33 | 0 | 86,393.25 | $0.10973 | 45.1 | 7.83 | 18.00 |
| 9router/cx/gpt-6.2-sol | code | 12 | 100% | 69,285.67 | 1,598.92 | 45,546.67 | 0 | 116,431.25 | $0.15912 | 56.3 | 12.75 | 13.25 |
| 9router/cx/gpt-6.1-terra | normal | 12 | 100% | 29,159.75 | 935.42 | 84,202.67 | 0 | 114,297.83 | $0.03805 | 34.8 | 11.33 | 10.25 |
| 9router/cx/gpt-6.1-terra | code | 12 | 100% | 32,770.33 | 1,847.42 | 73,493.33 | 0 | 108,111.08 | $0.04568 | 62.1 | 12.08 | 10.83 |

## Paired tests (code − normal, paired by task×rep)

### 9router/cc/claude-opus-5-5

- cost USD: n=12, mean diff=-0.18423, t(11)=-8.41, p=0.0000, 95% CI [-0.2324, -0.1360]
- total tokens: n=12, mean diff=-45398.33333, t(11)=-8.47, p=0.0000, 95% CI [-57196.5550, -33600.1116]
- cost lower: true; success >= normal: true; cost CI excludes 0: true; tokens CI excludes 0: true

### 9router/cc/claude-haiku-5-5

- cost USD: n=12, mean diff=-0.00623, t(11)=-3.68, p=0.0036, 95% CI [-0.0099, -0.0025]
- total tokens: n=12, mean diff=-63293.41667, t(11)=-3.98, p=0.0022, 95% CI [-98321.9244, -28264.9090]
- cost lower: true; success >= normal: true; cost CI excludes 0: true; tokens CI excludes 0: true

### 9router/cc/claude-sonnet-5-5

- cost USD: n=12, mean diff=-0.09709, t(11)=-4.88, p=0.0005, 95% CI [-0.1409, -0.0533]
- total tokens: n=12, mean diff=-47217.16667, t(11)=-5.07, p=0.0004, 95% CI [-67717.5296, -26716.8038]
- cost lower: true; success >= normal: true; cost CI excludes 0: true; tokens CI excludes 0: true

### 9router/cx/gpt-6.2-sol

- cost USD: n=12, mean diff=0.04939, t(11)=6.95, p=0.0000, 95% CI [0.0337, 0.0650]
- total tokens: n=12, mean diff=30038.00000, t(11)=4.70, p=0.0006, 95% CI [15980.4218, 44095.5782]
- cost lower: false; success >= normal: true; cost CI excludes 0: false; tokens CI excludes 0: false

### 9router/cx/gpt-6.1-terra

- cost USD: n=12, mean diff=0.00764, t(11)=1.58, p=0.1426, 95% CI [-0.0030, 0.0183]
- total tokens: n=12, mean diff=-6186.75000, t(11)=-0.52, p=0.6155, 95% CI [-32530.8573, 20157.3573]
- cost lower: false; success >= normal: true; cost CI excludes 0: false; tokens CI excludes 0: false

## Decision rule

`codeMode.default: true` only if cost is lower and success is not worse in at least two models (one Anthropic, one OpenAI/Codex), with the paired cost CI excluding 0.

- Qualifying models: 9router/cc/claude-opus-5-5, 9router/cc/claude-haiku-5-5, 9router/cc/claude-sonnet-5-5
- Anthropic qualifier: true; OpenAI/Codex qualifier: false
- Verdict: `default: true` NOT supported by this data

## Runs

| run | arm | task | rep | ok | reason | requests | tokens | cost | wall s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 9router-cc-claude-haiku-5-5-normal-pricing-r1 | normal | pricing | 1 | yes |  | 10 | 190323 | $0.02048 | 28.8 |
| 9router-cc-claude-haiku-5-5-code-pricing-r1 | code | pricing | 1 | yes |  | 4 | 45634 | $0.00547 | 15.1 |
| 9router-cc-claude-haiku-5-5-code-pricing-r2 | code | pricing | 2 | yes |  | 5 | 61455 | $0.00739 | 19.5 |
| 9router-cc-claude-haiku-5-5-normal-pricing-r2 | normal | pricing | 2 | yes |  | 7 | 127042 | $0.01362 | 18.4 |
| 9router-cc-claude-haiku-5-5-normal-pricing-r3 | normal | pricing | 3 | yes |  | 7 | 124798 | $0.01360 | 19.7 |
| 9router-cc-claude-haiku-5-5-code-pricing-r3 | code | pricing | 3 | yes |  | 5 | 60005 | $0.00730 | 19.9 |
| 9router-cc-claude-haiku-5-5-code-parser-r1 | code | parser | 1 | yes |  | 7 | 95365 | $0.01086 | 21.3 |
| 9router-cc-claude-haiku-5-5-normal-parser-r1 | normal | parser | 1 | yes |  | 5 | 91838 | $0.00995 | 14.2 |
| 9router-cc-claude-haiku-5-5-normal-parser-r2 | normal | parser | 2 | yes |  | 10 | 190634 | $0.02020 | 23.7 |
| 9router-cc-claude-haiku-5-5-code-parser-r2 | code | parser | 2 | yes |  | 5 | 63351 | $0.00728 | 15.9 |
| 9router-cc-claude-haiku-5-5-code-parser-r3 | code | parser | 3 | yes |  | 9 | 141699 | $0.01611 | 29.4 |
| 9router-cc-claude-haiku-5-5-normal-parser-r3 | normal | parser | 3 | yes |  | 6 | 115845 | $0.01242 | 16.1 |
| 9router-cc-claude-haiku-5-5-normal-cli-r1 | normal | cli | 1 | yes |  | 13 | 246005 | $0.02618 | 31.8 |
| 9router-cc-claude-haiku-5-5-code-cli-r1 | code | cli | 1 | yes |  | 7 | 91203 | $0.01060 | 23.8 |
| 9router-cc-claude-haiku-5-5-code-cli-r2 | code | cli | 2 | yes |  | 4 | 43832 | $0.00531 | 14.9 |
| 9router-cc-claude-haiku-5-5-normal-cli-r2 | normal | cli | 2 | yes |  | 5 | 88050 | $0.00972 | 15.5 |
| 9router-cc-claude-haiku-5-5-normal-cli-r3 | normal | cli | 3 | yes |  | 5 | 85225 | $0.00939 | 15.7 |
| 9router-cc-claude-haiku-5-5-code-cli-r3 | code | cli | 3 | yes |  | 4 | 47161 | $0.00590 | 18.0 |
| 9router-cc-claude-haiku-5-5-code-refactor-r1 | code | refactor | 1 | yes |  | 5 | 59419 | $0.00676 | 16.0 |
| 9router-cc-claude-haiku-5-5-normal-refactor-r1 | normal | refactor | 1 | yes |  | 6 | 104204 | $0.01139 | 17.1 |
| 9router-cc-claude-haiku-5-5-normal-refactor-r2 | normal | refactor | 2 | yes |  | 7 | 121705 | $0.01318 | 18.9 |
| 9router-cc-claude-haiku-5-5-code-refactor-r2 | code | refactor | 2 | yes |  | 5 | 56388 | $0.00642 | 15.1 |
| 9router-cc-claude-haiku-5-5-code-refactor-r3 | code | refactor | 3 | yes |  | 4 | 46212 | $0.00525 | 12.2 |
| 9router-cc-claude-haiku-5-5-normal-refactor-r3 | normal | refactor | 3 | yes |  | 5 | 85576 | $0.00926 | 13.0 |
| 9router-cc-claude-opus-5-5-normal-pricing-r1 | normal | pricing | 1 | yes |  | 4 | 67936 | $0.29838 | 22.5 |
| 9router-cc-claude-opus-5-5-code-pricing-r1 | code | pricing | 1 | yes |  | 4 | 47464 | $0.21712 | 17.7 |
| 9router-cc-claude-opus-5-5-code-pricing-r2 | code | pricing | 2 | yes |  | 4 | 43725 | $0.20024 | 16.0 |
| 9router-cc-claude-opus-5-5-normal-pricing-r2 | normal | pricing | 2 | yes |  | 5 | 86296 | $0.36698 | 16.9 |
| 9router-cc-claude-opus-5-5-normal-pricing-r3 | normal | pricing | 3 | yes |  | 7 | 127093 | $0.54130 | 24.5 |
| 9router-cc-claude-opus-5-5-code-pricing-r3 | code | pricing | 3 | yes |  | 4 | 45395 | $0.20585 | 16.9 |
| 9router-cc-claude-opus-5-5-code-parser-r1 | code | parser | 1 | yes |  | 4 | 48083 | $0.21574 | 15.2 |
| 9router-cc-claude-opus-5-5-normal-parser-r1 | normal | parser | 1 | yes |  | 6 | 107253 | $0.45687 | 19.6 |
| 9router-cc-claude-opus-5-5-normal-parser-r2 | normal | parser | 2 | yes |  | 6 | 108781 | $0.45909 | 18.0 |
| 9router-cc-claude-opus-5-5-code-parser-r2 | code | parser | 2 | yes |  | 4 | 50012 | $0.22523 | 15.8 |
| 9router-cc-claude-opus-5-5-code-parser-r3 | code | parser | 3 | yes |  | 4 | 49672 | $0.22141 | 17.5 |
| 9router-cc-claude-opus-5-5-normal-parser-r3 | normal | parser | 3 | yes |  | 6 | 109196 | $0.46544 | 25.8 |
| 9router-cc-claude-opus-5-5-normal-cli-r1 | normal | cli | 1 | yes |  | 4 | 67500 | $0.29765 | 22.0 |
| 9router-cc-claude-opus-5-5-code-cli-r1 | code | cli | 1 | yes |  | 3 | 33760 | $0.16099 | 17.4 |
| 9router-cc-claude-opus-5-5-code-cli-r2 | code | cli | 2 | yes |  | 3 | 33831 | $0.16097 | 16.5 |
| 9router-cc-claude-opus-5-5-normal-cli-r2 | normal | cli | 2 | yes |  | 4 | 67493 | $0.29682 | 21.0 |
| 9router-cc-claude-opus-5-5-normal-cli-r3 | normal | cli | 3 | yes |  | 4 | 67652 | $0.30099 | 23.8 |
| 9router-cc-claude-opus-5-5-code-cli-r3 | code | cli | 3 | yes |  | 3 | 34068 | $0.16450 | 20.4 |
| 9router-cc-claude-opus-5-5-code-refactor-r1 | code | refactor | 1 | yes |  | 3 | 30827 | $0.13779 | 14.1 |
| 9router-cc-claude-opus-5-5-normal-refactor-r1 | normal | refactor | 1 | yes |  | 5 | 82901 | $0.34909 | 19.3 |
| 9router-cc-claude-opus-5-5-normal-refactor-r2 | normal | refactor | 2 | yes |  | 3 | 48391 | $0.21275 | 15.9 |
| 9router-cc-claude-opus-5-5-code-refactor-r2 | code | refactor | 2 | yes |  | 3 | 30862 | $0.13750 | 14.1 |
| 9router-cc-claude-opus-5-5-code-refactor-r3 | code | refactor | 3 | yes |  | 3 | 30989 | $0.13693 | 13.4 |
| 9router-cc-claude-opus-5-5-normal-refactor-r3 | normal | refactor | 3 | yes |  | 5 | 82976 | $0.34962 | 19.7 |
| 9router-cx-gpt-6-2-sol-normal-pricing-r1 | normal | pricing | 1 | yes |  | 8 | 90577 | $0.11898 | 48.2 |
| 9router-cx-gpt-6-2-sol-code-pricing-r1 | code | pricing | 1 | yes |  | 15 | 149168 | $0.17632 | 63.5 |
| 9router-cx-gpt-6-2-sol-code-pricing-r2 | code | pricing | 2 | yes |  | 11 | 107949 | $0.13805 | 61.7 |
| 9router-cx-gpt-6-2-sol-normal-pricing-r2 | normal | pricing | 2 | yes |  | 9 | 99822 | $0.12799 | 46.7 |
| 9router-cx-gpt-6-2-sol-normal-pricing-r3 | normal | pricing | 3 | yes |  | 8 | 85931 | $0.10543 | 44.7 |
| 9router-cx-gpt-6-2-sol-code-pricing-r3 | code | pricing | 3 | yes |  | 13 | 126953 | $0.16036 | 53.8 |
| 9router-cx-gpt-6-2-sol-code-parser-r1 | code | parser | 1 | yes |  | 13 | 114388 | $0.15341 | 51.0 |
| 9router-cx-gpt-6-2-sol-normal-parser-r1 | normal | parser | 1 | yes |  | 8 | 93460 | $0.10577 | 50.7 |
| 9router-cx-gpt-6-2-sol-normal-parser-r2 | normal | parser | 2 | yes |  | 7 | 78042 | $0.09695 | 39.0 |
| 9router-cx-gpt-6-2-sol-code-parser-r2 | code | parser | 2 | yes |  | 13 | 119581 | $0.15890 | 52.7 |
| 9router-cx-gpt-6-2-sol-code-parser-r3 | code | parser | 3 | yes |  | 13 | 139634 | $0.18230 | 63.2 |
| 9router-cx-gpt-6-2-sol-normal-parser-r3 | normal | parser | 3 | yes |  | 7 | 77437 | $0.09604 | 37.9 |
| 9router-cx-gpt-6-2-sol-normal-cli-r1 | normal | cli | 1 | yes |  | 8 | 89206 | $0.11903 | 58.6 |
| 9router-cx-gpt-6-2-sol-code-cli-r1 | code | cli | 1 | yes |  | 9 | 74027 | $0.13101 | 52.6 |
| 9router-cx-gpt-6-2-sol-code-cli-r2 | code | cli | 2 | yes |  | 11 | 105183 | $0.14816 | 69.3 |
| 9router-cx-gpt-6-2-sol-normal-cli-r2 | normal | cli | 2 | yes |  | 8 | 85542 | $0.12143 | 45.5 |
| 9router-cx-gpt-6-2-sol-normal-cli-r3 | normal | cli | 3 | yes |  | 9 | 100941 | $0.12756 | 57.0 |
| 9router-cx-gpt-6-2-sol-code-cli-r3 | code | cli | 3 | yes |  | 14 | 122512 | $0.16636 | 65.0 |
| 9router-cx-gpt-6-2-sol-code-refactor-r1 | code | refactor | 1 | yes |  | 13 | 111059 | $0.16242 | 44.3 |
| 9router-cx-gpt-6-2-sol-normal-refactor-r1 | normal | refactor | 1 | yes |  | 7 | 75132 | $0.09230 | 36.5 |
| 9router-cx-gpt-6-2-sol-normal-refactor-r2 | normal | refactor | 2 | yes |  | 8 | 85983 | $0.11358 | 39.9 |
| 9router-cx-gpt-6-2-sol-code-refactor-r2 | code | refactor | 2 | yes |  | 16 | 133895 | $0.19517 | 58.2 |
| 9router-cx-gpt-6-2-sol-code-refactor-r3 | code | refactor | 3 | yes |  | 12 | 92826 | $0.13690 | 40.8 |
| 9router-cx-gpt-6-2-sol-normal-refactor-r3 | normal | refactor | 3 | yes |  | 7 | 74646 | $0.09167 | 36.2 |
| 9router-cc-claude-sonnet-5-5-normal-pricing-r1 | normal | pricing | 1 | yes |  | 4 | 68551 | $0.14957 | 14.3 |
| 9router-cc-claude-sonnet-5-5-code-pricing-r1 | code | pricing | 1 | yes |  | 4 | 42622 | $0.09568 | 11.4 |
| 9router-cc-claude-sonnet-5-5-code-pricing-r2 | code | pricing | 2 | yes |  | 4 | 42610 | $0.09489 | 10.7 |
| 9router-cc-claude-sonnet-5-5-normal-pricing-r2 | normal | pricing | 2 | yes |  | 5 | 84365 | $0.18103 | 13.9 |
| 9router-cc-claude-sonnet-5-5-normal-pricing-r3 | normal | pricing | 3 | yes |  | 6 | 102567 | $0.21673 | 13.4 |
| 9router-cc-claude-sonnet-5-5-code-pricing-r3 | code | pricing | 3 | yes |  | 4 | 42663 | $0.09529 | 11.0 |
| 9router-cc-claude-sonnet-5-5-code-parser-r1 | code | parser | 1 | yes |  | 4 | 47520 | $0.10475 | 10.8 |
| 9router-cc-claude-sonnet-5-5-normal-parser-r1 | normal | parser | 1 | yes |  | 4 | 67297 | $0.14469 | 11.4 |
| 9router-cc-claude-sonnet-5-5-normal-parser-r2 | normal | parser | 2 | yes |  | 4 | 67270 | $0.14442 | 11.4 |
| 9router-cc-claude-sonnet-5-5-code-parser-r2 | code | parser | 2 | yes |  | 4 | 47376 | $0.10457 | 10.8 |
| 9router-cc-claude-sonnet-5-5-code-parser-r3 | code | parser | 3 | yes |  | 4 | 47321 | $0.10421 | 11.5 |
| 9router-cc-claude-sonnet-5-5-normal-parser-r3 | normal | parser | 3 | yes |  | 4 | 67247 | $0.14419 | 11.7 |
| 9router-cc-claude-sonnet-5-5-normal-cli-r1 | normal | cli | 1 | yes |  | 5 | 83227 | $0.17701 | 12.5 |
| 9router-cc-claude-sonnet-5-5-code-cli-r1 | code | cli | 1 | yes |  | 4 | 43159 | $0.09908 | 12.9 |
| 9router-cc-claude-sonnet-5-5-code-cli-r2 | code | cli | 2 | yes |  | 3 | 32818 | $0.07767 | 13.0 |
| 9router-cc-claude-sonnet-5-5-normal-cli-r2 | normal | cli | 2 | yes |  | 4 | 66151 | $0.14376 | 13.0 |
| 9router-cc-claude-sonnet-5-5-normal-cli-r3 | normal | cli | 3 | yes |  | 4 | 65109 | $0.14084 | 11.8 |
| 9router-cc-claude-sonnet-5-5-code-cli-r3 | code | cli | 3 | yes |  | 3 | 33318 | $0.07752 | 11.3 |
| 9router-cc-claude-sonnet-5-5-code-refactor-r1 | code | refactor | 1 | yes |  | 3 | 30914 | $0.06792 | 7.6 |
| 9router-cc-claude-sonnet-5-5-normal-refactor-r1 | normal | refactor | 1 | yes |  | 8 | 138366 | $0.29340 | 18.9 |
| 9router-cc-claude-sonnet-5-5-normal-refactor-r2 | normal | refactor | 2 | yes |  | 5 | 84015 | $0.17758 | 11.4 |
| 9router-cc-claude-sonnet-5-5-code-refactor-r2 | code | refactor | 2 | yes |  | 3 | 30927 | $0.06783 | 8.0 |
| 9router-cc-claude-sonnet-5-5-code-refactor-r3 | code | refactor | 3 | yes |  | 3 | 30707 | $0.06674 | 7.1 |
| 9router-cc-claude-sonnet-5-5-normal-refactor-r3 | normal | refactor | 3 | yes |  | 8 | 144396 | $0.30799 | 20.4 |
| 9router-cx-gpt-6-1-terra-normal-pricing-r1 | normal | pricing | 1 | yes |  | 13 | 143891 | $0.05000 | 40.2 |
| 9router-cx-gpt-6-1-terra-code-pricing-r1 | code | pricing | 1 | yes |  | 10 | 88365 | $0.03759 | 39.7 |
| 9router-cx-gpt-6-1-terra-code-pricing-r2 | code | pricing | 2 | yes |  | 10 | 88560 | $0.03833 | 39.0 |
| 9router-cx-gpt-6-1-terra-normal-pricing-r2 | normal | pricing | 2 | yes |  | 11 | 117023 | $0.03741 | 30.8 |
| 9router-cx-gpt-6-1-terra-normal-pricing-r3 | normal | pricing | 3 | yes |  | 11 | 117758 | $0.03738 | 32.1 |
| 9router-cx-gpt-6-1-terra-code-pricing-r3 | code | pricing | 3 | yes |  | 15 | 169508 | $0.06388 | 75.0 |
| 9router-cx-gpt-6-1-terra-code-parser-r1 | code | parser | 1 | yes |  | 16 | 150205 | $0.06016 | 147.3 |
| 9router-cx-gpt-6-1-terra-normal-parser-r1 | normal | parser | 1 | yes |  | 12 | 126199 | $0.04058 | 36.1 |
| 9router-cx-gpt-6-1-terra-normal-parser-r2 | normal | parser | 2 | yes |  | 12 | 125853 | $0.04015 | 34.1 |
| 9router-cx-gpt-6-1-terra-code-parser-r2 | code | parser | 2 | yes |  | 15 | 149425 | $0.05873 | 63.4 |
| 9router-cx-gpt-6-1-terra-code-parser-r3 | code | parser | 3 | yes |  | 14 | 125441 | $0.06086 | 64.7 |
| 9router-cx-gpt-6-1-terra-normal-parser-r3 | normal | parser | 3 | yes |  | 7 | 67530 | $0.02291 | 19.4 |
| 9router-cx-gpt-6-1-terra-normal-cli-r1 | normal | cli | 1 | yes |  | 11 | 106582 | $0.03626 | 33.3 |
| 9router-cx-gpt-6-1-terra-code-cli-r1 | code | cli | 1 | yes |  | 12 | 100489 | $0.04554 | 54.9 |
| 9router-cx-gpt-6-1-terra-code-cli-r2 | code | cli | 2 | yes |  | 16 | 143465 | $0.05798 | 64.6 |
| 9router-cx-gpt-6-1-terra-normal-cli-r2 | normal | cli | 2 | yes |  | 12 | 116979 | $0.03799 | 34.1 |
| 9router-cx-gpt-6-1-terra-normal-cli-r3 | normal | cli | 3 | yes |  | 13 | 129550 | $0.04261 | 38.4 |
| 9router-cx-gpt-6-1-terra-code-cli-r3 | code | cli | 3 | yes |  | 10 | 73905 | $0.03538 | 84.7 |
| 9router-cx-gpt-6-1-terra-code-refactor-r1 | code | refactor | 1 | yes |  | 10 | 83948 | $0.03456 | 50.4 |
| 9router-cx-gpt-6-1-terra-normal-refactor-r1 | normal | refactor | 1 | yes |  | 13 | 128282 | $0.04708 | 33.5 |
| 9router-cx-gpt-6-1-terra-normal-refactor-r2 | normal | refactor | 2 | yes |  | 9 | 73719 | $0.02459 | 54.3 |
| 9router-cx-gpt-6-1-terra-code-refactor-r2 | code | refactor | 2 | yes |  | 8 | 49933 | $0.02355 | 35.2 |
| 9router-cx-gpt-6-1-terra-code-refactor-r3 | code | refactor | 3 | yes |  | 9 | 74089 | $0.03162 | 26.5 |
| 9router-cx-gpt-6-1-terra-normal-refactor-r3 | normal | refactor | 3 | yes |  | 12 | 118208 | $0.03959 | 31.6 |
