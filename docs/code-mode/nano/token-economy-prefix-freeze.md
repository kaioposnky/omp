# Congelamento do prefixo — Nano

Parent: [micro/token-economy-prefix-freeze.md](../micro/token-economy-prefix-freeze.md)

Code: `packages/coding-agent/src/system-prompt.ts#buildSystemPrompt`, `packages/coding-agent/src/sdk.ts#setSessionActiveToolNames`, `packages/coding-agent/src/session/session-tools.ts#getActiveToolNames`, `packages/coding-agent/src/session/session-tools.ts#getEnabledToolNames`, `packages/coding-agent/src/extensibility/extensions/runner.ts#ExtensionRunner.initialize`

## How it works

O prefixo é o par (system prompt, schemas no wire). Ele é construído uma vez, em `sdk.ts`, depois da partição inicial: `setSessionActiveToolNames(initialToolNames)` e `buildSystemPrompt(...)`. Em Code Mode, `initialToolNames` é apenas o top-level; todo o resto vai para a camada bridge-only, que **não** participa do wire.

A extensão muta a camada bridge-only. Como `getActiveToolNames()` lê `agent.state.tools` (wire), a guarda nunca deve reescrever essa lista; e `getEnabledToolNames()` (união base + mounts + bridge-only) é o que o bridge consulta. Resultado: N chamadas de `setActiveTools` produzem zero mudança em `P`.

## Invariants

- `session.systemPrompt` é string idêntica do primeiro ao último request da sessão (salvo troca de sessão).
- O array de schemas no wire mantém ordem e conteúdo.
- A camada bridge-only pode crescer sem tocar em `P`.
- Rebuild por descoberta tardia de MCP não altera o catálogo já emitido: a próxima mensagem usa o catálogo congelado; a tool nova é encontrada por `tool.search`.

## Gotchas

- Qualquer chamada a `setActiveToolsByName` que reordene `initialToolNames` (ex.: alfabetizar) muda o prefixo mesmo sem adicionar/remover tool.
- `buildSystemPrompt` pode ser chamado de novo por resize/reload; se ele recalcular o catálogo a partir de `getEnabledToolNames()` ordenado de forma instável (Set de inserção), o prefixo muda.
- O aviso de debug da guarda não pode ser escrito no transcript como mensagem de sistema — mensagem extra antes do próximo request também invalida cache.
- Medir "byte-idêntico" no fixture `tan-tool-presentation` exige desligar relógio/IDs voláteis no prompt (o teste compara strings; qualquer timestamp injetado quebra).
- `CM-E1` mede N chamadas; usar N pequeno mas suficiente para cobrir add/remove e MCP tardio.

## Tarefa de implementação

- **Arquivos**: `packages/coding-agent/src/session/session-tools.ts` (mutação só na camada bridge-only), `packages/coding-agent/src/extensibility/extensions/runner.ts` (guarda), `packages/coding-agent/src/code-mode/catalog.ts` (ordenação estável).
- **Passos**:
  1. Garantir que a guarda de `setActiveTools` nunca chame `setSessionActiveToolNames`.
  2. Ordenar o catálogo por nome canônico no momento da construção e manter essa ordem em rebuilds.
  3. Expor no teste o par (systemPrompt, schemas) e comparar antes/depois de N chamadas.
- **Test IDs**: `CM-E1` em `packages/coding-agent/test/code-mode/token-economy.test.ts`.
- **Done when**: o teste passa com N ≥ 3 chamadas mistas (add tool, remove bridge-only, MCP tardio).
