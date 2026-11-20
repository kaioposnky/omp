# Toggle — Persistência, resume e fork — Micro

Parent: [macro/toggle.md](../macro/toggle.md)

## Requirement statement

O estado efetivo de Code Mode fica gravado no arquivo de sessão; retomar a sessão mantém o estado
gravado mesmo com default oposto, e um fork herda o estado da origem.

## Acceptance criteria

- [ ] **CM-T3** `packages/coding-agent/test/code-mode/toggle.test.ts` — o estado é persistido no
  arquivo de sessão; ao retomar (`resume`) com `codeMode.default` oposto, vale o estado registrado,
  não o default.
- [ ] **CM-T4** `packages/coding-agent/test/code-mode/toggle.test.ts` — `SessionManager.forkFrom`
  produz uma sessão filha que herda o estado de Code Mode da origem.

## Constraints

- O valor gravado é o estado **efetivo**, não a origem da decisão; `source`/`detail` são recalculados
  ao vivo para `status` e para o indicador.
- Sessões antigas sem o campo precisam abrir normalmente: ausência equivale ao default resolvido no
  momento da retomada.
- Fork não pode recalcular a regra de escopo: herda o que a origem tinha.
- Sessão não persistida não pode fingir persistência: o campo só existe com arquivo de sessão.

## Edge cases and failure modes

| Caso | Comportamento esperado |
| --- | --- |
| Sessão antiga sem campo `codeMode` | Abre com o default atual; grava na próxima escrita |
| Resume com flag de CLI contrária | A flag vence naquele processo (precedência de override) |
| Fork de sessão sem arquivo em disco | Erro claro, sem filho parcial |
| Arquivo corrompido no campo | Campo ignorado e default aplicado; restauração não falha |

## Implementation parts

Não há parte não óbvia: a gravação acompanha o snapshot de sessão existente e o fork copia o campo.
