# Integração — Guarda do `setActiveTools` de extensões — Micro

Parent: [macro/integration.md](../macro/integration.md)

## Requirement statement

Em Code Mode, `pi.setActiveTools(...)` vindo de uma extensão nunca altera o conjunto top-level nem o system prompt: adições entram na camada bridge-only, remoções de tools bridge-only são no-op, e a extensão consegue consultar `pi.isCodeModeActive()` para decidir sozinha.

## Acceptance criteria

- [ ] Extensão chama `pi.setActiveTools` sem uma tool MCP ativa → a tool MCP continua alcançável por `session.getToolForEvalBridge(...)` e o wire (`session.agent.state.tools`) não muda — `CM-C4`, `packages/coding-agent/test/code-mode/skills-mcp.test.ts`.
- [ ] Extensão chama `pi.setActiveTools` incluindo uma tool extra → a tool fica alcançável pelo bridge, ausente do wire, e `session.systemPrompt` permanece inalterado — `CM-C5`, `packages/coding-agent/test/code-mode/skills-mcp.test.ts`.
- [ ] `pi.isCodeModeActive()` existe na ExtensionAPI e reflete o estado da sessão — `CM-C6`, `packages/coding-agent/test/code-mode/skills-mcp.test.ts`.
- [ ] Uma chamada bridgeada (`tool.edit`/`tool.read`) feita de dentro de uma célula do `eval` dispara o hook `tool_call` da extensão exatamente uma vez, com `toolName` da tool interna e nunca `eval` — `CM-G5`, `packages/coding-agent/test/code-mode/gap.test.ts`.

## Constraints

- RF6.3: adicionar nomes → camada bridge-only; remover nomes bridge-only → no-op; o top-level (`eval`, `wait`, `yield`, `ask`, `todo`, `checkpoint`, `rewind`) não pode ser removido por extensão.
- Toda decisão de guarda deve registrar um aviso de debug com a origem da chamada (RF6.3).
- O wrapper de `setActiveTools` já espera a barreira de registro de tools antes de aplicar (`packages/coding-agent/src/extensibility/extensions/runner.ts#ExtensionRunner.initialize`); a guarda entra nesse ponto único.
- O estado do Code Mode é congelado na criação da sessão (`packages/coding-agent/src/session/agent-session.ts#isCodeModeActive`), então a guarda não pode ser reavaliada por prompt.
- A emissão de `tool_call` já é deduplicada por `${toolCallId}:${toolName}` (`packages/coding-agent/src/extensibility/extensions/runner.ts#ExtensionRunner.markToolCallEmitted`); o despacho bridgeado reusa o `toolCallId` do `eval` com o nome da tool interna, então a chave composta é o que garante um evento só — `eval` não pode engolir nem duplicar o hook.

## Edge cases and failure modes

| Caso | Comportamento esperado |
|---|---|
| Extensão tenta remover `eval` | Remoção ignorada; o wire continua com `eval` |
| Extensão chama `setActiveTools([])` | Nenhuma tool bridge-only é desmontada; o wire continua igual |
| Tool adicionada já era top-level | Continua top-level; nada muda |
| Extensão antiga que não conhece `isCodeModeActive` | Continua chamando `setActiveTools`; a guarda protege o wire de qualquer forma |
| MCP removido por `McpGate` no fork do jev sem os ajustes de RF6.5 | `tool.mcp__x()` continua funcionando porque a remoção é no-op (AT10) |

## Implementation parts

- [nano/integration-set-active-tools-guard.md](../nano/integration-set-active-tools-guard.md)
