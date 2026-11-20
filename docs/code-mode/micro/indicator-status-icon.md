# Indicador — Ícone, tema e snapshot de startup — Micro

Parent: [macro/indicator.md](../macro/indicator.md)

## Requirement statement

Quando a sessão está em Code Mode, o segmento de modelo renderiza `icon.codeMode`; o símbolo existe
nos conjuntos unicode e nerd, e o snapshot de startup aceita e devolve o campo `codeMode`.

## Acceptance criteria

- [ ] **CM-I1** `packages/coding-agent/test/code-mode/indicator.test.ts` — o segmento de modelo
  renderiza `icon.codeMode` quando `isCodeModeActive()` é true e não renderiza quando é false.
- [ ] **CM-I3** `packages/coding-agent/test/code-mode/indicator.test.ts` — o validador do snapshot de
  startup aceita e faz round-trip de um campo `codeMode` booleano.
- [ ] **CM-I4** `packages/coding-agent/test/code-mode/indicator.test.ts` — o tema define
  `icon.codeMode` nos dois conjuntos de símbolos (unicode e nerd).

## Constraints

- O status line lê o estado pelo host, no mesmo nível de `isFastModeActive`
  (`packages/tui/src/status-line/host.ts#StatusLineHost`); não importa `AgentSession` diretamente.
- O ícone não pode roubar largura de outros segmentos nem aparecer quando o estado é falso.
- O snapshot de startup é retrocompatível: ausência de `codeMode` não pode invalidar o snapshot.
- O tema é a fonte única do glifo; não hardcode o caractere no segmento.

## Edge cases and failure modes

| Caso | Comportamento esperado |
| --- | --- |
| Tema sem `icon.codeMode` | Segmento não desenha nada, sem erro |
| Snapshot antigo sem o campo | Validado como ausente/false; startup continua |
| Campo com tipo errado | Snapshot rejeitado como hoje, sem crash |
| Modo ativo durante streaming | Ícone permanece estável (sem re-render desnecessário) |

## Implementation parts

- [nano/indicator-status-line-invalidation.md](../nano/indicator-status-line-invalidation.md) —
  quando o componente é invalidado, por que a comparação de estado importa e como não piscar a cada
  frame.
