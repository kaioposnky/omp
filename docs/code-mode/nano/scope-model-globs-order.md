# Escopo — Ordem dos globs de modelo — Nano

Parent: [micro/scope-model-globs.md](../micro/scope-model-globs.md)

## Code locators

- `[planned] packages/coding-agent/src/code-mode/settings.ts#cfgCodeModeScope` — registro do setting
  com `validate` e o array `models` ordenado.
- `[planned] packages/coding-agent/src/code-mode/scope.ts#resolveCodeMode` — degrau `scope.models`.
- `[planned] packages/coding-agent/src/code-mode/scope.ts#matchModelGlob` — casamento de um padrão
  contra `provider/id`.
- `packages/coding-agent/src/config/registry.ts#register` — padrão de registro/validação de setting
  (referência: `packages/coding-agent/src/tools/settings.ts#cfgToolsXdev`).
- `packages/coding-agent/src/task/structured-subagent.ts` — ponto em que o modelo já resolvido é
  passado à decisão.

## How it works

`codeMode.scope.models` é um array de `{ match, enabled }`. A semântica é deliberadamente simples:

- o alvo é a string `provider/id` do modelo resolvido (por exemplo `anthropic/claude-haiku-5-5`);
- `*` casa qualquer sequência (inclusive `/`), `?` casa um caractere; não há classes nem `**`;
- o padrão é ancorado no início e no fim — `haiku` não casa, `*haiku*` casa;
- o array é percorrido na ordem do arquivo e o **primeiro** match decide; os seguintes são ignorados;
- sem match, a decisão cai para `scope.roles`.

A validação do setting é separada do casamento: no parse, cada `match` é uma string não vazia e cada
`enabled` um boolean; um padrão degenerado (string vazia, escapes inválidos) é rejeitado com erro
legível. Nome de agente desconhecido, por contraste, é aceito — o arquivo pode ser compartilhado
entre projetos.

Preservar a ordem é requisito, não detalhe: `[{ "*haiku*": false }, { "9router/cc/*": true }]` e o
array invertido dão decisões diferentes para um modelo que casa os dois padrões.

## Invariants

- O primeiro padrão que casa define o resultado; nenhum match posterior o sobrescreve.
- O alvo é sempre `provider/id`, nunca o alias de role nem o nome amigável.
- `scope.agents` tem prioridade sobre `scope.models`; `scope.models` tem prioridade sobre
  `scope.roles`.
- `modelId` ausente pula o degrau inteiro.
- A validação não reordena, não deduplica e não normaliza os padrões.

## Gotchas

- **Ordenar o array "para ficar bonito"** muda a decisão do usuário. O settings deve preservar a
  ordem do YAML.
- **Case sensitivity.** `*Haiku*` não casa `haiku`; documente e não normalize silenciosamente.
- **Glob sobre alias.** Se o alvo virar `sonnet` (role) em vez de `provider/id`, `*haiku*` deixa de
  casar e o usuário perde a regra sem erro.
- **Regex acidental.** Implementar com `new RegExp(match)` faz `.` e `(` virarem metacaracteres;
  converta só `*`/`?` e escape o resto.
- **Validação tarde demais.** Validar no uso faz o erro aparecer no spawn, longe do arquivo; valide
  no registro do setting.
- **Array vazio** é válido e significa "nenhuma regra de modelo".

## Tarefa de implementação

**Arquivos possuídos**

- `packages/coding-agent/src/code-mode/settings.ts`
- `packages/coding-agent/src/code-mode/scope.ts`

**Passos**

1. Registre `codeMode.scope` com `models` como array de objetos e `validate` que rejeita padrão
   inválido sem reordenar.
2. Implemente `matchModelGlob(pattern, modelId)` convertendo `*`/`?` para regex ancorada e escapando
   o resto.
3. No degrau `scope.models`, percorra o array e retorne no primeiro match, com `detail` contendo o
   padrão casado.
4. Rode `bun test --todo test/code-mode/scope.test.ts` e confirme CM-S4 e CM-S5 prontos.

**Test IDs:** CM-S4, CM-S5 (e CM-S8 para a validação).

**Done when:** `*haiku*` casa `anthropic/claude-haiku-5-5`, a ordem do array decide conflitos e role
só entra quando nenhum padrão casou.
