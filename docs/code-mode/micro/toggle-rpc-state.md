# Toggle — Estado no RPC — Micro

Parent: [macro/toggle.md](../macro/toggle.md)

## Requirement statement

O snapshot de estado da sessão exposto pelo RPC inclui `codeModeEnabled`, refletindo o estado
efetivo da sessão.

## Acceptance criteria

- [ ] **CM-T7** `packages/coding-agent/test/code-mode/toggle.test.ts` — o estado exposto via RPC
  contém `codeModeEnabled` com o valor efetivo da sessão.

## Constraints

- O campo entra como adição retrocompatível: clientes antigos não podem quebrar quando ele está
  ausente (`absentAs` no wire de estado).
- O valor é o estado congelado, não a regra recalculada.
- O campo não substitui `status` textual: é dado para cliente.

## Edge cases and failure modes

| Caso | Comportamento esperado |
| --- | --- |
| Servidor antigo sem o campo | Cliente decodifica como `false` |
| Sessão troca de modo por sessão nova | Snapshot novo reflete o novo estado |
| `/code-mode status` com divergência | RPC continua reportando o estado congelado |

## Implementation parts

Não há parte não óbvia: a implementação acompanha o snapshot de estado existente
(`packages/coding-agent/src/modes/rpc/wire/state.ts#stateDefs`).
