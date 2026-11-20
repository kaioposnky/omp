# RLM — `elide` de resultados de tool — Micro

Parent: [macro/rlm.md](../macro/rlm.md)

## Requirement statement

A tool `elide` só é registrada com `compaction.experimentalContextManagement` ligado, substitui os resultados de tool alvo por `[Elided by model - N tokens]` sem tocar entradas anteriores a `keepBoundaryId` nem leituras de `skill://`, e devolve "scheduled" quando o alvo está na janela de cache quente.

## Acceptance criteria

- [ ] `elide` só é registrada com `compaction.experimentalContextManagement` ligado — `CM-R3`, `packages/coding-agent/test/code-mode/rlm.test.ts`.
- [ ] `elide` blanka os resultados de tool alvo com `[Elided by model - N tokens]` e nunca toca entradas anteriores a `keepBoundaryId` nem leituras de `skill://` — `CM-R4`, `packages/coding-agent/test/code-mode/rlm.test.ts`.
- [ ] `elide` devolve estado "scheduled" (adiado) quando o alvo está dentro da janela de lookback do cache quente — `CM-R5`, `packages/coding-agent/test/code-mode/rlm.test.ts`.

## Constraints

- Assinatura: `elide({ toolCallIds: string[]; reason?: string })` (contrato compartilhado).
- Mesmo gate de `context_notes`/`new_context`: `compaction.experimentalContextManagement` (`packages/coding-agent/src/session/context-settings.ts#cfgCompactionExperimentalContextManagement`).
- Reuso do blanking existente: `packages/agent/src/compaction/pruning.ts#blankToolResult` (função interna; preserva conteúdo para `undo()` e marca `prunedAt`).
- `keepBoundaryId` e `cacheWarmSuffixTokens` vêm de `packages/agent/src/compaction/pruning.ts#PruneConfig`; `skill` e leituras de `skill://` já são protegidas por `protectedTools` no prune automático (`DEFAULT_PRUNE_CONFIG`).
- O histórico continua recuperável via `history://` e artifacts; o elide não destrói informação (plano §6.2).

## Edge cases and failure modes

| Caso | Comportamento esperado |
|---|---|
| Gate desligado | Tool não registrada; chamada não existe |
| `toolCallIds` vazio | No-op (ou erro de validação), sem blankar nada |
| ID inexistente/ambíguo | Erro claro listando os IDs não encontrados; nada é blankado |
| Alvo é leitura de `skill://` | Recusado; conteúdo permanece |
| Alvo antes de `keepBoundaryId` | Recusado; nada muda |
| Alvo em janela quente de cache | Retorna "scheduled"; aplicação fica para o próximo ponto seguro |
| `undo` do prune automático depois do elide | Blanking do elide é independente; não pode ser desfeito pelo undo do prune |
| Reelide do mesmo ID | Idempotente: aviso substituído, contagem não duplica |

## Implementation parts

- [nano/rlm-elide-cache-deferral.md](../nano/rlm-elide-cache-deferral.md)
