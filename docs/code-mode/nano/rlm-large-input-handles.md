# Handles de entrada grande — Nano

Parent: [micro/rlm-large-input-handle.md](../micro/rlm-large-input-handle.md)

Code: `packages/coding-agent/src/modes/controllers/input-controller.ts#attachPasteAsFile`, `packages/coding-agent/src/eval/js/shared/prelude.txt#read`, `packages/coding-agent/src/internal-urls/local-protocol.ts`, `[planned] packages/coding-agent/src/code-mode/settings.ts#cfgInputLargeInputAsHandle`

## How it works

`#attachPasteAsFile` já grava o texto em `local://paste-N.md`, espelhando o resolvedor de `local://` do `read` (`resolveLocalRoot`), e insere a referência no editor. O que falta é o disparo automático: quando o texto colado ou o arquivo anexado excede `input.largeInputAsHandle` (em tokens), o controller chama o mesmo caminho sem abrir o menu, e o texto injetado no prompt vira o resumo:

```
local://paste-3.md (≈1.8M tokens, 41k linhas). Disponível no eval como inputs["paste-3"].
```

No prelude, `inputs` `[planned]` será um mapa lazy: cada chave resolve para um leitor que chama a tool `read` sob demanda (mesmo `readToolText`/`callHelper` já usados por `read`). Nada é carregado na criação do kernel; `Object.keys(inputs)` não lê conteúdo.

## Invariants

- O conteúdo do paste nunca aparece inline quando o limite dispara.
- O arquivo em `local://paste-N.md` é a fonte da verdade; o handle e `inputs` só apontam para ele.
- `read("local://paste-N.md")` e `inputs["paste-N"]()` devolvem o mesmo texto.
- A numeração é sequencial por sessão e não reutiliza N.
- Sem eval, o handle ainda é gravável/legível por `read`, mas `inputs` não existe.

## Gotchas

- `#attachPasteAsFile` é privado e depende do `InputController` (TUI); o disparo automático precisa de um ponto que também cubra anexos e pastes não interativos (CLI/print mode).
- O resumo com `≈` e contagem de linhas é parte da mensagem ao modelo; se o cálculo falhar, não inventar número — omitir a estimativa.
- Contar tokens antes de gravar pode custar caro em pastes enormes; contar linhas/bytes é O(n) aceitável, tokenizar o texto inteiro não é obrigatório para decidir.
- `inputs` lazy não pode capturar o conteúdo em closure (vazaria memória); guardar só o caminho.
- Em Python, `inputs` deve ser um objeto que devolve callable/awaitable de forma consistente com o prelude Python existente, não um dict com strings já lidas.

## Tarefa de implementação

- **Arquivos**: `packages/coding-agent/src/code-mode/settings.ts` (`cfgInputLargeInputAsHandle`), `packages/coding-agent/src/modes/controllers/input-controller.ts` (disparo automático), `packages/coding-agent/src/eval/js/shared/prelude.ts` + `prelude.txt` (`inputs`), prelude Python equivalente, `packages/coding-agent/src/internal-urls/local-protocol.ts` (se precisar de leitura por chave).
- **Passos**:
  1. Registrar o setting (threshold em tokens; 0/ausente desliga).
  2. No caminho de paste/anexo, medir e chamar o mesmo gravador de `#attachPasteAsFile` sem menu.
  3. Injetar o resumo com handle + estimativa no prompt.
  4. Expor `inputs` lazy no prelude JS e Python.
- **Test IDs**: `CM-R1`, `CM-R2` em `packages/coding-agent/test/code-mode/rlm.test.ts`.
- **Done when**: ambos passam; um paste abaixo do limite continua inline e `inputs` não aparece no prompt.
