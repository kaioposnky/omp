# Integração — Catálogo MCP — Micro

Parent: [macro/integration.md](../macro/integration.md)

## Requirement statement

Com o Code Mode ligado, o bloco "MCP Tool Routes" (`xd://`) desaparece do system prompt e cada tool MCP passa a ser anunciada apenas no catálogo bridge-only (`tool.mcp__<server>_<tool>` + resumo), permanecendo alcançável pelo kernel.

## Acceptance criteria

- [ ] Com Code Mode ligado e um fixture MCP, `session.systemPrompt` não contém o bloco "MCP Tool Routes" e o catálogo bridge-only lista a tool MCP — `CM-C3`, `packages/coding-agent/test/code-mode/skills-mcp.test.ts`.

## Constraints

- Tools MCP nunca entram no wire em Code Mode: elas não são top-level e, portanto, não pagam schema por request (`docs/code-mode-plan.md` §12.3).
- O bloco `xd://` deixa de valer porque `read`/`write` saíram do top-level; o catálogo bridge-only é o substituto (RF6.2).
- `tool.describe(name)` devolve o schema sob demanda e `tool.search(query, k)` devolve top-k; o catálogo por si só não carrega schemas (`docs/code-mode-plan.md` §4.4).
- O catálogo é gerado em ordem estável para não alterar o prefixo (`packages/coding-agent/src/code-mode/catalog.ts#renderBridgeCatalog`).

## Edge cases and failure modes

| Caso | Comportamento esperado |
|---|---|
| Descoberta MCP tardia (depois do startup) | A tool entra na camada bridge-only e no catálogo; o system prompt já enviado não muda (ver `CM-E1`) — o modelo a encontra por `tool.search` |
| Servidor MCP com muitas tools | O catálogo colapsa em uma linha `mcp__<server>__* (N tools)` (ver `CM-E3`) |
| `tools.xdev` desligado | Hoje as tools MCP ficam no schema; em Code Mode elas continuam fora do wire, independentemente do xdev |
| Nome MCP ambíguo (`mcp__a_b_c`) | A resolução por alias continua valendo no bridge (`packages/coding-agent/src/session/session-tools.ts#getToolForEvalBridge`), sem alterar o catálogo |

## Implementation parts

- [nano/integration-mcp-bridge-routes.md](../nano/integration-mcp-bridge-routes.md)
