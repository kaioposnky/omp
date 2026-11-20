# Needle 3 — Acurácia de argumentos — Micro

Parent: [macro/needle.md](../macro/needle.md)

## Requirement statement

O spike mede, sobre um conjunto rotulado de casos, a porcentagem de argumentos válidos produzidos pela Needle nos dois usos candidatos — seletor de tools (A) e reparo de tool call malformado (B) — usando os schemas reais do omp.

## Acceptance criteria

- [ ] `needle-spike/run_needle.py` sobre `needle-spike/cases.jsonl` reporta o percentual de args válidos por tool, separado entre uso A (top-k de tools do catálogo) e uso B (reparo de chamada malformada), com N por tool declarado — `NDL-2`, `needle-spike/run_needle.py`.

## Constraints

- Validação usa o JSON Schema da fixture (`needle-spike/fixtures/tool-schemas.json`), não uma checagem própria da Needle.
- Tools-alvo do relatório: as que o Code Mode realmente usa (leitura, edição, bash, eval, task, wait); tools com schema enorme (ex.: `edit` hashline) são reportadas separadamente porque são o caso mais hostil (F5, uso B).
- Uso A é medido como recall@k dos nomes corretos, além de args válidos quando a tool escolhida recebe argumentos.
- O conjunto rotulado precisa ter gabarito: prompt, tool esperada e args esperados; casos sem gabarito não entram na taxa.
- Nenhuma afirmação de acurácia sem o número e o N correspondentes (`[unverified]` enquanto não rodado).

## Edge cases and failure modes

| Caso | Comportamento esperado |
|---|---|
| Resposta do modelo não é JSON | Conta como inválida (não como "erro do harness") |
| Tool correta, args parcialmente válidos | Inválida para a taxa de acurácia; reportar quais campos falharam |
| Uso B aplicado a tool com efeito (`edit`, `bash`, `write`) | Medido, mas nunca promovido sem confirmação humana (RF5.4) |
| Caso ambíguo (duas tools plausíveis) | Conta como acerto para recall@k se a esperada estiver no top-k; a taxa de args usa só a escolhida |
| Runtime Python ausente | O runner falha explicitamente; o gate não é emitido |

## Implementation parts

- [nano/needle-spike-accuracy-harness.md](../nano/needle-spike-accuracy-harness.md)
