# Needle 3 — Fixture de schemas — Micro

Parent: [macro/needle.md](../macro/needle.md)

## Requirement statement

O spike possui um script que cria uma sessão real do omp e grava o wire schema de cada tool alvo em uma fixture JSON congelada, para que a medição use os schemas reais (não versões simplificadas).

## Acceptance criteria

- [ ] `bun needle-spike/dump-schemas.ts` a partir de `harnesses-improver/` grava `needle-spike/fixtures/tool-schemas.json` com o wire schema de cada tool alvo registrada na sessão — `NDL-1`, `needle-spike/dump-schemas.ts`.

## Constraints

- O script vive **fora** do fork, em `harnesses-improver/needle-spike/` (RF5.1); importa os fontes do fork por caminho relativo para não resolver os pacotes publicados no cache do bun (`needle-spike/dump-schemas.ts`).
- Fonte do schema: `packages/ai/src/utils/schema/wire.ts#toolWireSchema` — o mesmo que o wire usa.
- Conjunto alvo documentado no script: `read`, `grep`, `glob`, `todo`, `edit`, `write`, `bash`, `eval`, `web_search`, `task`, `wait`, `yield`, `ask`; tools não registradas são puladas.
- Requer `bun install --frozen-lockfile` uma vez em `oh-my-pi/`; a fixture é determinística o suficiente para ser commitada.
- Nenhuma dependência Python entra neste passo.

## Edge cases and failure modes

| Caso | Comportamento esperado |
|---|---|
| Tool alvo não registrada no host | Pulada, com aviso; fixture não quebra |
| Schemas com campos específicos do host (`customWireName`) | Serializados como o wire vê, não normalizados à mão |
| Execução sem `bun install` no fork | Erro de resolução de import; mensagem aponta o comando |
| Fixture já existente | Regenerada por inteiro; o script é a fonte da verdade |
| Diretório `fixtures/` ausente | Criado pelo script (`mkdir` recursivo) |

## Implementation parts

- [nano/needle-spike-capture.md](../nano/needle-spike-capture.md)
