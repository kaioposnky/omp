# Subagentes — Parâmetro `codeMode` — Micro

Parent: [macro/spawn.md](../macro/spawn.md)

## Requirement statement

Os contratos de spawn aceitam `codeMode?: boolean`: `agent({ prompt, codeMode: true })` passa na validação do bridge (sem ser rejeitado) e itens de task/`workpool()` aceitam o mesmo campo.

## Acceptance criteria

- [ ] `agent({ prompt, codeMode: true })` é aceito pelo schema de argumentos; `runEvalAgent` não rejeita mais o campo — `CM-A1`, `packages/coding-agent/test/code-mode/spawn.test.ts`.
- [ ] O schema de item de task aceita `codeMode` — `CM-A3`, `packages/coding-agent/test/code-mode/spawn.test.ts`.

## Constraints

- O campo é opcional e, ausente, o filho usa a precedência de `resolveCodeMode` (frontmatter > scope > default), não herda o estado mutável do pai (RF4 / `CM-S6`).
- A decisão do filho é resolvida no host, não no kernel: o bridge encaminha `codeMode` para `StructuredSubagentRequest` (`packages/coding-agent/src/task/structured-subagent.ts#StructuredSubagentRequest`).
- Hard gate de eval vale mesmo com `codeMode: true` explícito: agente sem `eval` nas tools não ativa Code Mode e devolve motivo (ver `micro/spawn-code-mode-denial.md`).
- `workpool()` reusa o mesmo schema de `agent()`; nenhuma interface paralela deve ser criada.

## Edge cases and failure modes

| Caso | Comportamento esperado |
|---|---|
| `codeMode` ausente | Decisão padrão do filho (frontmatter/scope/default) |
| `codeMode: true` em agente sem eval | Aceito no schema, negado na resolução, com `denied.reason` |
| `codeMode: false` em sessão Code Mode | Filho roda em modo normal; o pai não muda |
| Valor não-booleano (`"true"`) | Erro de validação do schema (`@oh-my-pi/omptype`), com resumo do erro |
| Item de task com `codeMode` | Repassado ao executor como os demais campos do request |

## Implementation parts

- [nano/spawn-code-mode-decision-handoff.md](../nano/spawn-code-mode-decision-handoff.md)
