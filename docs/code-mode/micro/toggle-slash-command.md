# Toggle — Comando `/code-mode` — Micro

Parent: [macro/toggle.md](../macro/toggle.md)

## Requirement statement

`/code-mode` existe com os subcomandos `on`, `off`, `status`, `default on` e `default off`, e
`on`/`off` nunca alteram o wire de uma conversa em andamento: numa sessão com mensagens abrem uma
sessão nova; numa sessão vazia aplicam nela.

## Acceptance criteria

- [ ] **CM-T5** `packages/coding-agent/test/code-mode/toggle.test.ts` — o spec `/code-mode` está em
  `BUILTIN_MODE_SLASH_COMMANDS` com os subcomandos `on`, `off`, `status` e `default`.
- [ ] **CM-T6** `packages/coding-agent/test/code-mode/toggle.test.ts` — `/code-mode on` numa sessão
  com mensagens não muda o wire da sessão atual (abre uma sessão nova); numa sessão vazia, aplica na
  própria sessão.

## Constraints

- Seguir o padrão do `/fast` em `packages/coding-agent/src/slash-commands/builtin-modes.ts`:
  `handle`, `handleTui`, `getTuiAutocompleteDescription` e `refreshStatusLine`.
- `default on|off` grava o setting persistente e **não** mexe na sessão atual.
- `status` mostra estado efetivo, origem da decisão, contagem de tools bridge-only e, quando houver,
  o motivo de negação.
- Nenhum subcomando pode aplicar a mudança "pela metade": ou a sessão nova nasce com o estado, ou a
  sessão vazia é atualizada por inteiro.

## Edge cases and failure modes

| Caso | Comportamento esperado |
| --- | --- |
| `/code-mode` sem argumento | Equivale a `status` |
| Subcomando desconhecido | Mensagem de uso; nenhum estado alterado |
| `/code-mode on` já ativo em sessão com mensagens | Abre sessão nova no mesmo estado, sem duplicar |
| Backend de `eval` ausente | `on` reporta o gate duro e mantém a sessão em modo normal |
| `default off` durante sessão ativa | Sessão atual intacta; próximas sessões herdam `false` |

## Implementation parts

- [nano/toggle-slash-command-freeze.md](../nano/toggle-slash-command-freeze.md) — por que a mudança
  abre sessão nova, quando aplica no lugar e como isso interage com o estado congelado.
