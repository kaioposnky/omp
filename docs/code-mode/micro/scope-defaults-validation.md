# Escopo — Defaults de fábrica e validação — Micro

Parent: [macro/scope.md](../macro/scope.md)

## Requirement statement

O escopo de fábrica mantém `sonic` e `scout` desligados e `smol`/`tiny` desligados, com main e task
herdando o default; settings inválidos são rejeitados na validação, enquanto nome de agente
desconhecido é aceito.

## Acceptance criteria

- [ ] **CM-S7** `packages/coding-agent/test/code-mode/scope.test.ts` — escopo padrão: `sonic`/`scout`
  off, `smol`/`tiny` off, `task` e main herdam o default.
- [ ] **CM-S8** `packages/coding-agent/test/code-mode/scope.test.ts` — validação de settings: glob
  inválido é rejeitado; nome de agente desconhecido é aceito.
- [ ] **CM-G6** `packages/coding-agent/test/code-mode/gap.test.ts` — gravar `codeMode.scope` pelo
  caminho do `Settings` usado pelo `/settings` (set + persistência) devolve `agents`, `roles` e
  `models` na mesma ordem gravada, e `resolveCodeMode` lê de volta a config persistida.

## Constraints

- Defaults de fábrica não podem ligar Code Mode em subagentes baratos — é a decisão que evita
  regressão de qualidade em modelos `smol`/`tiny`.
- `unknown agent name accepted`: o arquivo de settings pode citar agente que só existe em outro
  projeto ou que será criado depois; a validação não pode quebrar o omp por isso.
- Glob validado na escrita/leitura, não no uso: erro cedo e legível.
- Defaults e validação vivem em `src/code-mode/settings.ts` `[planned]`, não em código de sessão.
- Round-trip do `/settings`: a ordem de `models` é semântica (primeiro match vence), então set +
  persistência não podem reordenar nem deduplicar a lista; chaves desconhecidas de `agents`/`roles`
  sobrevivem à gravação.
- A validação roda na escrita e na leitura; um valor rejeitado não pode chegar parcialmente ao
  arquivo.

## Edge cases and failure modes

| Caso | Comportamento esperado |
| --- | --- |
| `models` com string em vez de array | Setting rejeitado com mensagem clara |
| `roles` com chave desconhecida | Aceita; nunca casa |
| `agents: { scout: true }` explícito | Sobrepõe o default de fábrica |
| `main` ausente | Herda `codeMode.default` |
| Config inteira ausente | Defaults de fábrica aplicados |

## Implementation parts

Não há parte não óbvia além do formato do registro de settings
(`packages/coding-agent/src/config/registry.ts#register`); o padrão é o de `cfgToolsXdev` em
`packages/coding-agent/src/tools/settings.ts#cfgToolsXdev`.
