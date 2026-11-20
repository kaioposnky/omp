# Core — Ciclo de vida da camada bridge-only — Micro

Parent: [macro/core.md](../macro/core.md)

## Requirement statement

A camada bridge-only sobrevive a MCP registrado depois do startup e a reconciles de
`setActiveToolsByName`, e o Code Mode se desliga — com wire igual ao modo normal — quando o backend
de `eval` não está disponível ou quando a aprovação não pode ser preservada. O bridge também honra o
plan mode: com plan mode ativo, `getToolForEvalBridge` só resolve as tools permitidas em modo
somente-leitura, sem desligar o Code Mode.

## Acceptance criteria

- [ ] **CM-P4** `packages/coding-agent/test/code-mode/partition.test.ts` — MCP registrado depois do
  startup (caminho `refreshMCPTools` / `setActiveToolsByName`) entra em bridge-only, não no wire.
- [ ] **CM-P5** `packages/coding-agent/test/code-mode/partition.test.ts` — reconcile no estilo
  `setActiveToolsByName([...topo, "goal"])` mantém a camada bridge-only: as tools continuam fora do
  wire e alcançáveis pelo bridge.
- [ ] **CM-P6** `packages/coding-agent/test/code-mode/partition.test.ts` — backend de `eval`
  indisponível + Code Mode pedido → wire igual ao modo normal e `isCodeModeActive() === false`.
- [ ] **CM-P7** `packages/coding-agent/test/code-mode/partition.test.ts` — com modo de aprovação
  ligado, uma chamada de `edit` feita por dentro do `eval` passa pelo wrapper ACP, com o mesmo
  comportamento e a mesma identidade de wrapper da chamada direta.
- [ ] **CM-G4** `packages/coding-agent/test/code-mode/gap.test.ts` — com plan mode ligado, o bridge
  alcança só as tools permitidas: `session.getToolForEvalBridge("edit")` é `undefined` enquanto
  `session.getToolForEvalBridge("read")` continua resolvendo, e o Code Mode segue ativo
  (`isCodeModeActive() === true`).

## Constraints

- Reconcile de tools não pode "devolver" ao wire uma tool que foi para bridge-only; remover uma tool
  bridge-only também não pode ressuscitá-la no topo.
- `setActiveToolsByName` do topo é imutável a partir de extensões e de MCP: a camada só cresce, e
  adições viram bridge-only.
- O fallback sem `eval` é silencioso do ponto de vista do modelo (wire normal), mas o motivo precisa
  estar na decisão (`hard-gate:no-eval`).
- Aprovação não pode ser contornada pelo caminho do bridge: `getToolForEvalBridge` devolve a tool já
  embrulhada.
- Plan mode também não pode ser contornado pelo bridge: o filtro de tools do plan mode
  (`planModeEnabled()` já exposto pelo host em
  `packages/coding-agent/src/session/session-tools.ts#SessionTools`) vale para
  `getToolForEvalBridge`, não só para a apresentação do topo.
- O filtro de plan mode não altera a decisão de Code Mode: o modo continua ativo e volta a alcançar
  tudo quando o plan mode é desligado.

## Edge cases and failure modes

| Caso | Comportamento esperado |
| --- | --- |
| MCP reconecta e re-registra a mesma tool | Continua bridge-only, sem duplicata no wire |
| Extensão tenta remover uma tool bridge-only | No-op; o bridge continua alcançando |
| Extensão tenta adicionar uma tool nova | Vira bridge-only; wire e `systemPrompt` intactos |
| Backend de `eval` cai no meio da sessão | Sessão não troca de modo; o estado é congelado na criação |
| Aprovação nega a chamada | Resultado de negação volta ao kernel como erro da tool, sem crash do `eval` |
| Plan mode ligado durante a sessão | O bridge passa a recusar tools de escrita; o wire não ganha tools e desligar o plan mode restaura o alcance |

## Implementation parts

- [nano/core-bridge-lifecycle-late-mcp.md](../nano/core-bridge-lifecycle-late-mcp.md) — ordem de
  registro, reconcile e fallback.
