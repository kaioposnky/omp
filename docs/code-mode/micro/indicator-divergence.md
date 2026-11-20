# Indicador — Divergência regra × estado — Micro

Parent: [macro/indicator.md](../macro/indicator.md)

## Requirement statement

Quando a regra de escopo atual aponta para um estado diferente do estado congelado da sessão, o
ícone continua visível mas em estilo esmaecido, distinguível do ícone ativo.

## Acceptance criteria

- [ ] **CM-I2** `packages/coding-agent/test/code-mode/indicator.test.ts` — numa sessão com
  divergência entre a decisão de escopo e o estado congelado, o segmento renderiza o ícone
  esmaecido, com estilo diferente do ícone ativo.

## Constraints

- Divergência é informativa: não muda o comportamento da sessão nem o wire.
- O estado "sem ícone" continua reservado para sessão inativa.
- O estilo precisa ser verificável por `renderSegment` (string/estilo), não por inspeção de
  componente interno.
- Trocar de modelo não reavalia o estado, só a regra; é exatamente o caso que produz divergência.

## Edge cases and failure modes

| Caso | Comportamento esperado |
| --- | --- |
| Sessão inativa com regra favorável | Ícone esmaecido (divergência), não ativo |
| Sessão ativa com regra contrária | Ícone esmaecido, não ausente |
| Regra e estado iguais | Ícone ativo, sem estilo de divergência |
| `source` desconhecido | Trata como divergente apenas se `enabled` diferir |

## Implementation parts

O mecanismo de invalidação e a comparação de estado estão descritos em
[nano/indicator-status-line-invalidation.md](../nano/indicator-status-line-invalidation.md), que é
filho de [micro/indicator-status-icon.md](indicator-status-icon.md).
