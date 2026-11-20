# Economia de tokens — Router hints no sufixo — Micro

Parent: [macro/token-economy.md](../macro/token-economy.md)

## Requirement statement

As sugestões do roteador viram uma mensagem própria (`customType: "router-hints"`) anexada depois da mensagem do usuário, nunca alterando o system prompt, e o conteúdo respeita um orçamento fixo de 600 tokens.

## Acceptance criteria

- [ ] A mensagem de hints é posicionada depois da mensagem do usuário e não altera o `systemPrompt` — `CM-E4`, `packages/coding-agent/test/code-mode/token-economy.test.ts`.
- [ ] Hints que passariam de 600 tokens são cortados ou rejeitados — `CM-E5`, `packages/coding-agent/test/code-mode/token-economy.test.ts`.

## Constraints

- Orçamento fixo de ≤ 600 tokens por prompt; confiança abaixo do limiar não anexa nada (`docs/code-mode-plan.md` §12.4).
- Conteúdo: top-k skills (`skill://<nome>`, k ≤ 3) e top-k tools bridge-only com assinatura TS inline (k ≤ 5, ~60 tokens cada); incluir a assinatura evita o round-trip de `tool.describe`.
- Hints antigos são candidatos a `pruneSupersededToolResults` / aviso de resultado inútil quando ficam fora da janela de lookback do cache (`packages/agent/src/compaction/pruning.ts#pruneSupersededToolResults`).
- A mensagem não pode ser inserida no prefixo nem reordenar mensagens anteriores.

## Edge cases and failure modes

| Caso | Comportamento esperado |
|---|---|
| Roteador sem confiança suficiente | Nenhuma mensagem anexada; turno segue normal |
| Hints acima de 600 tokens | Corta os itens de menor score até caber ou descarta a mensagem inteira — nunca ultrapassa o orçamento |
| Nenhuma tool bridge-only / nenhuma skill | Não anexa mensagem vazia |
| Múltiplos prompts no mesmo turno (`sendUserMessage`) | Cada prompt recebe no máximo uma mensagem de hints, depois dele |
| Sessão retomada com hints antigos | Hints antigos não são reescritos; o pruning os trata como resultados obsoletos |
| Roteador falha/lança | Turno continua sem hints (o roteamento nunca quebra o agent turn) |

## Implementation parts

- [nano/token-economy-router-hints-budget.md](../nano/token-economy-router-hints-budget.md)
