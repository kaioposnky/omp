# Core — Partição bridge-only — Micro

Parent: [macro/core.md](../macro/core.md)

## Requirement statement

Com Code Mode ativo, o wire do modelo contém apenas `eval`, `wait`, `yield`, `ask`, `todo`,
`checkpoint`, `rewind` e as tools fixadas explicitamente, enquanto toda tool removida do wire
continua executável por `getToolForEvalBridge` e descobrível de dentro do kernel por
`tool.describe`/`tool.search`.

## Acceptance criteria

- [ ] **CM-P1** `packages/coding-agent/test/code-mode/partition.test.ts` — com Code Mode ativo,
  `session.agent.state.tools` expõe apenas nomes do conjunto top-level (mais o que foi fixado via
  `toolNames`); `read`, `edit`, `bash` e a tool MCP do fixture não aparecem no wire.
- [ ] **CM-P2** `packages/coding-agent/test/code-mode/partition.test.ts` — tools bridge-only
  continuam alcançáveis: `session.getToolForEvalBridge("read")` e
  `session.getToolForEvalBridge("mcp__fixture_probe")` devolvem uma tool, e
  `session.getEnabledToolNames()` contém ambas.
- [ ] **CM-P3** `packages/coding-agent/test/code-mode/partition.test.ts` — `checkpoint`, `rewind`,
  `yield`, `ask` e `todo` permanecem top-level quando registrados, junto de `eval` e `wait`.
- [ ] **CM-G1** `packages/coding-agent/test/code-mode/gap.test.ts` — a prelude JS expõe
  `tool.describe("read")` devolvendo uma assinatura TypeScript que nomeia o parâmetro `path`; nome
  desconhecido lança erro em vez de devolver string vazia.
- [ ] **CM-G2** `packages/coding-agent/test/code-mode/gap.test.ts` — `tool.search("file contents", 5)`
  devolve no máximo 5 entradas `{ name, summary, signature }` e inclui `read`; tools que só existem
  em bridge-only (fora do wire) são encontráveis na busca.
- [ ] **CM-G3** `packages/coding-agent/test/code-mode/gap.test.ts` — a prelude Python expõe o mesmo
  `tool.describe`/`tool.search`, pulada quando não há backend Python (probe de skip já usado pelos
  testes de eval).

## Constraints

- A partição acontece na camada de apresentação. O registro de tools não pode ser estreitado:
  `--tools=eval,wait` quebraria `tool.edit(...)`.
- `checkpoint` e `rewind` nunca podem ir para o bridge — o bridge os bloqueia e a sessão só os
  reconhece como `toolResult` direto.
- Tools pedidas explicitamente pelo usuário continuam top-level, como no `xd://`.
- O `systemPrompt` não pode ser reescrito pela partição; só o conjunto anunciado muda.
- `tool.describe`/`tool.search` derivam do mesmo catálogo do bridge (`renderBridgeCatalog`)
  e do registro de tools: não podem manter uma lista paralela que divirja de
  `getEnabledToolNames()`.
- `tool.describe` de nome desconhecido lança erro; `tool.search` devolve lista vazia. O kernel nunca
  inventa assinatura para uma tool que o bridge não resolve.

## Edge cases and failure modes

| Caso | Comportamento esperado |
| --- | --- |
| Tool fixada explicitamente pelo usuário também está no conjunto top-level | Fica top-level, sem duplicar no bridge |
| MCP descoberto antes do startup | Entra direto como bridge-only |
| Conjunto inicial vazio de tools que não sejam top-level | Wire mínimo válido: `eval` + `wait` continuam anunciados |
| Nome desconhecido pedido em `getToolForEvalBridge` | `undefined`, sem exceção |
| xdev montado antes do Code Mode | Mounts viram bridge-only e `mountedNames` é limpo; o modo vence o `tools.xdev` |

## Implementation parts

- [nano/core-partition-bridge-layer.md](../nano/core-partition-bridge-layer.md) — como a camada
  bridge-only é representada em `SessionTools` e consultada pelo bridge.
