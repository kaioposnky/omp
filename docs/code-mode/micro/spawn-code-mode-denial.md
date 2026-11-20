# Subagentes — Recusa de Code Mode sem eval — Micro

Parent: [macro/spawn.md](../macro/spawn.md)

## Requirement statement

Quando o spawn pede `codeMode: true` mas o agente alvo não tem `eval` disponível, o resultado do bridge informa explicitamente `codeMode ignored: agent has no eval` em vez de falhar silenciosamente ou rodar sem tools.

## Acceptance criteria

- [ ] A decisão de spawn para um agente sem eval devolve texto de resultado contendo `codeMode ignored: agent has no eval` — `CM-A2`, `packages/coding-agent/test/code-mode/spawn.test.ts`.

## Constraints

- A mensagem é parte do resultado entregue ao modelo, não um log: o modelo precisa saber que o filho rodou em modo normal (`denied: { requested: true, reason: "agent has no eval" }` em `CodeModeDecision`).
- O hard gate de eval tem precedência sobre `spawnOverride` (mesma regra de `CM-S3`).
- O filho nunca fica sem tools: sem eval, ele roda no modo normal com as tools usuais.
- O registro do motivo não pode abortar o spawn.

## Edge cases and failure modes

| Caso | Comportamento esperado |
|---|---|
| Agente define `tools: ["read", "edit"]` (sem eval) | Code Mode negado, mensagem presente, filho normal |
| Host sem backend de eval | Mesma recusa, motivo de hard gate `no-eval` |
| `codeMode` ausente e agente sem eval | Nenhuma mensagem: não houve pedido explícito |
| `workpool()` com item sem eval | Item roda normal; motivo agregado no resultado do item |
| Mensagem duplicada em retry | Deduplicar por job/task id, não por texto |

## Implementation parts

- [nano/spawn-denial-reason-plumbing.md](../nano/spawn-denial-reason-plumbing.md)
