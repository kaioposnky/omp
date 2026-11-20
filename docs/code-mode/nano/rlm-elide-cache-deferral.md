# `elide` e adiamento por cache quente — Nano

Parent: [micro/rlm-elide.md](../micro/rlm-elide.md)

Code: `packages/agent/src/compaction/pruning.ts#blankToolResult` (função interna), `packages/agent/src/compaction/pruning.ts#PruneConfig`, `packages/agent/src/compaction/pruning.ts#pruneToolOutputs`, `packages/agent/src/compaction/pruning.ts#pruneSupersededToolResults`, `packages/coding-agent/src/tools/context-notes.ts#ContextNotesTool`, `packages/coding-agent/src/session/context-settings.ts#cfgCompactionExperimentalContextManagement`

## How it works

O pruning automático já resolve "apagar resultado de tool" com três salvaguardas: `protectedTools` (inclui `skill` e leituras de `skill://`), `keepBoundaryId` (não mexe antes do boundary de compactação) e `cacheWarmSuffixTokens` (não reescreve resultado cujo sufixo está dentro da janela de prompt cache). `blankToolResult` troca `content` por um aviso, marca `prunedAt` e devolve um `undo()`.

`elide({ toolCallIds, reason? })` reutiliza esse mecanismo:

1. Gate: só registra a tool com `compaction.experimentalContextManagement` ligado (mesmo gate de `context_notes`/`new_context`).
2. Resolve os `toolCallIds` para mensagens `toolResult`.
3. Recusa alvos antes de `keepBoundaryId` e alvos que são leitura de `skill://` (antecipando `protectedTools`).
4. Se o alvo está na janela de cache quente (`cacheWarmSuffixTokens` do próximo request), devolve "scheduled" — não blanka agora; entra na fila do próximo ponto seguro.
5. Caso contrário, blanka com `[Elided by model - N tokens]` (N = tokens economizados) e devolve um resumo.

O histórico continua recuperável: `history://` e artifacts não são tocados.

## Invariants

- `elide` nunca altera mensagens de user/assistant; só `toolResult`.
- `keepBoundaryId` é intocável, sempre.
- Leitura de `skill://` é intocável, sempre.
- Alvo na janela quente não é reescrito — no máximo agendado.
- `prunedAt` preenchido; `invalidateMessageCache` chamado (feito por `blankToolResult`).
- O aviso segue o formato `[Elided by model - N tokens]`.

## Gotchas

- `blankToolResult` é privada de `packages/agent`; exportá-la de lá é preferível a duplicar a lógica (duas implementações divergem em `undo`/cache).
- O `undo()` devolvido é do pass de pruning, não do `elide`: guardar steps do elide separadamente se a sessão precisar desfazer.
- Calcular N depois de blankar dá zero; capturar o token count antes.
- A janela de cache é do **próximo** request; usar a janela do request atual erra o adiamento por um turno.
- `elide` com vários ids deve ser atômico: se um id é inválido, não blankar nenhum (evita estado parcial).
- `[Elided by model - N tokens]` usa hífen, não meia-risca — o teste compara a string.

## Tarefa de implementação

- **Arquivos**: `packages/coding-agent/src/tools/context-notes.ts` (tool `elide`), `packages/agent/src/compaction/pruning.ts` (expor `blankToolResult` ou helper equivalente), `packages/coding-agent/src/session/context-settings.ts` (gate), `packages/coding-agent/src/prompts/tools/` (documentação da tool).
- **Passos**:
  1. Definir o schema `{ toolCallIds: string[]; reason?: string }` e o gate de setting.
  2. Implementar resolução de ids + recusas (`keepBoundaryId`, `skill://`).
  3. Implementar adiamento por janela quente antes de blankar.
  4. Emitir aviso no formato exato e devolver resumo com N tokens.
- **Test IDs**: `CM-R3`, `CM-R4`, `CM-R5` em `packages/coding-agent/test/code-mode/rlm.test.ts`.
- **Done when**: os três passam; com o gate desligado a tool não aparece em `session.agent.state.tools`.
