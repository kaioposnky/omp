# Escopo — Precedência e forma da decisão — Nano

Parent: [micro/scope-precedence.md](../micro/scope-precedence.md)

## Code locators

- `packages/coding-agent/src/code-mode/scope.ts#resolveCodeMode`
- `packages/coding-agent/src/code-mode/scope.ts#CodeModeResolveInput`
- `packages/coding-agent/src/code-mode/scope.ts#CodeModeDecision`
- `packages/coding-agent/src/code-mode/settings.ts#CodeModeScope`
- `packages/coding-agent/src/config/model-resolver.ts` — resolução de role/modelo que fornece `role`
  e `provider/id` antes da chamada.
- `packages/coding-agent/src/task/structured-subagent.ts` — caminho de spawn onde a decisão do filho
  é calculada depois da escolha de modelo.
- `packages/coding-agent/src/session/agent-session.ts#AgentSession` — consumidor que congela a
  decisão.
- `packages/coding-agent/src/config/registry.ts#register` — registro do setting com `validate`.

## How it works

`resolveCodeMode` é uma função pura: recebe tudo o que precisa e não toca settings, sessão nem
modelos. A ordem de avaliação é fixa e curta-circuita no primeiro degrau que decide:

1. `!evalAvailable` → `enabled: false`, `source: "hard-gate:no-eval"`.
2. `agent.tools` presente e sem `eval` → `false`, `source: "hard-gate:agent-tools"`,
   `denied.reason` com "agent has no eval".
3. `restrictedToolNames` presente e sem `eval` → `false`, `source: "hard-gate:restricted"`.
4. `isMain && sessionOverride !== undefined` → `source: "session"`.
5. `spawnOverride !== undefined` → `source: "spawn"`.
6. `agent.codeMode !== undefined` → `source: "frontmatter"`.
7. `scope.agents[agent.name]` → `source: "scope.agents"`, `detail` com o nome.
8. `scope.models`: primeiro padrão que casa com `modelId` → `source: "scope.models"`, `detail` com o
   padrão.
9. `scope.roles[role]` → `source: "scope.roles"`, `detail` com a role.
10. `isMain && scope.main !== undefined` → `source: "scope.main"`.
11. senão `settings.default` → `source: "default"`.

`denied` só aparece quando um pedido explícito (spawn ou sessão) foi recusado por um gate duro ou
por regra inferior; `requested` registra o pedido e `reason` o motivo legível. `detail` é texto curto
para `/code-mode status`; não carrega objetos.

A pureza é o que permite testar a escada em tabela (CM-S1) sem criar sessão. O congelamento fica no
chamador: `createAgentSession` e o spawn guardam a decisão; ninguém a recalcula no meio da conversa.

## Invariants

- Gates duros são avaliados antes de qualquer override e nunca são sobrepostos.
- `sessionOverride` só é consultado com `isMain: true`; filho não herda estado.
- `spawnOverride` vence frontmatter, que vence `scope.agents`, que vence `scope.models`, que vence
  `scope.roles`, que vence `scope.main`/default.
- A decisão sempre tem exatamente um `source` do conjunto fechado do contrato.
- A função não lança para entrada bem formada; campos opcionais ausentes apenas pulam degraus.
- A mesma entrada produz a mesma saída (sem leitura de settings dentro da função).

## Gotchas

- **`isMain` esquecido.** Aplicar `sessionOverride` em filho faz o subagente herdar o modo do pai,
  exatamente o comportamento que a decisão de risco proíbe.
- **Ordem de gates.** "Sem eval" precisa vir antes de tudo; um frontmatter com `codeMode: true` e
  `tools` sem `eval` deve produzir `hard-gate:agent-tools`, não `frontmatter`.
- **`source` genérico.** Devolver `"default"` quando uma regra casou esconde o motivo de `/code-mode
  status`; o teste CM-S9 verifica o par `source`/`detail`.
- **Modelo ainda não resolvido.** Chamar a função antes da escolha de modelo faz `scope.models` e
  `scope.roles` nunca casarem; o ponto de chamada no spawn é depois da resolução.
- **`planMode`.** Entra na entrada como contexto; nenhuma regra atual o usa para virar o modo, mas
  ele não pode ser confundido com override.
- **Role vazia.** `role` ausente ou `undefined` deve pular o degrau, não casar `scope.roles[""]`.

## Tarefa de implementação

**Arquivos possuídos**

- `packages/coding-agent/src/code-mode/scope.ts`
- `packages/coding-agent/src/code-mode/settings.ts` (apenas os tipos exportados)

**Passos**

1. Declare `CodeModeScope`, `CodeModeResolveInput` e `CodeModeDecision` conforme o contrato.
2. Implemente `resolveCodeMode` como cadeia de retornos antecipados na ordem acima, sem I/O.
3. Garanta `denied` preenchido quando um pedido explícito for recusado.
4. Rode `bun test --todo test/code-mode/scope.test.ts` e confirme CM-S1, CM-S6 e CM-S9 prontos.

**Test IDs:** CM-S1, CM-S6, CM-S9.

**Done when:** a tabela de precedência passa e `detail`/`source` distinguem cada degrau sem consultar
estado externo.
