# Code Mode confirmation (2026-11-21)

Variant column: base = fresh normal + code arms; c1 = code + lean + recipe/todo appended to system prompt; c2 = c1 + full describe; ship = code arm with the final shipped `<cell-workflow>` text (sol only). sol/terra base+c1 ran after H1 and the first `<cell-workflow>` text were already in the harness, so their base code arm is the new harness (see docs/code-mode/micro/token-economy-model-behaviors.md).

| model | variant | ok | mean tok | mean req | Δ vs code baseline | Δ vs normal |
|---|---|---|---|---|---|---|
| sol | normal | 12/12 | 77.4k | 7.2 | - | - |
| sol | code | 12/12 | 69.9k | 8.2 | - | -10% (p=0.426) [-27.4k, +12.4k] |
| sol | c1 | 12/12 | 38.8k | 4.9 | -44% (p=0.000) [-44.0k, -18.1k] | -50% (p=0.000) [-49.9k, -27.2k] |
| terra | normal | 12/12 | 119.4k | 11.8 | - | - |
| terra | code | 12/12 | 36.2k | 5.1 | - | -70% (p=0.000) [-101.1k, -65.4k] |
| terra | c1 | 12/12 | 46.3k | 5.5 | +28% (p=0.039) [+0.6k, +19.6k] | -61% (p=0.000) [-97.2k, -49.1k] |
| deepseek | normal | 12/12 | 78.2k | 7.5 | - | - |
| deepseek | code | 12/12 | 61.8k | 8.1 | - | -21% (p=0.036) [-31.4k, -1.3k] |
| deepseek | c1 | 12/12 | 33.9k | 5.1 | -45% (p=0.001) [-41.2k, -14.5k] | -57% (p=0.000) [-52.3k, -36.1k] |
| deepseek | c2 | 12/12 | 42.3k | 6.0 | -31% (p=0.055) [-39.4k, +0.5k] | -46% (p=0.000) [-51.7k, -19.9k] |
| glm | normal | 12/12 | 75.2k | 8.2 | - | - |
| glm | code | 12/12 | 112.7k | 13.2 | - | +50% (p=0.041) [+1.9k, +73.1k] |
| glm | c1 | 12/12 | 29.4k | 4.8 | -74% (p=0.000) [-119.9k, -46.6k] | -61% (p=0.000) [-54.9k, -36.7k] |
| glm | c2 | 12/12 | 36.3k | 5.3 | -68% (p=0.001) [-114.9k, -37.9k] | -52% (p=0.000) [-53.1k, -24.8k] |
| haiku | normal | 12/12 | 116.6k | 6.5 | - | - |
| haiku | code | 12/12 | 63.4k | 5.1 | - | -46% (p=0.000) [-74.8k, -31.6k] |
| haiku | c1 | 12/12 | 54.2k | 4.3 | -14% (p=0.092) [-20.1k, +1.8k] | -53% (p=0.000) [-84.9k, -39.8k] |
| sonnet | normal | 12/12 | 85.4k | 5.0 | - | - |
| sonnet | code | 12/12 | 40.3k | 3.7 | - | -53% (p=0.000) [-64.0k, -26.2k] |
| sonnet | c1 | 12/12 | 44.5k | 3.9 | +10% (p=0.288) [-4.1k, +12.6k] | -48% (p=0.002) [-63.1k, -18.6k] |
