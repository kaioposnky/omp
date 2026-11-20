# Toggle — Flags de CLI — Micro

Parent: [macro/toggle.md](../macro/toggle.md)

## Requirement statement

`--code-mode` e `--no-code-mode` sobrepõem o default apenas para o processo atual, e a ausência de
ambas produz `Args.codeMode === undefined` para que a decisão caia nas regras.

## Acceptance criteria

- [ ] **CM-T2** `packages/coding-agent/test/code-mode/toggle.test.ts` —
  `parseArgs(["--code-mode"]).codeMode === true`; `parseArgs(["--no-code-mode"]).codeMode === false`;
  sem as flags, `codeMode` é `undefined`.

## Constraints

- A flag é booleana e não consome valor; a classificação de flags do CLI precisa continuar
  consistente entre `parseArgs` e o pré-parser de perfil
  (`packages/coding-agent/src/cli/flag-tables.ts`).
- A flag não grava settings: é override de processo.
- `--code-mode` não pode ser aceita em conjunto com valor (`--code-mode=true` é erro de uso).

## Edge cases and failure modes

| Caso | Comportamento esperado |
| --- | --- |
| Ambas as flags presentes | A última vence (comportamento padrão do parser) |
| Flag com valor separado | Erro de uso, como outras flags booleanas |
| Flag em subcomando que não cria sessão | Ignorada sem erro |
| Default do usuário true + `--no-code-mode` | Sessão inativa neste processo |

## Implementation parts

Não há parte não óbvia: a implementação é uma entrada em `Args`, um ramo no laço de flags
booleanas de `parseArgs` e o repasse até a criação da sessão.
