# Escopo — Precedência e motivo — Micro

Parent: [macro/scope.md](../macro/scope.md)

## Requirement statement

`resolveCodeMode` aplica a escada "gates duros > sessão (só main) > spawn > frontmatter >
scope.agents > scope.models > scope.roles > scope.main/default" e devolve `source` e `detail` que
explicam a decisão, sem que o filho herde o estado do pai.

## Acceptance criteria

- [ ] **CM-S1** `packages/coding-agent/test/code-mode/scope.test.ts` — tabela de precedência: cada
  degrau vence todos os abaixo dele.
- [ ] **CM-S6** `packages/coding-agent/test/code-mode/scope.test.ts` — filho não herda o estado do
  pai: com `isMain: false`, `sessionOverride` é ignorado.
- [ ] **CM-S9** `packages/coding-agent/test/code-mode/scope.test.ts` — toda decisão carrega `source`
  e `detail` utilizáveis por `/code-mode status` (por exemplo `scope.roles` / `smol`).

## Constraints

- A resolução é pura e acontece **depois** da escolha de modelo, porque role e glob dependem dele.
- `sessionOverride` só tem efeito com `isMain: true`.
- O resultado é congelado na sessão; troca de modelo no meio da conversa não o reavalia.
- `detail` nunca pode conter segredo: agente, role, glob casado e motivo apenas.

## Edge cases and failure modes

| Caso | Comportamento esperado |
| --- | --- |
| Nenhuma regra casa e não é main | `default` com `detail` indicando default |
| `isMain: false` + `sessionOverride: true` | Override ignorado; decide pelas regras |
| `source` de degrau superior presente com valor contrário | Degrau superior vence |
| `source` inesperado na decisão | `/code-mode status` mostra literal; nada quebra |

## Implementation parts

- [nano/scope-resolution-precedence.md](../nano/scope-resolution-precedence.md) — ordem exata,
  representação de `source`/`detail` e por que a função é pura.
