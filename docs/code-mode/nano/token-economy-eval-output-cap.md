# Limite de output inline do `eval` — Nano

Parent: [micro/token-economy-output-discipline.md](../micro/token-economy-output-discipline.md)

Code: `packages/coding-agent/src/eval/js/executor.ts#executeJs`, `packages/tui/src/tools/streaming-output.ts#OutputSink`, `packages/tui/src/tools/streaming-output.ts#DEFAULT_MAX_BYTES`, `packages/coding-agent/src/tools/output-meta.ts#resolveOutputSinkHeadBytes`, `packages/coding-agent/src/tools/settings.ts#cfgToolsArtifactSpillThreshold`, `packages/coding-agent/src/tools/settings.ts#cfgToolsArtifactHeadBytes`, `packages/coding-agent/src/eval/js/shared/prelude.txt#read`

## How it works

`executeJs` monta um `OutputSink` com `spillThreshold` e `headBytes`. Hoje o threshold é a constante `DEFAULT_MAX_BYTES` (50 KB) e o head vem das settings (`tools.artifactSpillThreshold`, `tools.artifactHeadBytes`, em KB). O sink mantém até o threshold inline e grava o excedente em artifact, com rodapé `[raw output: artifact://N]`; o prelude `read` reconhece `local://N.log`.

Em Code Mode, o executor recebe um override de orçamento (ex.: 4 KB de corpo inline) e repassa ao sink; o artifact continua com o teto atual (`ARTIFACT_DEFAULT_MAX_BYTES`, 16 MiB). O kernel Python usa a mesma política via o executor equivalente — a regra é do perfil, não da linguagem.

## Invariants

- `eval` em Code Mode nunca devolve mais bytes inline que o limite do perfil.
- O artifact contém o output completo (até o teto do artifact).
- `read("local://N.log")` recupera o conteúdo gravado.
- Resultados de `tool.*` não são impressos por padrão; o limite se aplica apenas ao que o código imprime/retorna.
- O modo normal mantém o limite atual (50 KB de threshold; head conforme settings).

## Gotchas

- `resolveOutputSinkHeadBytes` só resolve `headBytes`; o `spillThreshold` está hardcoded em `executeJs` — o override precisa tocar os dois, senão o corpo continua grande e só o head muda.
- Truncar por caracteres em vez de bytes estoura o orçamento em conteúdo UTF-8; o sink já trunca por bytes e em code point (`truncateHeadBytes`).
- O rodapé do artifact conta no orçamento inline; medir o corpo sem o rodapé faz o teste de "menor que o normal" passar por acidente.
- Sessões sem artifacts dir: o sink cai no truncamento com aviso; o comportamento precisa ser o mesmo em Code Mode (nunca perder saída silenciosamente).
- `executeJs` também serve o modo normal; o override não pode ser global.

## Tarefa de implementação

- **Arquivos**: `packages/coding-agent/src/eval/js/executor.ts`, executor Python equivalente, `packages/coding-agent/src/eval/backend.ts` (passar o orçamento), `packages/coding-agent/src/code-mode/settings.ts` (se o limite for setting) ou constante do perfil.
- **Passos**:
  1. Propagar um `inlineOutputBytes`/`spillThreshold` do perfil Code Mode para o executor.
  2. Aplicar no `OutputSink` (threshold **e** head) sem afetar o modo normal.
  3. Garantir que o rodapé `[raw output: local://N.log]` é emitido e legível pelo prelude.
  4. Instruir no prompt do eval: atribuir à variável e imprimir resumo/contagem/amostra.
- **Test IDs**: `CM-E6` em `packages/coding-agent/test/code-mode/token-economy.test.ts`.
- **Done when**: o teste passa comparando os dois modos no mesmo fixture, com artifact verificado.
