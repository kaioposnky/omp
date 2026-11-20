# Rotas MCP no bridge — Nano

Parent: [micro/integration-mcp-catalog.md](../micro/integration-mcp-catalog.md)

Code: `packages/coding-agent/src/session/session-tools.ts#refreshMCPTools`, `packages/coding-agent/src/session/session-tools.ts#getToolForEvalBridge`, `packages/coding-agent/src/tools/xdev.ts#renderXdevPromptDocs`, `packages/coding-agent/src/prompts/system/mcp-xdev-guidance.md`, `packages/coding-agent/src/sdk.ts#collectPendingMCPToolNames`

## How it works

Hoje, com `tools.xdev` ligado, tools MCP são montadas como devices `xd://`: saem do schema e o prompt mostra o bloco "MCP Tool Routes" (`mcp-xdev-guidance.md`), que ensina `read xd://` e `write xd://<tool>`.

No Code Mode essa rota não existe: `read`/`write` não estão no top-level. O substituto é a camada bridge-only. `refreshMCPTools` (chamado no startup e a cada reload/descoberta tardia) registra as tools no registry e precisa colocá-las na camada bridge-only, não no wire. O prompt troca o bloco `xd://` pelo catálogo bridge-only. O modelo descobre schema por `tool.describe("mcp__server_tool")` e chama `tool.mcp__server_tool(args)`.

## Invariants

- Nenhuma tool MCP aparece em `session.agent.state.tools` em Code Mode.
- Toda tool MCP registrada é alcançável por `getToolForEvalBridge` (o gate usa `getEnabledToolNames`, que une a camada bridge-only).
- O bloco "MCP Tool Routes" nunca é emitido em Code Mode.
- Descoberta tardia não altera `session.systemPrompt` já emitido; o catálogo do próximo turno é reconstruído sem mudar o prefixo anterior (ver `nano/token-economy-prefix-freeze.md`).
- Nome canônico preservado: `mcp__<server>_<tool>` (e o alias com separador duplo continua resolvido por `resolveMCPToolAlias`).

## Gotchas

- `refreshMCPTools` substitui o conjunto inteiro de tools MCP; se a camada bridge-only for reconstruída a partir do wire, as tools somem no primeiro refresh.
- Se `read`/`write` permanecerem disponíveis por outro motivo (tool fixada), o bloco `xd://` ainda seria tecnicamente válido, mas emitir os dois caminhos duplica tokens e confunde a seleção — escolher um.
- Um servidor MCP cujo nome contenha `_` faz o parser de alias ambíguo; o catálogo deve listar nomes canônicos, não reconstruídos.
- `collectPendingMCPToolNames` inclui tools MCP explicitamente pedidas por `--tools`; em Code Mode elas continuam bridge-only, mesmo pedidas explicitamente.

## Tarefa de implementação

- **Arquivos**: `packages/coding-agent/src/session/session-tools.ts` (camada bridge-only em `refreshMCPTools`/`setActiveToolsByName`), `packages/coding-agent/src/sdk.ts` (seleção do bloco de prompt), `packages/coding-agent/src/prompts/system/` (texto do catálogo), `packages/coding-agent/src/code-mode/catalog.ts`.
- **Passos**:
  1. Ao aplicar refresh MCP com Code Mode ativo, registrar as tools e adicioná-las a `#bridgeOnlyToolNames` (nunca a `#enabledToolNames` top-level).
  2. Suprimir `renderXdevPromptDocs` no caminho MCP e emitir `renderBridgeCatalog`.
  3. Garantir que o rebuild não altere a ordem do catálogo já enviado.
- **Test IDs**: `CM-C3` em `packages/coding-agent/test/code-mode/skills-mcp.test.ts`; regressões de cache ficam em `CM-E1`.
- **Done when**: `CM-C3` passa, e um refresh MCP tardio deixa `session.systemPrompt` inalterado.
