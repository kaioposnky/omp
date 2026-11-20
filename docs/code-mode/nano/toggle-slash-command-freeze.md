# Toggle — `/code-mode` e congelamento de estado — Nano

Parent: [micro/toggle-slash-command.md](../micro/toggle-slash-command.md)

## Code locators

- `packages/coding-agent/src/slash-commands/builtin-modes.ts#BUILTIN_MODE_SLASH_COMMANDS` — registro
  dos comandos de modo.
- `packages/coding-agent/src/slash-commands/builtin-modes.ts#refreshStatusLine` — repaint da status
  line após mudança de estado.
- `packages/coding-agent/src/slash-commands/builtin-modes.ts:551` — comando `/fast`, o padrão a
  seguir (`handle`, `handleTui`, `getTuiAutocompleteDescription`, `refreshStatusLine`).
- `packages/coding-agent/src/session/agent-session.ts#AgentSession` — estado de tools e mensagens da
  sessão.
- `packages/coding-agent/src/session/session-manager.ts#SessionManager.forkFrom` — herança de estado.
- `packages/coding-agent/src/session/session-manager.ts#SessionManager.inMemory` — fixture de teste.
- `[planned] packages/coding-agent/src/session/agent-session.ts#AgentSession.isCodeModeActive`
- `[planned] packages/coding-agent/src/session/agent-session.ts#AgentSession.getCodeModeDecision`
- `[planned] packages/coding-agent/src/sdk.ts#createAgentSession` — opção `codeMode` e resolução do
  default.

## How it works

O estado é resolvido **na criação** da sessão (`createAgentSession`) e gravado junto do snapshot de
sessão. Nada no resto do ciclo de vida o recalcula: `isCodeModeActive()` devolve o valor congelado;
`getCodeModeDecision()` devolve a decisão registrada com `source`/`detail` (e, quando houver,
`denied`).

`/code-mode on` e `/code-mode off` respeitam essa regra:

- **Sessão com mensagens** → não tocam a sessão atual. Abrem uma sessão nova com o override pedido,
  como `/new` com estado explícito, preservando cwd, modelo e lista de tools pedida pelo usuário.
- **Sessão vazia** → aplicam no lugar: reparticionam o slate, trocam o wire e reconstroem o prompt.
  Isso é seguro porque não há histórico para invalidar; a partir da primeira mensagem, o estado volta
  a ser imutável.
- **`default on|off`** → só gravam `codeMode.default`; a sessão atual e a decisão congelada ficam
  intactas.
- **`status`** → leitura pura: estado efetivo, origem, contagem de bridge-only e motivo de negação.

O patch de wire e bridge precisa ser atômico: primeiro calcule `{ topLevel, bridgeOnly }`, depois
aplique os dois. Aplicar um sem o outro deixa a sessão com tools inalcançáveis — o modo mais fácil de
"perder" `read` e `edit` ao mesmo tempo.

## Invariants

- Com `messageCount > 0`, nenhum subcomando muda `isCodeModeActive()` nem o wire da sessão atual.
- `on` numa sessão vazia termina com wire igual ao de uma sessão nova no mesmo estado.
- `default on|off` não altera a sessão atual, apenas o setting.
- `status` não tem efeito colateral.
- Estado gravado no arquivo é o efetivo; retomar mantém o valor mesmo com default oposto.
- Fork copia o estado da origem; não resolve a regra de novo.

## Gotchas

- **Meia aplicação.** Trocar só `agent.state.tools` e esquecer `bridgeOnly` remove o acesso a todas
  as tools removidas; trocar só `bridgeOnly` deixa o wire cheio. Sempre aplique os dois juntos.
- **`messageCount` não é "tem texto no input".** Use a lista de mensagens da sessão; rascunho no
  editor não conta.
- **Prompt rebuild na sessão vazia** é obrigatório: o bloco de Code Mode e o catálogo do bridge
  precisam entrar no prompt; sem isso o modelo vê wire mínimo e nenhuma instrução de como usar.
- **`refreshStatusLine` depois da troca.** Sem o repaint, o ícone só aparece no próximo evento.
- **Gate duro antes de criar sessão.** Pedir `on` sem backend de `eval` não pode produzir uma sessão
  nova inútil; reporte o motivo e mantenha o modo normal.
- **Fork não é "aplicar regra".** Herdar o estado gravado é o comportamento correto mesmo que a
  regra atual, reavaliada, dissesse outra coisa.

## Tarefa de implementação

**Arquivos possuídos**

- `packages/coding-agent/src/slash-commands/builtin-modes.ts`
- `packages/coding-agent/src/session/agent-session.ts`
- `packages/coding-agent/src/session/session-manager.ts`

**Passos**

1. Exponha `isCodeModeActive()`, `getCodeModeDecision()` e `getBridgeOnlyToolNames()` na sessão,
   lendo o estado congelado.
2. Persista o estado no snapshot de sessão e copie-o em `forkFrom`; ao retomar, prefira o valor
   gravado ao default.
3. Registre o spec `/code-mode` com `subcommands` `on`, `off`, `status`, `default` e os campos TUI;
   implemente a regra "sessão cheia → sessão nova; vazia → no lugar".
4. Chame `refreshStatusLine` em toda mudança efetiva.
5. Rode o typecheck e o gate de `toggle.test.ts`.

**Test IDs:** CM-T5, CM-T6 (slash); CM-T3, CM-T4 (persistência/fork).

**Done when:** `bun test --todo test/code-mode/toggle.test.ts` marca CM-T3..CM-T6 como prontos, com
`/code-mode on` numa sessão cheia deixando o wire atual byte-idêntico.
