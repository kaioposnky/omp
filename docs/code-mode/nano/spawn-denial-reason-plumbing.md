# Plumbing do motivo de recusa — Nano

Parent: [micro/spawn-code-mode-denial.md](../micro/spawn-code-mode-denial.md)

Code: `[planned] packages/coding-agent/src/code-mode/scope.ts#resolveCodeMode`, `packages/coding-agent/src/eval/agent-bridge.ts#runEvalAgent`, `packages/coding-agent/src/task/structured-subagent.ts#StructuredSubagentRequest`, `packages/coding-agent/src/task/eval-tools.ts#describeEvalTools`

## How it works

`resolveCodeMode` devolve `CodeModeDecision`; o hard gate de eval preenche `denied: { requested: true, reason: "agent has no eval" }` quando `spawnOverride === true` (ou frontmatter/scope pediu) e o agente não tem `eval`. O bridge não lança: ele injeta a frase no texto do resultado do job — `codeMode ignored: agent has no eval` — e segue com o filho em modo normal.

O ponto de decisão é o mesmo do host: `describeEvalTools`/`agent.tools` informam se o filho teria `eval`; `evalAvailable` do host é o gate global.

## Invariants

- `denied.reason` é a fonte única da mensagem; o texto ao modelo deriva dele.
- `requested: false` nunca produz mensagem.
- O spawn continua e o filho roda em modo normal quando a negação é por falta de eval.
- A mensagem aparece uma vez por job/request, mesmo com retries.

## Gotchas

- Se a mensagem for montada no kernel (prelude), o modelo a vê como output de código e não como resultado de `agent()`; montar no bridge mantém o contrato `agent()`.
- `workpool()` agrega vários requests: deduplicar por id do item, não por texto, para não perder itens distintos com o mesmo motivo.
- Negar **e** abortar o job (em vez de continuar em modo normal) deixa o modelo sem resultado do subagente; a recusa é informativa, não fatal.
- `hard-gate:no-eval` (host sem backend) e `hard-gate:agent-tools` (agente sem eval) produzem a mesma frase visível, mas motivos internos diferentes — `/code-mode status` usa o motivo interno, o resultado do spawn usa a frase.
- Não logar a frase como erro de tool (`ToolError`); ela precisa chegar como resultado bem-sucedido com aviso.

## Tarefa de implementação

- **Arquivos**: `packages/coding-agent/src/code-mode/scope.ts`, `packages/coding-agent/src/eval/agent-bridge.ts`, `packages/coding-agent/src/task/structured-subagent.ts`.
- **Passos**:
  1. Propagar `decision.denied` do host até `runEvalAgent`.
  2. Prefixar/appendizar `codeMode ignored: <reason>` no resultado do job quando `requested` e negado.
  3. Garantir filho em modo normal e execução normal do job.
- **Test IDs**: `CM-A2` em `packages/coding-agent/test/code-mode/spawn.test.ts`.
- **Done when**: o teste passa; nenhuma exceção é lançada no caminho negado e o texto contém a frase literal.
