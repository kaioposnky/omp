# Orçamento das router hints — Nano

Parent: [micro/token-economy-router-hints.md](../micro/token-economy-router-hints.md)

Code: `packages/coding-agent/src/code-mode/hints.ts`, `packages/coding-agent/src/session/session-tools.ts#getEnabledToolNames`, `packages/agent/src/compaction/pruning.ts#pruneSupersededToolResults`, `packages/coding-agent/src/commands/toks.ts`

## How it works

O produtor (pi-jev, ou qualquer extensão que chame a API de hints) devolve itens estruturados: skills (`{ name }`, k ≤ 3) e tools bridge-only (`{ name, signature }`, k ≤ 5). O host monta uma mensagem `customType: "router-hints"` e a anexa ao transcript **depois** da mensagem do usuário do turno.

Orçamento: serializar os itens e medir com o tokenizer offline (`natives.countTokens`, como em `packages/coding-agent/src/commands/toks.ts`). Se passar de 600 tokens, remover itens de menor score até caber; se nem o primeiro couber, não anexar. A mensagem nunca entra em `P`, então não invalida cache de prefixo; e hints antigos entram na mesma política de `pruneSupersededToolResults` quando ficam fora da janela de lookback.

## Invariants

- A mensagem de hints é sempre posterior à mensagem do usuário que a originou.
- `session.systemPrompt` não muda ao anexar hints.
- Conteúdo ≤ 600 tokens medidos no encoding do modelo do request.
- Uma mensagem por prompt, no máximo.
- Sem itens relevantes → nenhuma mensagem.

## Gotchas

- Anexar antes da mensagem do usuário coloca o conteúdo em uma posição que o provider pode tratar como prefixo — é exatamente o erro que `CM-E4` pega.
- Alternar `customType` ou o formato entre turnos muda bytes do transcript e pode invalidar cache do sufixo; manter formato estável.
- `pruneSupersededToolResults` usa posição/tokens do sufixo; hints muito grandes empurram os alvos para fora da janela e adiam poda — o orçamento de 600 tokens também protege isso.
- O tokenizer precisa ser o do modelo do request; usar `ClaudeV5` num request OpenAI subestima/superestima e o orçamento vira decorativo.
- Extensão que falha ao montar hints não pode abortar o turno: tratar como "sem hints".

## Tarefa de implementação

- **Arquivos**: `packages/coding-agent/src/code-mode/hints.ts` (novo), `packages/coding-agent/src/session/agent-session.ts` (ponto de anexação após o user message), `packages/coding-agent/src/extensibility/extensions/types.ts` (API opcional de hints, se exposta a extensões).
- **Passos**:
  1. Definir o contrato da mensagem (`customType: "router-hints"`, payload estruturado) e o orçamento.
  2. Implementar trim por score e rejeição quando nada cabe.
  3. Anexar após a mensagem do usuário, sem rebuild de prompt.
  4. Integrar com `pruneSupersededToolResults` no ciclo de manutenção.
- **Test IDs**: `CM-E4`, `CM-E5` em `packages/coding-agent/test/code-mode/token-economy.test.ts`.
- **Done when**: ambos passam; `systemPrompt` antes/depois é idêntico e a ordem das mensagens é asserida.
