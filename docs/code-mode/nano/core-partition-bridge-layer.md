# Core — Partição e camada bridge-only — Nano

Parent: [micro/core-partition.md](../micro/core-partition.md)

## Code locators

- `packages/coding-agent/src/session/session-tools.ts#SessionTools` — registro e apresentação das
  tools; dono do slate `#enabledToolNames`.
- `packages/coding-agent/src/session/session-tools.ts#getActiveToolNames` — devolve o topo vivo
  (`host.agent.state.tools`), isto é, o wire do modelo.
- `packages/coding-agent/src/session/session-tools.ts#getEnabledToolNames` — slate "habilitado"
  (topo + mounts), consultado pelo bridge.
- `packages/coding-agent/src/session/session-tools.ts#getToolForEvalBridge` — resolve o nome no
  registro e devolve a tool já embrulhada pelo gate ACP.
- `packages/coding-agent/src/session/session-tools.ts#getEvalBridgeToolNames` — allowlist canônica
  do bridge.
- `packages/coding-agent/src/sdk.ts#createAgentSession` — aplica a partição antes de
  `setSessionActiveToolNames`.
- `packages/coding-agent/src/tools/xdev.ts#XDEV_KEEP_TOP_LEVEL` — precedente de "topo fixo" que o
  Code Mode estende.
- `packages/coding-agent/src/code-mode/partition.ts#CODE_MODE_TOP_LEVEL`
- `packages/coding-agent/src/code-mode/partition.ts#applyCodeModePartition`
- `packages/coding-agent/src/session/session-tools.ts#SessionTools.setBridgeOnlyToolNames`

## How it works

O `SessionTools` já separa duas noções: o **topo vivo** (`getActiveToolNames`, lido de
`agent.state.tools`) e o **habilitado** (`getEnabledToolNames`, slate iniciado na construção e
alimentado por mounts). O bridge consulta o habilitado; o wire do modelo usa o topo. Code Mode
explora essa separação adicionando uma terceira coleção, `bridgeOnly`, e nada mais:

1. `applyCodeModePartition(names, { pinned })` percorre a lista inicial. Nome em
   `CODE_MODE_TOP_LEVEL` ou em `pinned` vai para `topLevel`; todo o resto vai para `bridgeOnly`.
   Mounts do `xd://` são anexados a `bridgeOnly` e `mountedNames` é limpo, porque o transporte
   (`read`/`write`) deixa de estar no topo.
2. `sdk.ts` chama `setActiveToolNames(topLevel)` (o wire) e `setBridgeOnlyToolNames(bridgeOnly)`.
3. `SessionTools` mantém `bridgeOnly` num set próprio. `getEnabledToolNames` passa a devolver
   `slate ∪ bridgeOnly` (união, sem duplicatas), então `getToolForEvalBridge` acha a tool.
4. O wire continua sendo só `agent.state.tools`; `bridgeOnly` nunca é copiado para lá.

Assim `tool.edit(...)` dentro do `eval` executa pelo mesmo caminho da chamada direta — inclusive o
wrapper de aprovação, que `getToolForEvalBridge` aplica na hora de devolver a tool.

## Invariants

- `topLevel ∩ bridgeOnly = ∅`; a partição decide cada nome uma única vez.
- Todo nome em `bridgeOnly` aparece em `getEvalBridgeToolNames()` e resolve em
  `getToolForEvalBridge`.
- `eval` está sempre em `topLevel`; `checkpoint`, `rewind`, `yield`, `ask` e `todo` também, quando
  registrados.
- `getActiveToolNames()` nunca contém um nome que só existe em `bridgeOnly`.
- A partição não altera `systemPrompt`; o prompt é reconstruído apenas pela presença do bloco de
  Code Mode, não pela lista de tools.
- Remover um nome de `bridgeOnly` não pode reaparecê-lo no topo.

## Gotchas

- **Não reutilize `xdev.mountedNames`.** Mounts do `xd://` anunciam devices e exigem `read`/`write`
  top-level como transporte — exatamente o que o Code Mode retira. Reusar a coleção reintroduziria o
  transporte no wire.
- **Ordem importa.** Particione antes de `setSessionActiveToolNames`; particionar depois faz o slate
  engolir a lista cheia e o bridge perde a distinção.
- **`getEnabledToolNames` é usado por vários consumidores** (extensões, ACP, comandos de MCP). A
  união é necessária para o bridge; qualquer consumidor que **mutar** a lista precisa subtrair
  `bridgeOnly`, senão o wire volta cheio no próximo reconcile. Ver
  [nano/core-bridge-lifecycle-late-mcp.md](core-bridge-lifecycle-late-mcp.md).
- **`checkpoint`/`rewind` quebram no bridge.** O bridge os rejeita porque a sessão só os reconhece
  como `toolResult` direto; mantê-los no topo não é preferência estética.
- **Slate pegajoso.** `#enabledToolNames` é semeado na construção; se a partição rodar cedo demais,
  o slate registra a lista larga e o bridge acha tools que deveriam estar desabilitadas. Participe
  antes do seed ou substitua o slate de forma explícita.

## Tarefa de implementação

**Arquivos possuídos**

- `packages/coding-agent/src/code-mode/partition.ts` (novo)
- `packages/coding-agent/src/session/session-tools.ts`
- `packages/coding-agent/src/sdk.ts`

**Passos**

1. Em `partition.ts`, exporte `CODE_MODE_TOP_LEVEL` (array congelado, ordem fixa) e
   `applyCodeModePartition(names, opts)` devolvendo `{ topLevel, bridgeOnly }`.
2. Em `SessionTools`, adicione `setBridgeOnlyToolNames(names)`, `getBridgeOnlyToolNames()` e a união
   em `getEnabledToolNames`; mantenha `getActiveToolNames` intocado.
3. Em `createAgentSession`, quando a decisão planejada for `enabled`, particione `initialToolNames`
   com `presentationPinnedToolNames`, limpe `xdev.mountedNames` e passe as duas listas.
4. Rode o typecheck e o gate de `partition.test.ts`.

**Test IDs:** CM-P1, CM-P2, CM-P3 (nesta parte); CM-P4, CM-P5, CM-P7 no ciclo de vida.

**Done when:** `bun test --todo test/code-mode/partition.test.ts` lista como prontos exatamente
CM-P1..CM-P3, e `session.agent.state.tools` contém só o topo enquanto
`getToolForEvalBridge("edit")` devolve tool funcional.
