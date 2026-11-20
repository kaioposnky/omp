# Escopo — Glob de modelo e role — Micro

Parent: [macro/scope.md](../macro/scope.md)

## Requirement statement

`scope.models` casa globs sobre `provider/id` na ordem do arquivo — o primeiro match decide — e
`scope.roles` só se aplica quando nenhuma regra de agente ou modelo casou.

## Acceptance criteria

- [ ] **CM-S4** `packages/coding-agent/test/code-mode/scope.test.ts` — `scope.models` usa o primeiro
  match da ordem do array; o glob `*haiku*` casa `anthropic/claude-haiku-5-5`, e um match posterior
  não sobrescreve o primeiro.
- [ ] **CM-S5** `packages/coding-agent/test/code-mode/scope.test.ts` — a regra de role se aplica
  quando nenhuma regra de agente ou modelo casou.

## Constraints

- A ordem do array é semântica; ordenar ou deduplicar os padrões muda a decisão do usuário.
- O alvo do glob é o `provider/id` já resolvido, não o nome amigável do modelo.
- `scope.agents` tem prioridade sobre `scope.models`; role fica abaixo dos dois.
- Padrões inválidos não podem ser silenciosamente ignorados: falham na validação do setting.

## Edge cases and failure modes

| Caso | Comportamento esperado |
| --- | --- |
| Dois padrões casam o mesmo modelo | Vence o primeiro do array |
| Nenhum padrão casa | Cai para `scope.roles` |
| `modelId` ausente | Regra de modelo não participa da decisão |
| Glob com `[` não fechado | Setting rejeitado na validação (ver CM-S8) |
| `scope.agents` casa e `scope.models` também | Agente vence |

## Implementation parts

- [nano/scope-model-globs-order.md](../nano/scope-model-globs-order.md) — semântica do primeiro
  match, formato do alvo e armadilhas de validação.
