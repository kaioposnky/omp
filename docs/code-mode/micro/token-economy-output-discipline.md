# Economia de tokens — Disciplina de output — Micro

Parent: [macro/token-economy.md](../macro/token-economy.md)

## Requirement statement

Em Code Mode, o output inline de cada cell de `eval` tem um limite menor que no modo normal e o excedente vai para um artifact `local://N.log`, de modo que resultados intermediários não entrem no histórico.

## Acceptance criteria

- [ ] O limite de output inline por cell em Code Mode é menor que no modo normal, e o overflow é gravado em artifact — `CM-E6`, `packages/coding-agent/test/code-mode/token-economy.test.ts`.

## Constraints

- Exemplo de limite em Code Mode: 4 KB inline (`docs/code-mode-plan.md` §12.5); o valor exato entra por setting/constante e o teste compara os dois modos, não um número fixo.
- O caminho de artifact já existe: `packages/tui/src/tools/streaming-output.ts#OutputSink` grava o overflow e `read("local://N.log")` o recupera (`packages/coding-agent/src/eval/backend.ts`).
- Resultados de `tool.*` nunca são impressos por padrão; só aparece o que o código imprime (§12.5).
- O prompt instrui "atribua à variável, imprima resumo/contagem/amostra" — a instrução faz parte da funcionalidade, não é decoração.

## Edge cases and failure modes

| Caso | Comportamento esperado |
|---|---|
| Output vazio | Nada é anexado ao histórico |
| Output exatamente no limite | Permanece inline; artifact só a partir do excedente |
| Output binário/longo de uma linha | Truncado em byte e em coluna, com artifact preservando o conteúdo (`packages/tui/src/tools/streaming-output.ts#DEFAULT_MAX_COLUMN`) |
| Artifact indisponível (sem diretório) | Cai no comportamento atual de truncamento com aviso; nunca perde a saída silenciosamente |
| Modo normal | Limite atual permanece (50 KB por `packages/tui/src/tools/streaming-output.ts#DEFAULT_MAX_BYTES`) |

## Implementation parts

- [nano/token-economy-eval-output-cap.md](../nano/token-economy-eval-output-cap.md)
