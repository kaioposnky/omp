# Guarda do `setActiveTools` — Nano

Parent: [micro/integration-extension-active-tools.md](../micro/integration-extension-active-tools.md)

Code: `packages/coding-agent/src/extensibility/extensions/runner.ts#ExtensionRunner.initialize`, `packages/coding-agent/src/extensibility/extensions/types.ts#ExtensionAPI`, `packages/coding-agent/src/extensibility/extensions/types.ts#SetActiveToolsHandler`, `packages/coding-agent/src/session/session-tools.ts#setActiveToolsByName`, `packages/coding-agent/src/session/session-tools.ts#getEnabledToolNames`, `packages/coding-agent/src/session/session-tools.ts#applyExtensionActiveTools`

## How it works

Toda extensão passa por um único objeto `runtime`: `ExtensionRunner.initialize` copia `actions.setActiveTools` para `this.runtime.setActiveTools`, depois de esperar a barreira de registro de tools. É esse função que precisa consultar o estado do Code Mode.

Com Code Mode ativo:

1. `added = next − currentActive` (nomes que a extensão quer ligar) → entram na camada bridge-only (campo `#bridgeOnlyToolNames`, paralelo a `xdev.mountedNames`).
2. `removed = currentActive − next` → para nomes bridge-only, no-op; para nomes top-level, ignorado (o top-level é imutável).
3. O wire (`agent.state.tools`) e o system prompt não são tocados.
4. Registrar um aviso de debug com a origem da chamada (nome da extensão/quando disponível).

O gate de permissão continua sendo aplicado por `getToolForEvalBridge`, que consulta `getEnabledToolNames()` — logo, a união `base ∪ mountedNames ∪ bridgeOnlyToolNames` preserva o comportamento de aprovação para chamadas via bridge (mesmo wrapper, `CM-P7`).

## Invariants

- `getEnabledToolNames()` é a fonte única de "existe na sessão"; o wire é apenas apresentação.
- A camada bridge-only sobrevive a `setActiveTools` (assim como os mounts `xd://` sobrevivem a reconcile).
- Nenhuma remoção vinda de extensão apaga uma tool bridge-only.
- O top-level (`CODE_MODE_TOP_LEVEL`) é imutável para extensões.
- `isCodeModeActive()` é congelado na criação da sessão: a guarda não reavalia settings a cada chamada.

## Gotchas

- `setActiveTools` pode chegar antes do fim do registro de tools; a guarda roda depois da barreira (`#toolRegistrationBarrier`), não antes.
- Filtrar `removed` contra `getActiveToolNames()` (wire) em vez de `getEnabledToolNames()` faz a tool MCP parecer removida e some do bridge — bug exato de AT10.
- Chamar `setActiveToolsByName` internamente para "reaplicar" a lista depois da guarda pode desmontar a camada bridge-only se `setActiveToolsByName` não a preservar (o mesmo cuidado que já existe com mounts).
- Em modo normal, a guarda precisa ser exatamente o caminho atual: nenhuma mudança de comportamento sem Code Mode.

## Tarefa de implementação

- **Arquivos**: `packages/coding-agent/src/session/session-tools.ts`, `packages/coding-agent/src/extensibility/extensions/runner.ts`, `packages/coding-agent/src/extensibility/extensions/types.ts`.
- **Passos**:
  1. Adicionar `#bridgeOnlyToolNames` e incluí-lo em `getEnabledToolNames()`/`getEvalBridgeToolNames()`.
  2. Preservar a camada em `setActiveToolsByName`/reconcile (mesmo tratamento dado a `mountedNames`).
  3. No `runtime.setActiveTools`, bifurcar por `isCodeModeActive()`: normal → caminho atual; Code Mode → delta para bridge-only, remoções no-op, aviso de debug.
  4. Adicionar `isCodeModeActive()` à `ExtensionAPI` (implementação em `runner.ts`).
- **Test IDs**: `CM-C4`, `CM-C5`, `CM-C6` em `packages/coding-agent/test/code-mode/skills-mcp.test.ts`.
- **Done when**: os três testes passam; um teste de fumaça em modo normal mostra `setActiveTools` idêntico ao de hoje.
