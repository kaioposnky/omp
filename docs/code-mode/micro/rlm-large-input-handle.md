# RLM — Entrada grande como handle — Micro

Parent: [macro/rlm.md](../macro/rlm.md)

## Requirement statement

Com `input.largeInputAsHandle` configurado, um paste ou anexo acima do limite de tokens é gravado como `local://paste-N.md` e o prompt carrega apenas o handle, o tamanho aproximado e a chave correspondente em `inputs`, que o prelude do eval expõe de forma lazy.

## Acceptance criteria

- [ ] Paste acima de `input.largeInputAsHandle` vira `local://paste-N.md` e o prompt leva apenas handle + tamanho — `CM-R1`, `packages/coding-agent/test/code-mode/rlm.test.ts`.
- [ ] O prelude do `eval` expõe `inputs["paste-N"]` de forma lazy (o conteúdo não é carregado na criação do kernel) — `CM-R2`, `packages/coding-agent/test/code-mode/rlm.test.ts`.

## Constraints

- O caminho de gravação já existe em `packages/coding-agent/src/modes/controllers/input-controller.ts#attachPasteAsFile`, que grava em `local://` espelhando o resolvedor do `read` — falta aplicá-lo automaticamente acima do limite, sem menu.
- Texto entregue ao modelo: `local://paste-3.md (≈1.8M tokens, 41k linhas). Disponível no eval como inputs["paste-3"].` (plano §6.1).
- `inputs` é um mapa lazy: `read()` sob demanda, sem carregar conteúdo na criação do kernel; vale para JS e Python.
- Só faz sentido com eval disponível; fora do Code Mode o setting pode existir, mas o benefício depende do kernel.
- O handle não substitui o arquivo no disco: `read local://paste-N.md` continua funcionando.

## Edge cases and failure modes

| Caso | Comportamento esperado |
|---|---|
| Paste abaixo do limite | Inline como hoje; nenhum handle criado |
| Limite `0` / não configurado | Recurso desligado; comportamento atual |
| Falha ao gravar o arquivo | Fallback para marcador de paste inline; conteúdo nunca é perdido (`#attachPasteAsFile`) |
| `inputs["paste-9"]` inexistente | Erro claro de chave ausente, não `undefined` silencioso |
| Dois pastes no mesmo turno | Handles distintos (`paste-N`, `paste-N+1`), ordem preservada |
| `inputs` acessado após compactação | Handle continua válido (aponta para arquivo do session store) |

## Implementation parts

- [nano/rlm-large-input-handles.md](../nano/rlm-large-input-handles.md)
