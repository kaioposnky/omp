# Core — Ciclo de vida: MCP tardio e reconcile — Nano

Parent: [micro/core-bridge-lifecycle.md](../micro/core-bridge-lifecycle.md)

## Code locators

- `packages/coding-agent/src/sdk.ts#collectPendingMCPToolNames` — nomes de MCP pendentes no startup.
- `packages/coding-agent/src/sdk.ts` — caminho de reconcile de MCP por volta da linha 5028
  (`setActiveToolPresentation`), que precisa consultar a decisão de Code Mode.
- `packages/coding-agent/src/session/session-tools.ts#refreshMCPTools` — registro de tools MCP
  descobertas em runtime.
- `packages/coding-agent/src/session/session-tools.ts#setActiveToolsByName` — reconcile de tools
  ativas (goal mode, extensões, ACP).
- `packages/coding-agent/src/session/session-tools.ts#getToolForEvalBridge` — resolução já embrulhada
  pelo gate ACP.
- `packages/coding-agent/src/tools/eval-backends.ts` — disponibilidade do backend de `eval`.
- `packages/coding-agent/src/session/session-tools.ts#SessionTools.setBridgeOnlyToolNames`
- `packages/coding-agent/src/sdk.ts` — checagem de `isCodeModeActive()` no reconcile.

## How it works

Três caminhos chegam depois da partição inicial e cada um pode desfazer a camada:

1. **MCP pendente no startup.** `collectPendingMCPToolNames` alimenta a lista inicial; se o nome
   entrar em `topLevel`, o wire ganha a tool. Em Code Mode, nomes MCP vão direto para `bridgeOnly`.
2. **MCP descoberto em runtime.** `refreshMCPTools` registra tools novas e reconcilia. Em Code Mode
   as novas precisam ir para `bridgeOnly` **e** permanecer em `getEnabledToolNames`, senão o bridge
   não as acha.
3. **Reconcile de tools ativas.** `setActiveToolsByName` é chamado por goal mode
   (`packages/coding-agent/src/modes/interactive-mode.ts`), extensões e ACP. Em Code Mode:
   - nomes que já estão em `bridgeOnly` são removidos do pedido de remoção (no-op);
   - nomes novos que não são top-level viram `bridgeOnly`;
   - `topLevel` é imutável a partir desses chamadores;
   - `systemPrompt` e `agent.state.tools` não mudam.

O fallback sem backend é verificado no caminho de criação: se `eval` não está disponível, a decisão
vira `enabled: false` com `source: "hard-gate:no-eval"` e a sessão nasce com o slate normal. O bridge
continua aplicando aprovação porque `getToolForEvalBridge` chama `#wrapToolForAcpPermission` antes de
devolver.

## Invariants

- Toda tool MCP registrada com Code Mode ativo termina no bridge, nunca no wire.
- `setActiveToolsByName` não altera `getActiveToolNames()` para nomes bridge-only.
- Reconcile idempotente: chamar duas vezes com a mesma lista não muda o wire nem duplica bridge-only.
- Fallback sem `eval` deixa o wire **igual** ao modo normal — não uma versão reduzida.
- `getToolForEvalBridge` mantém o wrapper ACP em todas as resoluções, inclusive as que nasceram de
  MCP tardio.

## Gotchas

- **MCP com `read`/`write` de transporte.** O bloco de rotas `xd://` do prompt não faz sentido em
  Code Mode; o catálogo do bridge substitui. Se o bloco continuar sendo renderizado, o modelo tenta
  paths `xd://` sem `read` no topo.
- **Reconcile chama `setActiveToolsByName` com a lista viva.** Se a união de `getEnabledToolNames`
  for usada como entrada, o pedido "reativa" tools bridge-only no topo. A entrada de reconcile deve
  ser `getActiveToolNames()`, não a união.
- **Refresh de MCP durante streaming.** Adicionar ao bridge é barato; rebuild de prompt no meio do
  stream quebra o prefixo. Só o catálogo/sufixo pode mudar.
- **Denúncia de negação.** Quando o spawn pede Code Mode e o gate duro barra, o motivo precisa
  chegar ao modelo em texto (`codeMode ignored: agent has no eval`), não só no log.

## Tarefa de implementação

**Arquivos possuídos**

- `packages/coding-agent/src/session/session-tools.ts`
- `packages/coding-agent/src/sdk.ts`

**Passos**

1. Em `refreshMCPTools`, quando Code Mode estiver ativo, registre os nomes e adicione-os a
   `bridgeOnly`; garanta que o wire não receba nada.
2. Em `setActiveToolsByName`, filtre remoções de bridge-only, redirecione adições para
   `bridgeOnly` e mantenha o topo imutável.
3. Em `createAgentSession`, cheque o backend de `eval` antes de aplicar a partição; se indisponível,
   mantenha o slate normal e registre `hard-gate:no-eval`.
4. Rode o typecheck e o gate de `partition.test.ts`.

**Test IDs:** CM-P4, CM-P5, CM-P6, CM-P7.

**Done when:** `bun test --todo test/code-mode/partition.test.ts` marca CM-P4..CM-P7 como prontos e a
execução sem `--todo` fica verde.
