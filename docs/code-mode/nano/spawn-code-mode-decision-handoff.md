# Handoff da decisão de Code Mode para o filho — Nano

Parent: [micro/spawn-agent-code-mode-param.md](../micro/spawn-agent-code-mode-param.md)

Code: `packages/coding-agent/src/eval/agent-bridge.ts#agentArgsSchema`, `packages/coding-agent/src/eval/agent-bridge.ts#EvalAgentArgs`, `packages/coding-agent/src/eval/agent-bridge.ts#runEvalAgent`, `packages/coding-agent/src/task/structured-subagent.ts#StructuredSubagentRequest`, `[planned] packages/coding-agent/src/code-mode/scope.ts#resolveCodeMode`

## How it works

`agent()` chega ao bridge como objeto. `agentArgsSchema` (`@oh-my-pi/omptype`) valida e `EvalAgentArgs` tipa. Adicionar `"codeMode?": "boolean"` ao schema e `codeMode?: boolean` à interface é o primeiro passo; sem isso o campo é **descartado em silêncio**: o schema declara `"+": "delete"`, ou seja, chaves não declaradas são removidas da cópia validada (comportamento verificado com um probe de `type({ prompt: "string>0", "+": "delete" })`).

Depois da validação, o host resolve a decisão do filho com `resolveCodeMode({ isMain: false, spawnOverride: codeMode, agent: { name, codeMode, tools }, role, modelId, settings, evalAvailable })` e passa o resultado no request (`StructuredSubagentRequest`). O filho não lê o estado mutável do pai: `sessionOverride` só vale para `isMain`.

## Invariants

- O schema do bridge e o request interno concordam no nome e no tipo do campo.
- `codeMode` ausente → precedência normal (frontmatter/scope/default), nunca herança do pai.
- A decisão é resolvida no host, antes do spawn; o kernel do filho não reavalia settings.
- O campo não altera o wire do pai nem o schema no prompt.

## Gotchas

- `@oh-my-pi/omptype` com `"+": "delete"` remove chaves não declaradas silenciosamente: esquecer de adicionar `codeMode` ao schema faz o pedido virar no-op, não erro — por isso `CM-A1` existe (probe: `type({ prompt: "string>0", "+": "delete" })({ prompt: "x", codeMode: true })` devolve `{"prompt":"x"}`).
- Adicionar o campo só em `EvalAgentArgs` (tipo TS) não afeta runtime; o schema é a fonte de verdade.
- `workpool()` itera os mesmos requests: o schema do item precisa aceitar `codeMode` (CM-A3), senão o campo é descartado por item.
- Precedência: `spawnOverride` vence frontmatter/scope, mas perde para hard gates — implementar na ordem do contrato, não na ordem de chegada dos campos.
- Propagação de `codeMode` no request não pode reutilizar o nome de outro campo existente (ex.: `tools`) para evitar ambiguidade de tipos.

## Tarefa de implementação

- **Arquivos**: `packages/coding-agent/src/eval/agent-bridge.ts`, `packages/coding-agent/src/task/structured-subagent.ts`, `packages/coding-agent/src/code-mode/scope.ts`.
- **Passos**:
  1. Estender `agentArgsSchema`/`EvalAgentArgs` com `codeMode?: boolean`.
  2. Estender `StructuredSubagentRequest` e o schema do item de task/workpool.
  3. Chamar `resolveCodeMode` com `isMain: false` e passar `decision.enabled`/`denied` adiante.
  4. Encaminhar `codeMode` do item de task até o executor.
- **Test IDs**: `CM-A1`, `CM-A3` em `packages/coding-agent/test/code-mode/spawn.test.ts`.
- **Done when**: os dois testes passam; um `agent({ prompt })` sem `codeMode` continua idêntico ao atual.
