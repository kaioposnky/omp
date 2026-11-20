# Escopo — Gates duros — Micro

Parent: [macro/scope.md](../macro/scope.md)

## Requirement statement

Nenhum override liga o Code Mode quando um gate duro falha: sem backend de `eval`, frontmatter do
agente com lista de tools que não inclui `eval`, ou lista restrita sem `eval` resultam em decisão
desligada com motivo explícito.

## Acceptance criteria

- [ ] **CM-S2** `packages/coding-agent/test/code-mode/scope.test.ts` — gate de "sem eval" vence até
  o override de sessão (`hard-gate:no-eval`).
- [ ] **CM-S3** `packages/coding-agent/test/code-mode/scope.test.ts` — frontmatter do agente com
  `tools` sem `eval` desliga o modo com `source` `hard-gate:agent-tools`, mesmo com override de spawn
  verdadeiro, e `denied.reason` contém "no eval".
- [ ] **CM-S10** `packages/coding-agent/test/code-mode/scope.test.ts` — lista restrita de tools sem
  `eval` desliga com `hard-gate:restricted`.

## Constraints

- Gates são avaliados antes de qualquer regra, inclusive antes de `sessionOverride`.
- O motivo precisa ser legível pelo modelo quando ele pediu o modo no spawn (texto
  `codeMode ignored: agent has no eval` no resultado da tool).
- Gate não é erro fatal: a sessão continua em modo normal.
- `eval` obrigatório no wire implica que nenhuma configuração pode produzir wire sem `eval`.

## Edge cases and failure modes

| Caso | Comportamento esperado |
| --- | --- |
| `evalAvailable: false` + spawn pedindo true | Off, `hard-gate:no-eval`, `denied.reason` preenchido |
| Frontmatter sem campo `tools` | Sem gate de agente; decide pelas regras |
| Frontmatter com `eval` na lista | Gate não dispara |
| Lista restrita vazia | Tratada como restrição sem `eval` → off `hard-gate:restricted` |
| Dois gates falham ao mesmo tempo | O primeiro na ordem documentada define `source` |

## Implementation parts

Não há parte não óbvia além da ordem dos gates, descrita em
[nano/scope-resolution-precedence.md](../nano/scope-resolution-precedence.md) (filho de
[micro/scope-precedence.md](scope-precedence.md)).
