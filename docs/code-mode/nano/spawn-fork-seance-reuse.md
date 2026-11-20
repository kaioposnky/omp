# Fork reutilizando o caminho do seance — Nano

Parent: [micro/spawn-agent-fork.md](../micro/spawn-agent-fork.md)

Code: `packages/coding-agent/src/task/seance.ts#prepareSeance`, `packages/coding-agent/src/task/seance.ts#PreparedSeanceSession`, `packages/coding-agent/src/task/structured-subagent.ts#StructuredSubagentRequest`, `packages/coding-agent/src/task/executor.ts`, `packages/coding-agent/src/session/session-manager.ts#SessionManager.forkFrom`, `packages/coding-agent/src/session/session-manager.ts#ForkSourceNotFoundError`, `packages/coding-agent/src/eval/agent-bridge.ts#agentArgsSchema`

## How it works

O executor já sabe fork: se `preparedSession.fork` existe, chama `SessionManager.forkFrom(fork.sourceFile, cwd, …, { sessionFile: subtaskSessionFile })` e recusa quando `subtaskSessionFile` é nulo ("The prepared session fork requires a persisted child session file."). `PreparedSeanceSession` é apenas `{ fork: { sourceFile }, promptSuffix }`.

Portanto `agent({ fork: true })` não precisa de um caminho novo:

1. O bridge exige que a sessão atual tenha arquivo (`request.session.getSessionFile()`); sem ele, erro claro antes de qualquer job.
2. Passa `fork: true` no `StructuredSubagentRequest`; o preflight monta o `PreparedSeanceSession` com `sourceSession` = arquivo do pai, em vez de exigir o agente `seance`.
3. `prepareSeance` passa a aceitar `invocationKind === "eval"` quando a origem é a própria sessão; as recusas de isolation e custom tools continuam.
4. O executor segue o ramo existente e o filho nasce com o histórico do pai.

## Invariants

- O arquivo do pai nunca é modificado pelo fork (`forkFrom` lê o arquivo de origem).
- O filho contém as mensagens anteriores do pai (histórico copiado), sem duplicar o header.
- `fork: true` sem arquivo de pai falha antes de criar sessão filha.
- `fork` e `codeMode` são ortogonais: um filho pode ser fork **e** Code Mode.
- O custo é explícito: cada fork re-lê o histórico; `eval-agents.md` documenta `fork?=False` e pede N pequeno.

## Gotchas

- `prepareSeance` hoje lança `"Seance requires the bundled task agent."` para `invocationKind !== "task"` **antes** de checar o agente; relaxar a condição na ordem errada libera isolation/custom tools por acidente.
- `sourceSession` é um seletor string; o arquivo do pai pode não existir em sessões `inMemory` — o erro precisa ser "sessão não persistida", não `ForkSourceNotFoundError`.
- `forkFrom` copia artifacts só com `copyArtifacts`; o ramo do executor já passa as opções corretas (`seance: true`, `resetInheritedCost: true`) — reutilizar, não reimplementar.
- `promptSuffix` do seance é específico daquele agente; para fork genérico, devolver string vazia evita injetar instruções de seance no filho.
- Forkar duas vezes a partir do mesmo arquivo gera dois arquivos filhos distintos; nenhum deve sobrescrever o outro (ids Snowflake).

## Tarefa de implementação

- **Arquivos**: `packages/coding-agent/src/eval/agent-bridge.ts` (schema `fork?`), `packages/coding-agent/src/task/structured-subagent.ts` (preflight), `packages/coding-agent/src/task/seance.ts` (aceitar eval da própria sessão), `packages/coding-agent/src/prompts/tools/eval-agents.md` (documentar `fork?`).
- **Passos**:
  1. Adicionar `"fork?": "boolean"` ao schema e `fork?: boolean` a `EvalAgentArgs`.
  2. No preflight, `fork === true` → exigir arquivo do pai e montar `PreparedSeanceSession` com `fork.sourceFile`.
  3. Relaxar a guarda de `prepareSeance` apenas para `invocationKind === "eval"` com origem na própria sessão.
  4. Propagar a mensagem de sessão não persistida.
- **Test IDs**: `CM-A4`, `CM-A5` em `packages/coding-agent/test/code-mode/spawn.test.ts`.
- **Done when**: ambos passam; um fork de sessão persistida contém mensagens do pai e o pai permanece byte-idêntico.
