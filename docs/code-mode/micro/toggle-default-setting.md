# Toggle — Default persistente — Micro

Parent: [macro/toggle.md](../macro/toggle.md)

## Requirement statement

`codeMode.default` define o estado inicial de toda sessão nova: `true` liga o Code Mode, `false`
desliga, e o valor de fábrica é `true` (decidido pelas medições em
[token-economy-model-behaviors.md](token-economy-model-behaviors.md)).

## Acceptance criteria

- [ ] **CM-T1** `packages/coding-agent/test/code-mode/toggle.test.ts` — com `codeMode.default`
  verdadeiro, uma sessão nova criada sem opção explícita nasce com `isCodeModeActive() === true`;
  com o default falso, nasce inativa.

## Constraints

- O default é lido na criação da sessão e congelado; mudar o setting depois não altera sessões
  existentes.
- O default não vence flags de CLI nem override de spawn — só fornece o último degrau da decisão.
- A leitura precisa funcionar via id string (`Settings.isolated({ "codeMode.default": true })`), sem
  depender de import de símbolo planejado.

## Edge cases and failure modes

| Caso | Comportamento esperado |
| --- | --- |
| Setting ausente no arquivo | Default de fábrica `true` |
| Valor com tipo errado no YAML | Validação do setting rejeita; sessão usa o default de fábrica (`true`) |
| `codeMode.default` true mas backend de `eval` ausente | Gate duro vence: sessão inativa |
| Setting mudado durante a sessão | Sessão atual mantém o estado congelado |

## Implementation parts

Não há parte não óbvia: a implementação é a leitura do setting no caminho de criação da sessão.
