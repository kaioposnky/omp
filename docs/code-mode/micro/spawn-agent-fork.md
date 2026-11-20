# Subagentes — Fork da conversa — Micro

Parent: [macro/spawn.md](../macro/spawn.md)

## Requirement statement

`agent({ fork: true })` é aceito e produz um filho cujo arquivo de sessão foi forkado do pai (contendo as mensagens anteriores), falhando com mensagem clara quando a sessão pai não está persistida.

## Acceptance criteria

- [ ] `agent({ fork: true })` é aceito e o arquivo de sessão do filho é forkado do pai, contendo as mensagens anteriores do pai — `CM-A4`, `packages/coding-agent/test/code-mode/spawn.test.ts`.
- [ ] `fork: true` sem sessão pai persistida falha com mensagem clara — `CM-A5`, `packages/coding-agent/test/code-mode/spawn.test.ts`.

## Constraints

- O fork só existe sobre `PreparedSeanceSession.fork` (`packages/coding-agent/src/task/seance.ts#PreparedSeanceSession`), consumido por `packages/coding-agent/src/task/executor.ts` via `SessionManager.forkFrom`.
- `prepareSeance` hoje recusa `invocationKind !== "task"` (`packages/coding-agent/src/task/seance.ts#prepareSeance`); aceitar `invocationKind === "eval"` quando a origem é a própria sessão é pré-requisito (plano §5).
- A recusa de isolation continua; a recusa de custom tools só pode ser relaxada se `createEvalCustomTools` funcionar na sessão forkada — precisa de teste.
- Cada fork re-lê o histórico inteiro, com cache frio no primeiro request: N deve ser pequeno e o prompt de `eval-agents.md` deve documentar o custo (`docs/code-mode-plan.md` §5).
- O arquivo do pai precisa existir; `SessionManager.forkFrom` lança `ForkSourceNotFoundError` quando o arquivo de origem some (`packages/coding-agent/src/session/session-manager.ts#ForkSourceNotFoundError`).

## Edge cases and failure modes

| Caso | Comportamento esperado |
|---|---|
| Sessão principal em memória (`SessionManager.inMemory`) | Erro claro de sessão não persistida; nenhum fork vazio |
| `fork: true` + `isolated: true` | Recusa explícita (isolation não suportada no fork) |
| `fork: true` + `tools: [...]` custom | Recusa, salvo se o teste de custom tools na sessão forkada passar |
| `fork: true` + `schema` (structured output) | Permitido; a saída estruturada é validada como em qualquer subagente |
| Arquivo do pai removido entre prepare e exec | `ForkSourceNotFoundError` propagado como falha do job, não como sessão vazia |
| Vários forks no mesmo cell | Cada `fork: true` produz arquivo próprio; custo cresce linearmente |

## Implementation parts

- [nano/spawn-fork-seance-reuse.md](../nano/spawn-fork-seance-reuse.md)
